import { supabase } from '../lib/supabase';

/**
 * Home/Out crossings that have not reached the server yet. They are kept on the phone (the same
 * SQLite-backed localStorage as the session), so a crossing survives a failed call, the app being
 * killed and a phone restart. Leaving the flat is when the phone drops off the flat's WiFi, so the
 * first try often fails; the queue is sent again on the next crossing, the next background check-in
 * (about every 30 minutes, only while online) and whenever the app opens.
 *
 * Only the latest crossing per flat is kept: presence is a state, not a history. Each one carries the
 * time it happened, so the server can keep "since" true and ignore anything older than what it has.
 *
 * No timers here on purpose: this runs inside background tasks, where React Native may not fire
 * setTimeout while the app is not in front.
 */

export type PresenceState = 'home' | 'out';

interface Pending {
  state: PresenceState;
  /** When the phone crossed the circle (ISO, UTC). */
  at: string;
}

type PendingMap = Record<string, Pending>;

const PENDING_KEY = 'flatapp.presence.pending';

/** Errors that sending again cannot fix: not in the flat (or signed out), or a malformed call. */
const PERMANENT = new Set(['42501', '22023']);

/** PostgREST's "no such function": the database is not migrated yet, so try the older call. */
const NO_SUCH_FUNCTION = 'PGRST202';

function readPending(): PendingMap {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingMap) : {};
  } catch {
    return {};
  }
}

function writePending(map: PendingMap): void {
  try {
    if (Object.keys(map).length === 0) localStorage.removeItem(PENDING_KEY);
    else localStorage.setItem(PENDING_KEY, JSON.stringify(map));
  } catch {
    // Storage failing must never break the background task; the next crossing writes it again.
  }
}

type Outcome = 'sent' | 'retry' | 'drop';

async function send(flatId: string, p: Pending): Promise<Outcome> {
  try {
    let { error } = await supabase.rpc('report_presence', { p_flat: flatId, p_state: p.state, p_at: p.at });
    if (error?.code === NO_SUCH_FUNCTION) {
      ({ error } = await supabase.rpc('report_presence', { p_flat: flatId, p_state: p.state }));
    }
    if (!error) return 'sent';
    return PERMANENT.has(error.code) ? 'drop' : 'retry';
  } catch {
    return 'retry';
  }
}

/** Sends everything waiting, once. Returns how many reports are still waiting afterwards. */
export async function flushPresence(): Promise<number> {
  for (const [flatId, p] of Object.entries(readPending())) {
    if ((await send(flatId, p)) === 'retry') continue;
    // Forget it only if no newer crossing for this flat was queued while the call was in flight.
    const latest = readPending();
    if (latest[flatId]?.at === p.at) {
      delete latest[flatId];
      writePending(latest);
    }
  }
  return Object.keys(readPending()).length;
}

/** Queues a crossing (unless a newer one is already waiting) and tries to send it straight away. */
export async function reportPresence(flatId: string, state: PresenceState, at: Date = new Date()): Promise<void> {
  const pending = readPending();
  const iso = at.toISOString();
  const waiting = pending[flatId];
  if (!waiting || waiting.at <= iso) {
    pending[flatId] = { state, at: iso };
    writePending(pending);
  }
  await flushPresence();
}

/** On sign-out: try to deliver what is waiting, then forget it so it is never sent as someone else. */
export async function clearPresenceQueue(): Promise<void> {
  await flushPresence().catch(() => 0);
  writePending({});
}
