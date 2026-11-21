import type { Enums, Tables } from '../lib/database.types';
import { check, unwrap, unwrapMaybe } from '../lib/errors';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------- dinner

export type DinnerChoice = Enums<'dinner_choice'>;

export interface DinnerToday {
  day: string;
  byUser: Map<string, { choice: DinnerChoice; note: string | null }>;
  /** host user id → user ids who joined their online order */
  joins: Map<string, string[]>;
}

export async function loadDinner(flatId: string): Promise<DinnerToday> {
  const { data: day, error } = await supabase.rpc('dinner_day', { p_flat: flatId });
  if (error) throw error;
  const [statuses, joins] = await Promise.all([
    supabase.from('dinner_status').select('user_id, choice, note').eq('flat_id', flatId).eq('day', day),
    supabase.from('dinner_joins').select('host_id, user_id').eq('flat_id', flatId).eq('day', day),
  ]);
  const byUser = new Map(unwrap(statuses).map((s) => [s.user_id, { choice: s.choice, note: s.note }]));
  const joinMap = new Map<string, string[]>();
  for (const j of unwrap(joins)) joinMap.set(j.host_id, [...(joinMap.get(j.host_id) ?? []), j.user_id]);
  return { day, byUser, joins: joinMap };
}

export async function setDinner(flatId: string, choice: DinnerChoice | null, note: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_dinner', {
    p_flat: flatId,
    // null = back to "Not decided"
    p_choice: choice as DinnerChoice,
    p_note: note ?? undefined,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- buy list

export type BuyItem = Tables<'buy_items'> & { votes: Map<string, boolean> };

export async function loadBuy(flatId: string): Promise<BuyItem[]> {
  const [items, votes] = await Promise.all([
    supabase.from('buy_items').select('*').eq('flat_id', flatId).order('created_at', { ascending: false }),
    supabase.from('buy_votes').select('item_id, user_id, vote_in').eq('flat_id', flatId),
  ]);
  const byItem = new Map<string, Map<string, boolean>>();
  for (const v of unwrap(votes)) {
    const m = byItem.get(v.item_id) ?? new Map<string, boolean>();
    m.set(v.user_id, v.vote_in);
    byItem.set(v.item_id, m);
  }
  return unwrap(items).map((i) => ({ ...i, votes: byItem.get(i.id) ?? new Map<string, boolean>() }));
}

// ---------------------------------------------------------------- presence

export type PresenceRow = Tables<'presence'>;

export async function loadPresence(flatId: string): Promise<Map<string, PresenceRow>> {
  const rows = unwrap(await supabase.from('presence').select('*').eq('flat_id', flatId));
  return new Map(rows.map((r) => [r.user_id, r]));
}

// ---------------------------------------------------------------- notices, polls, repairs

export type Notice = Tables<'notices'>;

export async function loadNotices(flatId: string): Promise<Notice[]> {
  return unwrap(
    await supabase
      .from('notices')
      .select('*')
      .eq('flat_id', flatId)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100),
  );
}

export interface Poll {
  poll: Tables<'polls'>;
  options: Tables<'poll_options'>[];
  votes: Map<string, string>;
  isOpen: boolean;
}

export async function loadPolls(flatId: string): Promise<Poll[]> {
  const [polls, options, votes] = await Promise.all([
    supabase.from('polls').select('*').eq('flat_id', flatId).order('created_at', { ascending: false }).limit(30),
    supabase.from('poll_options').select('*').eq('flat_id', flatId).order('position'),
    supabase.from('poll_votes').select('poll_id, user_id, option_id').eq('flat_id', flatId),
  ]);
  const opts = unwrap(options);
  const allVotes = unwrap(votes);
  const now = Date.now();
  return unwrap(polls).map((p) => ({
    poll: p,
    options: opts.filter((o) => o.poll_id === p.id),
    votes: new Map(allVotes.filter((v) => v.poll_id === p.id).map((v) => [v.user_id, v.option_id])),
    isOpen: !p.closed && (p.closes_at === null || new Date(p.closes_at).getTime() > now),
  }));
}

export type Repair = Tables<'repairs'>;

export async function loadRepairs(flatId: string): Promise<Repair[]> {
  return unwrap(await supabase.from('repairs').select('*').eq('flat_id', flatId).order('created_at', { ascending: false }).limit(100));
}

// ---------------------------------------------------------------- flat info

export interface FlatInfoBundle {
  info: Tables<'flat_info'> | null;
  contacts: Tables<'contacts'>[];
  documents: Tables<'documents'>[];
}

export async function loadFlatInfo(flatId: string): Promise<FlatInfoBundle> {
  const [info, contacts, documents] = await Promise.all([
    supabase.from('flat_info').select('*').eq('flat_id', flatId).maybeSingle(),
    supabase.from('contacts').select('*').eq('flat_id', flatId).order('role'),
    supabase.from('documents').select('*').eq('flat_id', flatId).order('created_at', { ascending: false }),
  ]);
  return { info: unwrapMaybe(info), contacts: unwrap(contacts), documents: unwrap(documents) };
}

export async function deleteContact(id: string): Promise<void> {
  check(await supabase.from('contacts').delete().eq('id', id));
}

// ---------------------------------------------------------------- notifications

export type Alert = Tables<'notifications'>;

export async function loadAlerts(flatId: string, userId: string): Promise<Alert[]> {
  return unwrap(
    await supabase
      .from('notifications')
      .select('*')
      .eq('flat_id', flatId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100),
  );
}

export type Prefs = Pick<Tables<'notification_prefs'>, 'dinner' | 'bills' | 'buy' | 'notices' | 'presence'>;

export const DEFAULT_PREFS: Prefs = { dinner: true, bills: true, buy: true, notices: true, presence: false };

export async function loadPrefs(userId: string): Promise<Prefs> {
  const row = unwrapMaybe(
    await supabase.from('notification_prefs').select('dinner, bills, buy, notices, presence').eq('user_id', userId).maybeSingle(),
  );
  return row ?? DEFAULT_PREFS;
}

export async function savePrefs(p: Prefs): Promise<void> {
  const { error } = await supabase.rpc('save_notification_prefs', {
    p_dinner: p.dinner,
    p_bills: p.bills,
    p_buy: p.buy,
    p_notices: p.notices,
    p_presence: p.presence,
  });
  if (error) throw error;
}
