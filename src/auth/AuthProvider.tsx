import type { Session } from '@supabase/supabase-js';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Tables } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import { forgetThisPhone } from '../push/push';

type Profile = Pick<Tables<'profiles'>, 'id' | 'display_name'>;

interface AuthState {
  /** True until the stored session has been read on start-up. */
  loading: boolean;
  session: Session | null;
  userId: string | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('id, display_name').eq('id', userId).maybeSingle();
  return data ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    // Only set state here: Supabase warns against awaiting its own calls inside this callback.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (userId === null) return;
    let active = true;
    void fetchProfile(userId).then((p) => {
      if (active) setProfile(p);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const refreshProfile = useCallback(async () => {
    if (userId !== null) setProfile(await fetchProfile(userId));
  }, [userId]);

  const signOut = useCallback(async () => {
    // Stop this phone getting the person's notifications; never let that block signing out.
    await forgetThisPhone().catch(() => undefined);
    await supabase.auth.signOut();
  }, []);

  // A profile left over from a previous account is never shown.
  const visibleProfile = profile !== null && profile.id === userId ? profile : null;

  const value = useMemo(
    () => ({ loading, session, userId, profile: visibleProfile, refreshProfile, signOut }),
    [loading, session, userId, visibleProfile, refreshProfile, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
