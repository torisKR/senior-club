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
import { Platform } from 'react-native';

import { storage as legacyStorage } from '@/utils/storage';

import { parseLegacyRpgSave } from './migrate';
import { MemoryRpgStorage, type RpgGuardedWriteResult, type RpgGuardedKeyValueStorage, type RpgSaveBackup } from './rpg-storage';

export const RPG_DB_NAME = 'senior_club_rpg.db';
export const RPG_STORAGE_KEY = 'senior_club_rpg_state_v1';
export const RPG_FALLBACK_ACTIVE_KEY = 'senior_club_rpg_state_v3_fallback';
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

class LegacyMigrationError extends Error {}

/**
 * Copies `senior_club_rpg_state_v1` from the legacy AsyncStorage-compatible
 * store into SQLite, once. The legacy key is never deleted, and a backup copy
 * is written next to it.
 */
function migrateLegacySave(db: SQLiteDatabase): void {
  try {
    const migrated = getMeta(db, RPG_MIGRATION_META_KEY) === MIGRATION_DONE;
    const existing = db.getFirstSync<{ value: string }>(SQL_GET, RPG_STORAGE_KEY);
    if (migrated) {
      if (existing?.value == null) throw new Error('migrated SQLite save is missing');
      return;
    }

    if (existing?.value != null) {
      // SQLite already holds a save; just remember that migration is done.
      setMeta(db, RPG_MIGRATION_META_KEY, MIGRATION_DONE);
      return;
    }

    const legacyRaw = legacyStorage.getRaw(RPG_STORAGE_KEY);
    if (legacyRaw === null) return;
    const parsed = parseLegacyRpgSave(legacyRaw);
    if (!parsed) throw new Error('legacy save could not be parsed');

    const rawToMigrate = legacyRaw;
    db.withTransactionSync(() => {
      // Another writer may have created the SQLite save since the first read.
      if (db.getFirstSync<{ value: string }>(SQL_GET, RPG_STORAGE_KEY)?.value != null) {
        throw new Error('SQLite save changed during legacy migration');
      }
      writeString(db, RPG_STORAGE_KEY, rawToMigrate);
      if (db.getFirstSync<{ value: string }>(SQL_GET, RPG_STORAGE_KEY)?.value !== rawToMigrate) {
        throw new Error('legacy save migration read-back failed');
      }
      setMeta(db, RPG_MIGRATION_META_KEY, MIGRATION_DONE);
      if (getMeta(db, RPG_MIGRATION_META_KEY) !== MIGRATION_DONE) {
        throw new Error('legacy migration marker read-back failed');
      }
    });

    try {
      legacyStorage.set(RPG_LEGACY_BACKUP_KEY, parsed);
    } catch (error) {
      warn('failed to write legacy backup copy', error);
    }
  } catch (error) {
    throw new LegacyMigrationError('legacy save migration failed', { cause: error });
  }
}

export class SqliteRpgStorage implements RpgGuardedKeyValueStorage {
  readonly supportsGuardedWrites = true;
  constructor(private readonly db: SQLiteDatabase) {}

  readStringStrict(key: string): string | null {
    const row = this.db.getFirstSync<{ value: string }>(SQL_GET, key);
    return row?.value ?? null;
  }

  getString(key: string): string | null {
    try {
      return this.readStringStrict(key);
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

  guardedWrite(key: string, expected: string | null, value: string, backup?: RpgSaveBackup): RpgGuardedWriteResult {
    let result: RpgGuardedWriteResult = 'write_failed';
    try {
      this.db.withTransactionSync(() => {
        if (this.readStringStrict(key) !== expected) {
          result = 'conflict';
          return;
        }
        if (backup) {
          result = 'backup_failed';
          const existing = this.readStringStrict(backup.key);
          if (existing !== null && existing !== backup.value) {
            result = 'backup_failed';
            return;
          }
          if (existing === null) writeString(this.db, backup.key, backup.value);
          if (this.readStringStrict(backup.key) !== backup.value) {
            result = 'backup_failed';
            throw new Error('backup read-back mismatch');
          }
        }
        result = 'write_failed';
        writeString(this.db, key, value);
        if (this.readStringStrict(key) !== value) throw new Error('save read-back mismatch');
        result = 'written';
      });
      return result;
    } catch (error) {
      warn('guarded save transaction failed', error);
      return (result as RpgGuardedWriteResult) === 'backup_failed' ? 'backup_failed' : 'write_failed';
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
export class LocalStorageRpgStorage implements RpgGuardedKeyValueStorage {
  readonly supportsGuardedWrites = true;
  constructor(private readonly backing: SimpleLocalStorage) {}

  readStringStrict(key: string): string | null {
    return key === RPG_STORAGE_KEY
      ? this.backing.getItem(RPG_FALLBACK_ACTIVE_KEY) ?? this.backing.getItem(key)
      : this.backing.getItem(key);
  }

  // Keep the legacy key untouched. The fallback writes a separate active copy,
  // so even a cross-tab race cannot overwrite the old key before backup.
  guardedWrite(key: string, expected: string | null, value: string, backup?: RpgSaveBackup): RpgGuardedWriteResult {
    if (key !== RPG_STORAGE_KEY) return 'unavailable';
    try {
      if (this.readStringStrict(key) !== expected) return 'conflict';
      if (backup) {
        const old = this.backing.getItem(backup.key);
        if (old !== null && old !== backup.value) return 'backup_failed';
        if (old === null) this.backing.setItem(backup.key, backup.value);
        if (this.backing.getItem(backup.key) !== backup.value) return 'backup_failed';
      }
      if (this.readStringStrict(key) !== expected) return 'conflict';
      this.backing.setItem(RPG_FALLBACK_ACTIVE_KEY, value);
      return this.backing.getItem(RPG_FALLBACK_ACTIVE_KEY) === value ? 'written' : 'write_failed';
    } catch {
      return 'write_failed';
    }
  }

  getString(key: string): string | null {
    try {
      return this.readStringStrict(key);
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

let cachedStorage: RpgGuardedKeyValueStorage | null = null;

class UnavailableRpgStorage implements RpgGuardedKeyValueStorage {
  readonly supportsGuardedWrites = false;
  readStringStrict(): never { throw new Error('RPG storage unavailable'); }
  getString(): never { throw new Error('RPG storage unavailable'); }
  setString(): never { throw new Error('RPG storage unavailable'); }
  guardedWrite(): RpgGuardedWriteResult { return 'unavailable'; }
}

function createRpgStorage(): RpgGuardedKeyValueStorage {
  const db = openDatabaseSync(RPG_DB_NAME);
  try {
    db.execSync(SCHEMA_SQL);
    migrateLegacySave(db);
    return new SqliteRpgStorage(db);
  } catch (error) {
    try { db.closeSync(); } catch { /* Preserve the original failure. */ }
    throw error;
  }
}

function createFallbackStorage(): RpgGuardedKeyValueStorage {
  const local = getGlobalLocalStorage();
  if (local) {
    return new LocalStorageRpgStorage(local);
  }
  return new MemoryRpgStorage();
}

/**
 * Keep Android and failed migrations protected until the original store can be
 * reopened. Other platforms retain their existing SQLite-open fallback.
 */
export function getRpgStorage(): RpgGuardedKeyValueStorage {
  if (cachedStorage) return cachedStorage;

  try {
    cachedStorage = createRpgStorage();
  } catch (error) {
    warn('failed to open or migrate RPG storage', error);
    if (Platform.OS === 'android' || error instanceof LegacyMigrationError) {
      // Do not cache failures: the user can retry the original SQLite store.
      return new UnavailableRpgStorage();
    }
    cachedStorage = createFallbackStorage();
  }

  return cachedStorage;
}
