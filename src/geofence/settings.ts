import { getDb } from '../db';

export interface HomeConfig {
  latitude: number;
  longitude: number;
  radiusM: number;
}

interface SettingRow {
  value: string;
}

async function readSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<SettingRow>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

async function writeSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

const isHomeConfig = (value: unknown): value is HomeConfig => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.latitude === 'number' && typeof v.longitude === 'number' && typeof v.radiusM === 'number';
};

export async function getHome(): Promise<HomeConfig | null> {
  const raw = await readSetting('home');
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isHomeConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveHome(home: HomeConfig): Promise<void> {
  await writeSetting('home', JSON.stringify(home));
}

/** Whether the person started the test and has not stopped it, so it can be re-registered after a restart. */
export async function getTestActive(): Promise<boolean> {
  return (await readSetting('testActive')) === '1';
}

export async function setTestActive(active: boolean): Promise<void> {
  await writeSetting('testActive', active ? '1' : '0');
}
