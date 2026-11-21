import { useEffect, useEffectEvent, useId } from 'react';
import { supabase } from './supabase';

/** Tables in the supabase_realtime publication (see the migrations). */
export type RealtimeTable =
  | 'bills'
  | 'bill_history'
  | 'flat_members'
  | 'notifications'
  | 'dinner_status'
  | 'dinner_joins'
  | 'buy_items'
  | 'buy_votes'
  | 'presence'
  | 'notices'
  | 'polls'
  | 'poll_votes'
  | 'repairs'
  | 'flat_info'
  | 'contacts'
  | 'documents';

export interface Watch {
  table: RealtimeTable;
  /** e.g. "flat_id=eq.<uuid>" */
  filter: string;
}

/**
 * Calls `onChange` whenever a watched row is inserted, updated or deleted by anyone.
 * Row-level security still decides what arrives. `key` must change when the watches do.
 */
export function useRealtime(key: string | null, watches: Watch[], onChange: () => void): void {
  const handleChange = useEffectEvent(onChange);
  const instance = useId();
  const watchList = useEffectEvent(() => watches);

  useEffect(() => {
    if (key === null) return;
    let channel = supabase.channel(`${key}:${instance}`);
    for (const w of watchList()) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: w.table, filter: w.filter }, () =>
        handleChange(),
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [key, instance]);
}
