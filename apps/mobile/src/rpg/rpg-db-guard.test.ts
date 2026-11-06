import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SQLiteDatabase } from 'expo-sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageRpgStorage, RPG_FALLBACK_ACTIVE_KEY, SqliteRpgStorage } from './rpg-db';

vi.mock('expo-sqlite', () => ({ openDatabaseSync: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('@/utils/storage', () => ({ storage: { getRaw: vi.fn(), set: vi.fn() } }));

const sourceKey = 'senior_club_rpg_state_v1';
const backup = { key: 'backup', value: '{"old":true}' };
const opened: DatabaseSync[] = [];
const tempDirs: string[] = [];
function setup(options: { dropBackup?: boolean; throwBackup?: boolean; dropMain?: boolean } = {}) {
  const db = new DatabaseSync(':memory:'); opened.push(db);
  db.exec('CREATE TABLE rpg_kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)');
  db.prepare('INSERT INTO rpg_kv VALUES (?, ?)').run(sourceKey, backup.value);
  const adapter = {
    getFirstSync: (sql: string, ...values: SQLInputValue[]) => db.prepare(sql).get(...values) ?? null,
    runSync: (sql: string, ...values: SQLInputValue[]) => {
      if (values[0] === backup.key && options.dropBackup) return;
      if (values[0] === backup.key && options.throwBackup) throw new Error('disk full');
      if (values[0] === sourceKey && options.dropMain) return;
      return db.prepare(sql).run(...values);
    },
    withTransactionSync: (action: () => void) => {
      db.exec('BEGIN');
      try { action(); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  return { db, storage: new SqliteRpgStorage(adapter as unknown as SQLiteDatabase) };
}
afterEach(() => { for (const db of opened.splice(0)) db.close(); for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true }); vi.restoreAllMocks(); });

describe('SQLite guarded RPG save', () => {
  it('commits a byte-identical backup before the new save in one transaction', () => {
    const { storage } = setup();
    expect(storage.guardedWrite(sourceKey, backup.value, '{"version":3}', backup)).toBe('written');
    expect(storage.readStringStrict(backup.key)).toBe(backup.value);
    expect(storage.readStringStrict(sourceKey)).toBe('{"version":3}');
  });

  it.each([{ dropBackup: true }, { throwBackup: true }])('keeps the source unchanged when backup writes fail silently or throw: %j', (options) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { storage } = setup(options);
    expect(storage.guardedWrite(sourceKey, backup.value, '{"version":3}', backup)).toBe('backup_failed');
    expect(storage.readStringStrict(sourceKey)).toBe(backup.value);
    expect(storage.readStringStrict(backup.key)).toBeNull();
  });

  it('rolls the backup back when the primary write is silently dropped', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { storage } = setup({ dropMain: true });
    expect(storage.guardedWrite(sourceKey, backup.value, 'new', backup)).toBe('write_failed');
    expect(storage.readStringStrict(sourceKey)).toBe(backup.value);
    expect(storage.readStringStrict(backup.key)).toBeNull();
  });

  it('does not clobber a second SQLite connection committing during the transaction', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const dir = mkdtempSync(join(tmpdir(), 'rpg-save-race-')); tempDirs.push(dir);
    const path = join(dir, 'save.sqlite');
    const db = new DatabaseSync(path); const other = new DatabaseSync(path); opened.push(db, other);
    db.exec('PRAGMA journal_mode=WAL; CREATE TABLE rpg_kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)');
    other.exec('PRAGMA journal_mode=WAL');
    db.prepare('INSERT INTO rpg_kv VALUES (?, ?)').run(sourceKey, backup.value);
    let raced = false;
    const adapter = {
      getFirstSync: (sql: string, ...values: SQLInputValue[]) => {
        const row = db.prepare(sql).get(...values) ?? null;
        if (!raced && values[0] === sourceKey) {
          raced = true;
          other.prepare('UPDATE rpg_kv SET value = ? WHERE key = ?').run('other writer', sourceKey);
        }
        return row;
      },
      runSync: (sql: string, ...values: SQLInputValue[]) => db.prepare(sql).run(...values),
      withTransactionSync: (action: () => void) => {
        db.exec('BEGIN');
        try { action(); db.exec('COMMIT'); }
        catch (error) { db.exec('ROLLBACK'); throw error; }
      },
    };
    const storage = new SqliteRpgStorage(adapter as unknown as SQLiteDatabase);
    expect(storage.guardedWrite(sourceKey, backup.value, 'new', backup)).not.toBe('written');
    expect(storage.readStringStrict(sourceKey)).toBe('other writer');
    expect(storage.readStringStrict(backup.key)).toBeNull();
  });

  it('does not overwrite either a conflicting backup or a source changed by another writer', () => {
    const { db, storage } = setup();
    db.prepare('INSERT INTO rpg_kv VALUES (?, ?)').run(backup.key, 'different snapshot');
    expect(storage.guardedWrite(sourceKey, backup.value, 'new', backup)).toBe('backup_failed');
    expect(storage.readStringStrict(sourceKey)).toBe(backup.value);
    expect(storage.readStringStrict(backup.key)).toBe('different snapshot');
    db.prepare('UPDATE rpg_kv SET value = ? WHERE key = ?').run('other writer', sourceKey);
    expect(storage.guardedWrite(sourceKey, backup.value, 'new', backup)).toBe('conflict');
    expect(storage.readStringStrict(sourceKey)).toBe('other writer');
    expect(storage.readStringStrict(backup.key)).toBe('different snapshot');
  });
});


describe('localStorage guarded fallback', () => {
  it('preserves the old key and restores the guarded active copy on restart', () => {
    const local = new Map([[sourceKey, backup.value]]);
    const api = { getItem: (key: string) => local.get(key) ?? null, setItem: (key: string, value: string) => { local.set(key, value); } };
    const first = new LocalStorageRpgStorage(api);
    expect(first.guardedWrite(sourceKey, backup.value, 'v3 save', backup)).toBe('written');
    expect(local.get(sourceKey)).toBe(backup.value);
    expect(local.get(backup.key)).toBe(backup.value);
    expect(local.get(RPG_FALLBACK_ACTIVE_KEY)).toBe('v3 save');
    const restarted = new LocalStorageRpgStorage(api);
    expect(restarted.readStringStrict(sourceKey)).toBe('v3 save');
    expect(restarted.guardedWrite(sourceKey, 'v3 save', 'next save')).toBe('written');
    expect(restarted.readStringStrict(sourceKey)).toBe('next save');
    expect(local.get(sourceKey)).toBe(backup.value);
  });

  it('detects a localStorage change between verifying the backup and writing the active copy', () => {
    const local = new Map([[sourceKey, backup.value]]);
    let backupReads = 0;
    const api = {
      getItem: (key: string) => {
        const value = local.get(key) ?? null;
        if (key === backup.key && ++backupReads === 2) local.set(sourceKey, 'other writer');
        return value;
      },
      setItem: (key: string, value: string) => { local.set(key, value); },
    };
    const store = new LocalStorageRpgStorage(api);
    expect(store.guardedWrite(sourceKey, backup.value, 'new', backup)).toBe('conflict');
    expect(local.get(sourceKey)).toBe('other writer');
    expect(local.get(backup.key)).toBe(backup.value);
    expect(local.has(RPG_FALLBACK_ACTIVE_KEY)).toBe(false);
  });

  it('never writes an active copy if backup read-back fails or the source changed', () => {
    const local = new Map([[sourceKey, backup.value]]);
    const api = {
      getItem: (key: string) => local.get(key) ?? null,
      setItem: (key: string, value: string) => { if (key !== backup.key) local.set(key, value); },
    };
    const store = new LocalStorageRpgStorage(api);
    expect(store.guardedWrite(sourceKey, backup.value, 'new', backup)).toBe('backup_failed');
    expect(local.get(sourceKey)).toBe(backup.value);
    expect(local.has(RPG_FALLBACK_ACTIVE_KEY)).toBe(false);
    local.set(sourceKey, 'other writer');
    expect(store.guardedWrite(sourceKey, backup.value, 'new', backup)).toBe('conflict');
    expect(local.get(sourceKey)).toBe('other writer');
    expect(local.has(RPG_FALLBACK_ACTIVE_KEY)).toBe(false);
  });
});
