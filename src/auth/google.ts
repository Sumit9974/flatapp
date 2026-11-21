import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';

/** Must also be listed in Supabase → Authentication → URL configuration → Redirect URLs. */
export const AUTH_REDIRECT = 'flatapp://auth-callback';

export class GoogleNotEnabledError extends Error {
  constructor() {
    super('Google sign-in is not switched on yet. Use email and password for now.');
  }
}

async function googleEnabled(): Promise<boolean> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    const body = (await res.json()) as { external?: { google?: boolean } };
    return body.external?.google === true;
  } catch {
    return true; // let the real attempt report the problem
  }
}

/** Opens Google in the browser; resolves 'ok' when signed in, 'cancelled' if the person backed out. */
export async function signInWithGoogle(): Promise<'ok' | 'cancelled'> {
  if (!(await googleEnabled())) throw new GoogleNotEnabledError();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_REDIRECT);
  if (result.type !== 'success') return 'cancelled';

  const url = new URL(result.url);
  const code = url.searchParams.get('code');
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return 'ok';
  }
  const problem = url.searchParams.get('error_description');
  throw new Error(problem ?? 'Google sign-in did not finish. Try again.');
}
