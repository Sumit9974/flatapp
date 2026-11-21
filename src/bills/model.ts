import type { Json, Tables } from '../lib/database.types';
import { unwrap } from '../lib/errors';
import { formatDateTime, formatDay, rupees, fromIsoDate, toIsoDate } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { Tone } from '../theme';

export type Bill = Tables<'bills'>;
export type Category = Pick<Tables<'bill_categories'>, 'id' | 'name' | 'is_builtin'>;
export type Template = Tables<'bill_templates'>;
export type HistoryEntry = Tables<'bill_history'>;

export async function loadCategories(flatId: string): Promise<Category[]> {
  return unwrap(
    await supabase.from('bill_categories').select('id, name, is_builtin').eq('flat_id', flatId).order('name'),
  );
}

export async function addCategory(flatId: string, name: string): Promise<Category> {
  return unwrap(
    await supabase
      .from('bill_categories')
      .insert({ flat_id: flatId, name: name.trim() })
      .select('id, name, is_builtin')
      .single(),
  );
}

export async function loadMonthBills(flatId: string, month: Date): Promise<Bill[]> {
  return unwrap(
    await supabase
      .from('bills')
      .select('*')
      .eq('flat_id', flatId)
      .eq('month', toIsoDate(month))
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('title'),
  );
}

/** Unpaid first (soonest due first), then paid (latest first). */
export function sortBills(bills: Bill[]): { unpaid: Bill[]; paid: Bill[] } {
  const unpaid = bills.filter((b) => b.status === 'unpaid');
  const paid = bills
    .filter((b) => b.status === 'paid')
    .sort((a, b) => (b.marked_at ?? '').localeCompare(a.marked_at ?? ''));
  return { unpaid, paid };
}

export interface StatusLine {
  text: string;
  tone: Tone;
}

/** One-line state of a bill for lists: who paid it, or when it is due. */
export function describeStatus(bill: Bill, nameOf: (id: string | null) => string, today = new Date()): StatusLine {
  if (bill.status === 'paid') {
    const when = bill.marked_at ? formatDay(new Date(bill.marked_at)) : '';
    return { text: `Paid by ${nameOf(bill.marked_by)}${when ? `, ${when}` : ''}`, tone: 'good' };
  }
  if (bill.due_date === null) return { text: 'Unpaid', tone: 'warn' };
  const due = fromIsoDate(bill.due_date);
  const todayIso = toIsoDate(today);
  if (bill.due_date < todayIso) return { text: `Overdue since ${formatDay(due)}`, tone: 'bad' };
  if (bill.due_date === todayIso) return { text: 'Due today', tone: 'warn' };
  return { text: `Due ${formatDay(due)}`, tone: 'neutral' };
}

export function amountText(amount: number | null): string {
  return amount === null ? '' : rupees(amount);
}

const FIELD_LABELS: Record<string, string> = {
  title: 'name',
  amount: 'amount',
  due_date: 'due date',
  note: 'note',
  category_id: 'category',
};

function isPair(value: Json | undefined): value is [Json, Json] {
  return Array.isArray(value) && value.length === 2;
}

function showValue(field: string, value: Json): string {
  if (value === null || value === '') return 'nothing';
  if (field === 'amount' && typeof value === 'number') return rupees(value);
  if (field === 'amount' && typeof value === 'string') return rupees(Number(value));
  if (field === 'due_date' && typeof value === 'string') return formatDay(fromIsoDate(value));
  if (field === 'category_id') return 'another category';
  return typeof value === 'string' ? `"${value}"` : String(value);
}

/** "Rahul marked it paid", "Amit changed the amount from Rs 1,200 to Rs 1,350". */
export function describeHistory(entry: HistoryEntry, nameOf: (id: string | null) => string): { text: string; when: string } {
  const who = nameOf(entry.actor_id);
  const when = formatDateTime(new Date(entry.at));
  switch (entry.action) {
    case 'marked_paid':
      return { text: `${who} marked it paid`, when };
    case 'marked_unpaid':
      return { text: `${who} marked it unpaid${entry.reason ? `: ${entry.reason}` : ''}`, when };
    case 'created': {
      const details = entry.details;
      const recurring =
        typeof details === 'object' && details !== null && !Array.isArray(details) && details.source === 'recurring';
      return { text: recurring ? 'Added from a recurring bill' : `${who} added this bill`, when };
    }
    case 'edited': {
      const details = entry.details;
      if (typeof details !== 'object' || details === null || Array.isArray(details)) {
        return { text: `${who} edited it`, when };
      }
      const parts = Object.entries(details).flatMap(([field, change]) =>
        isPair(change)
          ? [`the ${FIELD_LABELS[field] ?? field} from ${showValue(field, change[0])} to ${showValue(field, change[1])}`]
          : [],
      );
      return { text: parts.length > 0 ? `${who} changed ${parts.join(', ')}` : `${who} edited it`, when };
    }
    default:
      return { text: `${who}: ${entry.action}`, when };
  }
}
