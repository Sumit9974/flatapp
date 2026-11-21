import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('flatapp.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS geofence_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      kind TEXT NOT NULL,
      distance_m REAL,
      accuracy_m REAL,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
  return db;
}

/**
 * One shared connection for the screen and the background geofence task.
 * SQLite serialises their writes, so an event arriving while the screen writes is never lost.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate().catch((error: unknown) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}
