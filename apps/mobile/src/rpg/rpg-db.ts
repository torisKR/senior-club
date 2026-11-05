/**
 * expo-sqlite backed implementation of the RPG key/value storage, including a
 * one-time migration of the legacy `@/utils/storage` save.
 *
 * The synchronous API (`openDatabaseSync`, `execSync`, `runSync`,
 * `getFirstSync`, `withTransactionSync`) is used on purpose: `RpgProvider`
 * restores its save inside a `useState` initializer, so the read path must not
 * become async.
 */

import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { storage as legacyStorage } from '@/utils/storage';

import { parseLegacyRpgSave } from './migrate';
import { MemoryRpgStorage, type RpgKeyValueStorage } from './rpg-storage';

export const RPG_DB_NAME = 'senior_club_rpg.db';
export const RPG_STORAGE_KEY = 'senior_club_rpg_state_v1';
export const RPG_LEGACY_BACKUP_KEY = 'senior_club_rpg_state_v1_backup';
export const RPG_MIGRATION_META_KEY = 'migrated_from_async_storage_v1';

const MIGRATION_DONE = 'done';

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS rpg_kv (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rpg_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

const SQL_GET = 'SELECT value FROM rpg_kv WHERE key = ? LIMIT 1';
const SQL_SET =
  'INSERT INTO rpg_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';
const SQL_GET_META = 'SELECT value FROM rpg_meta WHERE key = ? LIMIT 1';
const SQL_SET_META =
  'INSERT INTO rpg_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';

function warn(message: string, error?: unknown): void {
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(`[rpg-db] ${message}`, error);
  }
}

function getMeta(db: SQLiteDatabase, key: string): string | null {
  const row = db.getFirstSync<{ value: string }>(SQL_GET_META, key);
  return row?.value ?? null;
}

function setMeta(db: SQLiteDatabase, key: string, value: string): void {
  db.runSync(SQL_SET_META, key, value);
}

function writeString(db: SQLiteDatabase, key: string, value: string): void {
  db.runSync(SQL_SET, key, value);
}

/**
 * Copies `senior_club_rpg_state_v1` from the legacy AsyncStorage-compatible
 * store into SQLite, once. The legacy key is never deleted, and a backup copy
 * is written next to it.
 */
function migrateLegacySave(db: SQLiteDatabase): void {
  try {
    if (getMeta(db, RPG_MIGRATION_META_KEY) === MIGRATION_DONE) {
      return;
    }

    const existing = db.getFirstSync<{ value: string }>(SQL_GET, RPG_STORAGE_KEY);
    if (existing?.value != null) {
      // SQLite already holds a save; just remember that migration is done.
      setMeta(db, RPG_MIGRATION_META_KEY, MIGRATION_DONE);
      return;
    }

    let legacyRaw: string | null = null;
    try {
      legacyRaw = legacyStorage.getRaw(RPG_STORAGE_KEY);
    } catch (error) {
      warn('failed to read legacy save', error);
      return;
    }

    const parsed = parseLegacyRpgSave(legacyRaw);
    if (!parsed || !legacyRaw) {
      // Nothing to migrate; leave the meta marker unset so a later legacy
      // value (e.g. storage shim still warming up) can still be picked up.
      return;
    }

    const rawToMigrate = legacyRaw;
    db.withTransactionSync(() => {
      writeString(db, RPG_STORAGE_KEY, rawToMigrate);
      setMeta(db, RPG_MIGRATION_META_KEY, MIGRATION_DONE);
    });

    try {
      legacyStorage.set(RPG_LEGACY_BACKUP_KEY, parsed);
    } catch (error) {
      warn('failed to write legacy backup copy', error);
    }
  } catch (error) {
    warn('legacy save migration failed', error);
  }
}

class SqliteRpgStorage implements RpgKeyValueStorage {
  constructor(private readonly db: SQLiteDatabase) {}

  getString(key: string): string | null {
    try {
      const row = this.db.getFirstSync<{ value: string }>(SQL_GET, key);
      return row?.value ?? null;
    } catch (error) {
      warn(`read failed for key "${key}"`, error);
      return null;
    }
  }

  setString(key: string, value: string): void {
    try {
      writeString(this.db, key, value);
    } catch (error) {
      warn(`write failed for key "${key}"`, error);
    }
  }
}

type SimpleLocalStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function getGlobalLocalStorage(): SimpleLocalStorage | null {
  const candidate = (globalThis as unknown as { localStorage?: SimpleLocalStorage }).localStorage;
  if (
    candidate &&
    typeof candidate.getItem === 'function' &&
    typeof candidate.setItem === 'function'
  ) {
    return candidate;
  }
  return null;
}

/**
 * Fallback for platforms where opening the SQLite database fails (for example
 * the web build before the WASM asset is available). Keeps the app usable and
 * still persistent where `localStorage` exists.
 */
class LocalStorageRpgStorage implements RpgKeyValueStorage {
  constructor(private readonly backing: SimpleLocalStorage) {}

  getString(key: string): string | null {
    try {
      return this.backing.getItem(key);
    } catch (error) {
      warn(`localStorage read failed for key "${key}"`, error);
      return null;
    }
  }

  setString(key: string, value: string): void {
    try {
      this.backing.setItem(key, value);
    } catch (error) {
      warn(`localStorage write failed for key "${key}"`, error);
    }
  }
}

let cachedStorage: RpgKeyValueStorage | null = null;

function createRpgStorage(): RpgKeyValueStorage {
  const db = openDatabaseSync(RPG_DB_NAME);
  db.execSync(SCHEMA_SQL);
  migrateLegacySave(db);
  return new SqliteRpgStorage(db);
}

function createFallbackStorage(): RpgKeyValueStorage {
  const local = getGlobalLocalStorage();
  if (local) {
    return new LocalStorageRpgStorage(local);
  }
  return new MemoryRpgStorage();
}

/**
 * Returns the process-wide RPG storage. Never throws: on any SQLite failure it
 * logs and degrades to localStorage / in-memory storage.
 */
export function getRpgStorage(): RpgKeyValueStorage {
  if (cachedStorage) return cachedStorage;

  try {
    cachedStorage = createRpgStorage();
  } catch (error) {
    warn('failed to open SQLite storage, using fallback', error);
    cachedStorage = createFallbackStorage();
  }

  return cachedStorage;
}
