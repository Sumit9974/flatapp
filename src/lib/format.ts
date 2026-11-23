const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const pad = (value: number): string => String(value).padStart(2, '0');
const NBSP = ' ';

/** First day of the month containing `date`, local time. */
export function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/** "2026-11-21" in local time: the format Postgres `date` columns use. */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Reads "2026-11-21" as a local date (not UTC midnight). */
export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function daysInMonth(month: Date): number {
  return new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
}

/** "November 2026" */
export function formatMonthLong(month: Date): string {
  return `${MONTHS_LONG.at(month.getMonth()) ?? ''} ${month.getFullYear()}`;
}

/** "Nov 2026" */
export function formatMonthShort(month: Date): string {
  return `${MONTHS_SHORT.at(month.getMonth()) ?? ''} ${month.getFullYear()}`;
}

/** "12 Nov" */
export function formatDay(date: Date): string {
  return `${date.getDate()}${NBSP}${MONTHS_SHORT.at(date.getMonth()) ?? ''}`;
}

/** "12 Nov 2026, 9:14 pm" */
export function formatDateTime(date: Date): string {
  const hours = date.getHours();
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const suffix = hours < 12 ? 'am' : 'pm';
  return `${formatDay(date)} ${date.getFullYear()}, ${h12}:${pad(date.getMinutes())}${NBSP}${suffix}`;
}

/** "9:14 pm" */
export function formatTime(date: Date): string {
  const hours = date.getHours();
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${pad(date.getMinutes())}${NBSP}${hours < 12 ? 'am' : 'pm'}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Saturday, 21 November" */
export function formatToday(date: Date): string {
  return `${WEEKDAYS_LONG.at(date.getDay()) ?? ''}, ${date.getDate()} ${MONTHS_LONG.at(date.getMonth()) ?? ''}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "7:52 pm" today, "Yesterday, 7:52 pm", "Mon, 9:30 am" this week, else "4 Nov". */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (sameDay(d, now)) return formatTime(d);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(d, yesterday)) return `Yesterday, ${formatTime(d)}`;
  const ageDays = (now.getTime() - d.getTime()) / 86_400_000;
  if (ageDays < 6) return `${WEEKDAYS.at(d.getDay()) ?? ''}, ${formatTime(d)}`;
  return formatDay(d);
}

/** "since 7:40 pm" today, "since yesterday", "since Mon", "since 4 Nov" */
export function sinceText(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (sameDay(d, now)) return `since ${formatTime(d)}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'since yesterday';
  const ageDays = (now.getTime() - d.getTime()) / 86_400_000;
  if (ageDays < 6) return `since ${WEEKDAYS.at(d.getDay()) ?? ''}`;
  return `since ${formatDay(d)}`;
}

/** "5 min ago", "2 h ago", "1 day ago", "3 days ago" */
export function agoText(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}${NBSP}min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}${NBSP}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** "Good morning" / "Good afternoon" / "Good evening" */
export function greeting(date: Date): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "₹1,23,456" — Indian grouping. */
export function rupees(amount: number): string {
  return formatRupees(amount).replace(`Rs${NBSP}`, '₹');
}

/** "1st", "2nd", "23rd", "12th" */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "Rs 1,23,456" or "Rs 1,350.50", Indian digit grouping, no Intl dependency. */
export function formatRupees(amount: number): string {
  const fixed = Math.abs(amount).toFixed(2);
  const [whole = '0', paise = '00'] = fixed.split('.');
  const lastThree = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest.length > 0 ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}` : lastThree;
  const sign = amount < 0 ? '-' : '';
  return `${sign}Rs${NBSP}${grouped}${paise === '00' ? '' : `.${paise}`}`;
}

/**
 * Reads an amount the way people type it: "1350", "1,350.50", "₹1350", "Rs 1350", "1350/-", "1350.".
 * Null when empty; NaN when it is not a number or has more than 2 decimals.
 */
export function parseAmount(text: string): number | null {
  const cleaned = text
    .replace(/₹|rs\.?|inr|\/-|[,\s]/gi, '')
    .replace(/\.$/, '');
  if (cleaned === '') return null;
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}
