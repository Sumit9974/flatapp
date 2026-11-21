import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import type { Enums, Tables } from '../lib/database.types';
import { unwrap } from '../lib/errors';
import { supabase } from '../lib/supabase';
import { useRealtime } from '../lib/useRealtime';

export type Flat = Tables<'flats'>;
export type Role = Enums<'member_role'>;

export interface Membership {
  flat: Flat;
  role: Role;
}

export interface Member {
  userId: string;
  name: string;
  role: Role;
  joinedAt: string;
  /** Set when the person left; their name still shows on old bills. */
  leftAt: string | null;
}

interface FlatState {
  /** True until this person's flats have loaded. */
  loading: boolean;
  memberships: Membership[];
  current: Membership | null;
  isAdmin: boolean;
  /** Current and former members of the current flat. */
  members: Member[];
  /** See useCurrentFlat: the flat that was open just before you had none. */
  lastOpen: Membership | null;
  /** Display name for any user id seen in this flat ("You" for yourself). */
  nameOf: (userId: string | null | undefined) => string;
  selectFlat: (flatId: string) => void;
  refresh: () => Promise<void>;
}

const CURRENT_FLAT_KEY = 'flatapp.currentFlatId';

function readStoredFlatId(): string | null {
  try {
    return localStorage.getItem(CURRENT_FLAT_KEY);
  } catch {
    return null;
  }
}

async function fetchMemberships(userId: string): Promise<Membership[]> {
  const rows = unwrap(
    await supabase
      .from('flat_members')
      .select('role, flats(*)')
      .eq('user_id', userId)
      .is('left_at', null)
      .order('joined_at'),
  );
  return rows.flatMap((row) => (row.flats ? [{ flat: row.flats, role: row.role }] : []));
}

async function fetchMembers(flatId: string): Promise<Member[]> {
  const rows = unwrap(
    await supabase.from('flat_members').select('user_id, role, joined_at, left_at').eq('flat_id', flatId).order('joined_at'),
  );
  const ids = rows.map((r) => r.user_id);
  const profiles = ids.length === 0 ? [] : unwrap(await supabase.from('profiles').select('id, display_name').in('id', ids));
  const names = new Map(profiles.map((p) => [p.id, p.display_name]));
  return rows.map((r) => ({
    userId: r.user_id,
    name: names.get(r.user_id) ?? 'Former member',
    role: r.role,
    joinedAt: r.joined_at,
    leftAt: r.left_at,
  }));
}

const FlatContext = createContext<FlatState | null>(null);

export function FlatProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  // Results remember whom/which flat they were loaded for, so stale data is never shown.
  const [memberships, setMemberships] = useState<{ userId: string; list: Membership[] } | null>(null);
  const [members, setMembers] = useState<{ flatId: string; list: Member[] } | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(readStoredFlatId);
  // The flat that was open when your last flat was left or deleted. Screens still on the way out
  // render it for that moment instead of crashing; the router then moves to flat setup.
  const [lastOpen, setLastOpen] = useState<Membership | null>(null);

  useEffect(() => {
    if (userId === null) return;
    let active = true;
    void fetchMemberships(userId)
      .then((list) => {
        if (active) setMemberships({ userId, list });
      })
      .catch(() => {
        // Offline at start-up: show the setup screen's state rather than spin forever.
        if (active) setMemberships({ userId, list: [] });
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const myMemberships = useMemo(
    () => (memberships !== null && memberships.userId === userId ? memberships.list : []),
    [memberships, userId],
  );
  const loading = userId !== null && (memberships === null || memberships.userId !== userId);

  const current = useMemo(
    () => myMemberships.find((m) => m.flat.id === currentId) ?? myMemberships.at(0) ?? null,
    [myMemberships, currentId],
  );
  const currentFlatId = current?.flat.id ?? null;

  const loadMemberships = useCallback(async () => {
    if (userId === null) return;
    const list = await fetchMemberships(userId);
    if (list.length === 0 && current !== null) setLastOpen(current);
    setMemberships({ userId, list });
  }, [userId, current]);

  const loadMembers = useCallback(async () => {
    if (currentFlatId === null) return;
    const list = await fetchMembers(currentFlatId);
    setMembers({ flatId: currentFlatId, list });
  }, [currentFlatId]);

  useEffect(() => {
    if (currentFlatId === null) return;
    let active = true;
    void fetchMembers(currentFlatId)
      .then((list) => {
        if (active) setMembers({ flatId: currentFlatId, list });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [currentFlatId]);

  // Someone joins, leaves or becomes admin: refresh the list and our own role.
  useRealtime(
    currentFlatId === null ? null : `members:${currentFlatId}`,
    currentFlatId === null ? [] : [{ table: 'flat_members', filter: `flat_id=eq.${currentFlatId}` }],
    () => {
      void loadMembers().catch(() => undefined);
      void loadMemberships().catch(() => undefined);
    },
  );

  const currentMembers = useMemo(
    () => (members !== null && members.flatId === currentFlatId ? members.list : []),
    [members, currentFlatId],
  );

  const selectFlat = useCallback((flatId: string) => {
    setCurrentId(flatId);
    try {
      localStorage.setItem(CURRENT_FLAT_KEY, flatId);
    } catch {
      // Remembering the choice is a convenience; the first flat is used otherwise.
    }
  }, []);

  const refresh = useCallback(async () => {
    await loadMemberships();
    await loadMembers();
  }, [loadMemberships, loadMembers]);

  const nameOf = useCallback(
    (id: string | null | undefined) => {
      if (!id) return 'Someone';
      if (id === userId) return 'You';
      return currentMembers.find((m) => m.userId === id)?.name ?? 'Someone';
    },
    [currentMembers, userId],
  );

  const value = useMemo(
    () => ({
      loading,
      memberships: myMemberships,
      current,
      isAdmin: current?.role === 'admin',
      members: currentMembers,
      lastOpen,
      nameOf,
      selectFlat,
      refresh,
    }),
    [loading, myMemberships, current, currentMembers, lastOpen, nameOf, selectFlat, refresh],
  );
  return <FlatContext.Provider value={value}>{children}</FlatContext.Provider>;
}

export function useFlats(): FlatState {
  const value = useContext(FlatContext);
  if (value === null) throw new Error('useFlats must be used inside <FlatProvider>');
  return value;
}

/** The current flat; only for screens that render after a flat exists. */
export function useCurrentFlat(): Membership {
  const { current, lastOpen } = useFlats();
  const membership = current ?? lastOpen;
  if (membership === null) throw new Error('No flat selected');
  return membership;
}
