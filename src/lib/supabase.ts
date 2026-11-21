import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import type { Database } from './database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY must be set (see .env.local).');
}

/** The one Supabase client. The session is kept in SQLite-backed localStorage on the phone. */
export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // Google sign-in returns a one-time code to flatapp://auth-callback, exchanged in auth/google.ts.
    flowType: 'pkce',
  },
});

// Refresh the session token only while the app is in front, as Supabase recommends for mobile.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
