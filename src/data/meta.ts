import type { IconName } from '../components/Icon';
import { agoText, formatWhen, sinceText } from '../lib/format';
import { STALE_AFTER_HOURS } from '../presence/config';
import { colors } from '../theme';
import type { DinnerChoice, PresenceRow } from './queries';

// ---------------------------------------------------------------- bill categories

export interface CategoryStyle {
  icon: IconName;
  bg: string;
  fg: string;
}

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  'Light bill': { icon: 'zap', bg: '#FFF8D6', fg: '#7A5C00' },
  WiFi: { icon: 'wifi', bg: '#EEEDFF', fg: '#4F46E5' },
  Gas: { icon: 'flame', bg: '#FFF1E6', fg: '#9A4A06' },
  Rent: { icon: 'home', bg: colors.primarySoft, fg: colors.primary },
  Water: { icon: 'drop', bg: '#E3F3FA', fg: '#0B6E99' },
  Grocery: { icon: 'cart', bg: colors.goodSoft, fg: colors.good },
  Maintenance: { icon: 'building', bg: colors.slateSoft, fg: '#374151' },
};

export function categoryStyle(name: string): CategoryStyle {
  return CATEGORY_STYLES[name] ?? { icon: 'tag', bg: colors.slateSoft, fg: '#374151' };
}

// ---------------------------------------------------------------- dinner

export interface DinnerMeta {
  label: string;
  short: string;
  hint: string;
  icon: IconName;
  bg: string;
  fg: string;
  word: string;
}

export const DINNER: Record<DinnerChoice, DinnerMeta> = {
  home: { label: 'At home', short: 'Home', hint: 'Eating at the flat', icon: 'home', bg: colors.goodSoft, fg: colors.good, word: 'at home' },
  out: { label: 'Eating out', short: 'Out', hint: 'Not at the flat', icon: 'utensils', bg: colors.primarySoft, fg: colors.primaryDark, word: 'out' },
  online: { label: 'Ordering', short: 'Order', hint: 'Ordering food in', icon: 'bag', bg: colors.violetSoft, fg: colors.violet, word: 'ordering' },
  skip: { label: 'Not eating', short: 'Skip', hint: 'Skipping dinner', icon: 'x', bg: colors.slateSoft, fg: colors.slate, word: 'not eating' },
};

export const DINNER_ORDER: DinnerChoice[] = ['home', 'out', 'online', 'skip'];

export const UNDECIDED = { label: 'Not decided', bg: colors.warnSoft, fg: colors.warn, word: 'not decided' } as const;

// ---------------------------------------------------------------- presence

export interface PresenceView {
  /** 'stale': the phone last said Home or Out, but has not confirmed it for hours. */
  state: 'home' | 'out' | 'stale' | 'away' | 'hidden' | 'unknown';
  short: string;
  detail: string;
  /** "checked 2 h ago", once a phone has been quiet for over an hour; shown after the detail. */
  checked?: string;
  dot: string;
  pillBg: string;
  pillFg: string;
  textColor: string;
}

const STALE_MS = STALE_AFTER_HOURS * 3_600_000;
const SHOW_CHECKED_AFTER_MS = 60 * 60_000;

export function describePresence(row: PresenceRow | undefined, now: Date = new Date()): PresenceView {
  if (row && !row.sharing) {
    return { state: 'hidden', short: 'Hidden', detail: 'Not sharing', dot: colors.switchOff, pillBg: colors.slateSoft, pillFg: colors.slate, textColor: colors.muted };
  }
  if (row?.manual === 'away') {
    return {
      state: 'away',
      short: 'Away',
      detail: row.manual_note ? `Away · ${row.manual_note}` : 'Away for a few days',
      dot: '#D08700',
      pillBg: colors.warnSoft,
      pillFg: colors.warn,
      textColor: colors.warn,
    };
  }
  if (row?.state === 'home' || row?.state === 'out') {
    const late = row.state === 'out' && row.manual === 'late' ? ` · coming late${row.manual_note ? `, ${row.manual_note}` : ''}` : '';
    // Rows from before check-ins existed have no checked_at; their last update is the best guess.
    const lastCheck = row.checked_at ?? row.updated_at;
    const quietMs = now.getTime() - new Date(lastCheck).getTime();
    if (quietMs > STALE_MS) {
      return {
        state: 'stale',
        short: 'Not sure',
        detail: `Last seen ${row.state} · ${formatWhen(lastCheck, now)}${late}`,
        dot: '#C9CFDB',
        pillBg: colors.warnSoft,
        pillFg: colors.warn,
        textColor: colors.muted,
      };
    }
    const checked = quietMs > SHOW_CHECKED_AFTER_MS ? `checked ${agoText(lastCheck, now)}` : undefined;
    if (row.state === 'home') {
      return {
        state: 'home',
        short: 'Home',
        detail: row.since ? `Home ${sinceText(row.since, now)}` : 'Home',
        checked,
        dot: colors.good,
        pillBg: colors.goodSoft,
        pillFg: colors.good,
        textColor: colors.good,
      };
    }
    return {
      state: 'out',
      short: 'Out',
      detail: `${row.since ? `Out ${sinceText(row.since, now)}` : 'Out'}${late}`,
      checked,
      dot: colors.switchOff,
      pillBg: colors.slateSoft,
      pillFg: colors.slate,
      textColor: colors.muted,
    };
  }
  return {
    state: 'unknown',
    short: 'Not set',
    detail: row?.manual === 'late' ? `Coming late${row.manual_note ? `, ${row.manual_note}` : ''}` : 'Has not shared Home or Out yet',
    dot: '#C9CFDB',
    pillBg: colors.slateSoft,
    pillFg: colors.slate,
    textColor: colors.muted,
  };
}
