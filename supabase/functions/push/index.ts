// Sends FlatApp notifications to phones through Firebase Cloud Messaging (HTTP v1).
//
// Called only by the database (trigger public.push_new_notifications, through pg_net) with
// { messages: [{ token, title, body, data }] } and the header x-push-secret, which must equal the
// Vault secret `push_webhook_secret`. Deployed with --no-verify-jwt because the caller is the
// database, not a signed-in person; the shared secret is the check instead.
//
// Needs the function secret FCM_SERVICE_ACCOUNT_B64: the Firebase service-account key file
// (Project settings -> Service accounts -> Generate new private key), base64-encoded.
import postgres from 'npm:postgres@3.4.5';

interface Message {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

/** The Android channel the app creates at start-up; FCM shows the notification there. */
const CHANNEL_ID = 'flat-updates';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL') ?? '', { max: 1, prepare: false, idle_timeout: 20 });

let webhookSecret: string | null = null;
async function expectedSecret(): Promise<string> {
  if (webhookSecret === null) {
    const rows = await sql<{ s: string }[]>`select decrypted_secret as s from vault.decrypted_secrets where name = 'push_webhook_secret'`;
    webhookSecret = rows[0]?.s ?? '';
  }
  return webhookSecret;
}

function serviceAccount(): ServiceAccount {
  const b64 = Deno.env.get('FCM_SERVICE_ACCOUNT_B64');
  if (!b64) throw new Error('FCM_SERVICE_ACCOUNT_B64 is not set');
  const json = new TextDecoder().decode(Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0)));
  return JSON.parse(json) as ServiceAccount;
}

function base64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let cachedToken: { value: string; expires: number } | null = null;

/** A Google OAuth access token for FCM, from a JWT signed with the service-account key. */
async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expires - 60 > now) return cachedToken.value;

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`)));
  const assertion = `${header}.${claims}.${base64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`Google token request failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expires: now + body.expires_in };
  return body.access_token;
}

/** Sends one message; returns true when the token is dead and should be forgotten. */
async function send(sa: ServiceAccount, token: string, m: Message): Promise<boolean> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: m.token,
        notification: { title: m.title, body: m.body },
        data: m.data,
        android: {
          priority: 'HIGH',
          notification: { channel_id: CHANNEL_ID, tag: m.data.notification_id },
        },
      },
    }),
  });
  if (res.ok) return false;
  const text = await res.text();
  const dead = res.status === 404 || (res.status === 400 && /registration token|UNREGISTERED|INVALID_ARGUMENT/i.test(text));
  console.warn(`FCM ${res.status} for a token${dead ? ' (forgetting it)' : ''}: ${text.slice(0, 300)}`);
  return dead;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const given = req.headers.get('x-push-secret') ?? '';
  const expected = await expectedSecret();
  if (expected === '' || given !== expected) return new Response('Forbidden', { status: 403 });

  const { messages } = (await req.json()) as { messages?: Message[] };
  if (!Array.isArray(messages) || messages.length === 0) return Response.json({ sent: 0 });

  let sa: ServiceAccount;
  try {
    sa = serviceAccount();
  } catch (e) {
    console.error(String(e));
    return Response.json({ error: 'Push is not set up yet' }, { status: 503 });
  }

  const token = await accessToken(sa);
  const results = await Promise.all(messages.map((m) => send(sa, token, m).catch((e) => (console.error(String(e)), false))));
  const dead = messages.filter((_, i) => results[i]).map((m) => m.token);
  if (dead.length > 0) await sql`delete from public.push_tokens where token = any(${dead})`;

  return Response.json({ sent: messages.length - dead.length, forgotten: dead.length });
});
