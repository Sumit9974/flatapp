import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import { supabase } from '../lib/supabase';

/** The Android channel phone notifications arrive on (the server's push function uses the same id). */
export const PUSH_CHANNEL_ID = 'flat-updates';
const TOKEN_KEY = 'flatapp.pushToken';

/** on: this phone gets notifications. off: not allowed yet. blocked: denied; only phone settings can change it. */
export type PushState = 'on' | 'off' | 'blocked' | 'unavailable';

export async function ensurePushChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: 'Flat updates',
    description: 'Dinner, bills, the buy list, notices, polls and repairs',
    // eslint-disable-next-line import/namespace -- see notify.ts: exported at runtime, the parser misses it
    importance: Notifications.AndroidImportance.HIGH,
  });
}

function storedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function saveToken(token: string): Promise<void> {
  const { error } = await supabase.rpc('register_push_token', { p_token: token });
  if (error) throw error;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Only used to unregister at sign-out; the server still has the token.
  }
}

/** Current permission, without asking. */
export async function pushState(): Promise<PushState> {
  if (Platform.OS !== 'android') return 'unavailable';
  const perm = await Notifications.getPermissionsAsync();
  if (perm.granted) return 'on';
  return perm.canAskAgain ? 'off' : 'blocked';
}

/**
 * Turns phone notifications on: asks for permission when `ask` is true and Android still allows
 * asking, then sends this phone's Firebase token to the server.
 */
export async function enablePush(ask: boolean): Promise<PushState> {
  if (Platform.OS !== 'android') return 'unavailable';
  await ensurePushChannel();
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && ask && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return perm.canAskAgain ? 'off' : 'blocked';
  const { data } = await Notifications.getDevicePushTokenAsync();
  await saveToken(String(data));
  return 'on';
}

/** Firebase can rotate the token; keep the server's copy current. Returns the unsubscribe. */
export function watchPushToken(): () => void {
  const sub = Notifications.addPushTokenListener((t) => {
    saveToken(String(t.data)).catch(() => undefined);
  });
  return () => sub.remove();
}

/** At sign-out: this phone stops getting the person's notifications. */
export async function forgetThisPhone(): Promise<void> {
  const token = storedToken();
  if (token === null) return;
  await supabase.rpc('unregister_push_token', { p_token: token });
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // nothing to clean up
  }
}

export function openPhoneSettings(): void {
  void Linking.openSettings();
}
