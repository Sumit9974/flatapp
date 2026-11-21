const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (value: number): string => String(value).padStart(2, '0');

/** "21 Nov, 14:05:09" in the phone's local time. */
export function formatTime(at: number): string {
  const d = new Date(at);
  const month = MONTHS.at(d.getMonth()) ?? '';
  return `${d.getDate()} ${month}, ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** "2026-11-21 14:05:09" in the phone's local time, for the shared CSV. */
export function formatTimestamp(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Non-breaking space: keeps a number and its unit on the same line. */
export const NBSP = ' ';

/** "143 m" below a kilometre, "1.2 km" above. */
export function formatDistance(metres: number): string {
  return metres < 1000 ? `${Math.round(metres)}${NBSP}m` : `${(metres / 1000).toFixed(1)}${NBSP}km`;
}

/** "±12 m" */
export function formatAccuracy(metres: number): string {
  return `±${Math.round(metres)}${NBSP}m`;
}
