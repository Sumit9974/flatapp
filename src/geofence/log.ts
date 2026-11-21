import { getDb } from '../db';
import { formatTimestamp } from './format';

export const LOG_KINDS = [
  'enter',
  'exit',
  'marked-left',
  'marked-arrived',
  'test-started',
  'test-stopped',
  'test-resumed',
  'app-opened',
  'error',
] as const;

export type LogKind = (typeof LOG_KINDS)[number];

export const LOG_LABELS: Record<LogKind, string> = {
  enter: 'Phone detected: entered the circle',
  exit: 'Phone detected: left the circle',
  'marked-left': 'You marked: I left',
  'marked-arrived': 'You marked: I arrived',
  'test-started': 'Test started',
  'test-stopped': 'Test stopped',
  'test-resumed': 'Test restarted when the app reopened',
  'app-opened': 'App opened',
  error: 'Error',
};

export interface LogEntry {
  id: number;
  at: number;
  kind: LogKind;
  distanceM: number | null;
  accuracyM: number | null;
  note: string | null;
}

export interface LogDetails {
  distanceM?: number | null;
  accuracyM?: number | null;
  note?: string | null;
}

interface LogRow {
  id: number;
  at: number;
  kind: string;
  distance_m: number | null;
  accuracy_m: number | null;
  note: string | null;
}

const isLogKind = (value: string): value is LogKind => (LOG_KINDS as readonly string[]).includes(value);

export async function addLogEntry(kind: LogKind, details: LogDetails = {}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO geofence_log (at, kind, distance_m, accuracy_m, note) VALUES (?, ?, ?, ?, ?)',
    Date.now(),
    kind,
    details.distanceM ?? null,
    details.accuracyM ?? null,
    details.note ?? null,
  );
}

/** Newest first. */
export async function readLog(limit = 500): Promise<LogEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<LogRow>(
    'SELECT id, at, kind, distance_m, accuracy_m, note FROM geofence_log ORDER BY id DESC LIMIT ?',
    limit,
  );
  return rows.map((row) => ({
    id: row.id,
    at: row.at,
    kind: isLogKind(row.kind) ? row.kind : 'error',
    distanceM: row.distance_m,
    accuracyM: row.accuracy_m,
    note: isLogKind(row.kind) ? row.note : `Unknown event "${row.kind}"`,
  }));
}

export async function clearLog(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM geofence_log');
}

const csvCell = (value: string): string => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** Oldest first, one row per event, ready to paste into a sheet. */
export function logToCsv(entries: LogEntry[]): string {
  const header = 'time,event,distance_m,accuracy_m,note';
  const rows = [...entries]
    .sort((a, b) => a.id - b.id)
    .map((e) =>
      [
        formatTimestamp(e.at),
        csvCell(LOG_LABELS[e.kind]),
        e.distanceM === null ? '' : String(Math.round(e.distanceM)),
        e.accuracyM === null ? '' : String(Math.round(e.accuracyM)),
        csvCell(e.note ?? ''),
      ].join(','),
    );
  return [header, ...rows].join('\n');
}
