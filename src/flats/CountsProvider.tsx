import { createContext, ReactNode, useContext, useMemo } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { monthStart, toIsoDate } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useLive } from '../lib/useLive';
import { useCurrentFlat } from './FlatProvider';

export interface Counts {
  unpaidBills: number;
  openBuy: number;
  openPolls: number;
  openRepairs: number;
  unreadAlerts: number;
  homeNow: number;
}

const EMPTY: Counts = { unpaidBills: 0, openBuy: 0, openPolls: 0, openRepairs: 0, unreadAlerts: 0, homeNow: 0 };

const CountsContext = createContext<Counts>(EMPTY);

async function count(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count: n, error } = await query;
  if (error) throw error;
  return n ?? 0;
}

/** Badge numbers for the side menu, the bell and the header subtitles, kept live. */
export function CountsProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const { flat } = useCurrentFlat();
  const flatId = flat.id;
  const filter = `flat_id=eq.${flatId}`;

  const live = useLive<Counts>(
    userId === null ? null : `counts:${flatId}:${userId}`,
    async () => {
      const month = toIsoDate(monthStart(new Date()));
      const now = new Date().toISOString();
      const [unpaidBills, openBuy, openPolls, openRepairs, unreadAlerts, homeNow] = await Promise.all([
        count(supabase.from('bills').select('id', { count: 'exact', head: true }).eq('flat_id', flatId).eq('month', month).eq('status', 'unpaid')),
        count(supabase.from('buy_items').select('id', { count: 'exact', head: true }).eq('flat_id', flatId).eq('status', 'open')),
        count(
          supabase
            .from('polls')
            .select('id', { count: 'exact', head: true })
            .eq('flat_id', flatId)
            .eq('closed', false)
            .or(`closes_at.is.null,closes_at.gt.${now}`),
        ),
        count(supabase.from('repairs').select('id', { count: 'exact', head: true }).eq('flat_id', flatId).eq('status', 'open')),
        count(
          supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('flat_id', flatId)
            .eq('user_id', userId ?? '')
            .is('read_at', null),
        ),
        count(supabase.from('presence').select('user_id', { count: 'exact', head: true }).eq('flat_id', flatId).eq('state', 'home').eq('sharing', true)),
      ]);
      return { unpaidBills, openBuy, openPolls, openRepairs, unreadAlerts, homeNow };
    },
    [
      { table: 'bills', filter },
      { table: 'buy_items', filter },
      { table: 'polls', filter },
      { table: 'repairs', filter },
      { table: 'notifications', filter: `user_id=eq.${userId ?? ''}` },
      { table: 'presence', filter },
    ],
  );

  const value = useMemo(() => live.data ?? EMPTY, [live.data]);
  return <CountsContext.Provider value={value}>{children}</CountsContext.Provider>;
}

export function useCounts(): Counts {
  return useContext(CountsContext);
}
