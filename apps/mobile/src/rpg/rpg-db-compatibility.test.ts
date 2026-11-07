import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

const fixture = vi.hoisted(() => ({
  values: new Map<string, string>(),
  metadata: new Map<string, string>(),
  legacy: new Map<string, string>(),
  open: vi.fn(),
  platform: { OS: 'android' },
  legacyReadFails: false,
}));

vi.mock('expo-sqlite', () => ({ openDatabaseSync: fixture.open }));
vi.mock('react-native', () => ({ Platform: fixture.platform }));
vi.mock('@/utils/storage', () => ({
  storage: {
    getRaw: (key: string) => {
      if (fixture.legacyReadFails) throw new Error('legacy read failed');
      return fixture.legacy.get(key) ?? null;
    },
    set: (key: string, value: unknown) => fixture.legacy.set(key, JSON.stringify(value)),
  },
}));

function fakeDatabase() {
  return {
    execSync: vi.fn(),
    getFirstSync: vi.fn((sql: string, key: string) => {
      const value = (sql.includes('rpg_meta') ? fixture.metadata : fixture.values).get(key);
      return value === undefined ? null : { value };
    }),
    runSync: vi.fn((sql: string, key: string, value: string) => {
      (sql.includes('rpg_meta') ? fixture.metadata : fixture.values).set(key, value);
    }),
    withTransactionSync: vi.fn((run: () => void) => run()),
  };
}

beforeEach(() => {
  vi.resetModules();
  fixture.values.clear();
  fixture.metadata.clear();
  fixture.legacy.clear();
  fixture.open.mockReset();
  fixture.platform.OS = 'android';
  fixture.legacyReadFails = false;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('RPG save compatibility', () => {
  it('copies a legacy save without changing its raw data or deleting the original', async () => {
    const db = fakeDatabase();
    fixture.open.mockReturnValue(db);
    const raw = JSON.stringify({ playerPos: { x: 2, y: 5 }, stats: { acorns: 250 }, futureField: 'keep' });
    fixture.legacy.set('senior_club_rpg_state_v1', raw);
    const { getRpgStorage, RPG_STORAGE_KEY, RPG_LEGACY_BACKUP_KEY, RPG_MIGRATION_META_KEY } = await import('./rpg-db');

    expect(getRpgStorage().getString(RPG_STORAGE_KEY)).toBe(raw);
    expect(fixture.legacy.get(RPG_STORAGE_KEY)).toBe(raw);
    expect(JSON.parse(fixture.legacy.get(RPG_LEGACY_BACKUP_KEY)!)).toMatchObject({ stats: { acorns: 250 } });
    expect(fixture.metadata.get(RPG_MIGRATION_META_KEY)).toBe('done');
    expect(db.withTransactionSync).toHaveBeenCalledOnce();
  });

  it('keeps an existing SQLite save instead of overwriting it with legacy data', async () => {
    const db = fakeDatabase();
    fixture.open.mockReturnValue(db);
    fixture.values.set('senior_club_rpg_state_v1', '{"stats":{"acorns":900}}');
    fixture.legacy.set('senior_club_rpg_state_v1', '{"stats":{"acorns":1}}');
    fixture.legacyReadFails = true;
    const { getRpgStorage, RPG_STORAGE_KEY, RPG_MIGRATION_META_KEY } = await import('./rpg-db');

    expect(getRpgStorage().getString(RPG_STORAGE_KEY)).toBe('{"stats":{"acorns":900}}');
    expect(fixture.legacy.get(RPG_STORAGE_KEY)).toBe('{"stats":{"acorns":1}}');
    expect(fixture.metadata.get(RPG_MIGRATION_META_KEY)).toBe('done');
  });

  it('allows a new save only after confirming that the legacy key is absent', async () => {
    const db = fakeDatabase();
    fixture.open.mockReturnValue(db);
    const { getRpgStorage, RPG_STORAGE_KEY, RPG_MIGRATION_META_KEY } = await import('./rpg-db');
    const store = getRpgStorage();
    expect(store.supportsGuardedWrites).toBe(true);
    expect(store.readStringStrict(RPG_STORAGE_KEY)).toBeNull();
    expect(fixture.metadata.has(RPG_MIGRATION_META_KEY)).toBe(false);
    expect(store.guardedWrite(RPG_STORAGE_KEY, null, '{"new":true}')).toBe('written');
  });

  it('protects a missing SQLite save when the migration marker says it already existed', async () => {
    const db = fakeDatabase();
    fixture.open.mockReturnValue(db);
    fixture.metadata.set('migrated_from_async_storage_v1', 'done');
    const raw = '{"stats":{"acorns":250}}';
    fixture.legacy.set('senior_club_rpg_state_v1', raw);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { getRpgStorage, RPG_STORAGE_KEY } = await import('./rpg-db');
    const store = getRpgStorage();
    expect(store.supportsGuardedWrites).toBe(false);
    expect(store.guardedWrite(RPG_STORAGE_KEY, null, 'new game')).toBe('unavailable');
    expect(fixture.values.has(RPG_STORAGE_KEY)).toBe(false);
    expect(fixture.legacy.get(RPG_STORAGE_KEY)).toBe(raw);
  });

  it.each(['read', 'invalid', 'empty', 'transaction'] as const)(
    'protects legacy data when migration fails at %s, then retries without branching',
    async (failure) => {
      const db = fakeDatabase();
      const original = failure === 'invalid' ? '{broken' : failure === 'empty' ? '' : '{"stats":{"acorns":250}}';
      fixture.legacy.set('senior_club_rpg_state_v1', original);
      fixture.legacyReadFails = failure === 'read';
      if (failure === 'transaction') db.withTransactionSync.mockImplementationOnce(() => { throw new Error('transaction failed'); });
      fixture.open.mockReturnValue(db);
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { getRpgStorage, RPG_STORAGE_KEY, RPG_MIGRATION_META_KEY } = await import('./rpg-db');

      const protectedStore = getRpgStorage();
      expect(protectedStore.supportsGuardedWrites).toBe(false);
      expect(protectedStore.guardedWrite(RPG_STORAGE_KEY, null, 'new game')).toBe('unavailable');
      expect(() => protectedStore.readStringStrict(RPG_STORAGE_KEY)).toThrow();
      expect(fixture.values.has(RPG_STORAGE_KEY)).toBe(false);
      expect(fixture.metadata.has(RPG_MIGRATION_META_KEY)).toBe(false);
      expect(fixture.legacy.get(RPG_STORAGE_KEY)).toBe(original);

      fixture.legacyReadFails = false;
      if (failure === 'invalid' || failure === 'empty') fixture.legacy.set(RPG_STORAGE_KEY, '{"stats":{"acorns":250}}');
      const recovered = getRpgStorage();
      expect(recovered.readStringStrict(RPG_STORAGE_KEY)).toBe('{"stats":{"acorns":250}}');
      expect(fixture.legacy.get(RPG_STORAGE_KEY)).toBe('{"stats":{"acorns":250}}');
    },
  );

  it('rolls back a partially written legacy migration if its marker fails', async () => {
    const database = new DatabaseSync(':memory:');
    let failMarker = true;
    const db = {
      execSync: (sql: string) => database.exec(sql),
      closeSync: vi.fn(),
      getFirstSync: (sql: string, ...values: SQLInputValue[]) => database.prepare(sql).get(...values) ?? null,
      runSync: (sql: string, ...values: SQLInputValue[]) => {
        if (failMarker && sql.includes('INSERT INTO rpg_meta')) throw new Error('marker failed');
        return database.prepare(sql).run(...values);
      },
      withTransactionSync: (action: () => void) => {
        database.exec('BEGIN');
        try { action(); database.exec('COMMIT'); }
        catch (error) { database.exec('ROLLBACK'); throw error; }
      },
    };
    const raw = '{"stats":{"acorns":250}}';
    fixture.legacy.set('senior_club_rpg_state_v1', raw);
    fixture.open.mockReturnValue(db);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { getRpgStorage, RPG_STORAGE_KEY } = await import('./rpg-db');
      expect(getRpgStorage().supportsGuardedWrites).toBe(false);
      expect(warning).toHaveBeenCalled();
      expect(database.prepare('SELECT value FROM rpg_kv WHERE key = ?').get(RPG_STORAGE_KEY)).toBeUndefined();
      expect(fixture.legacy.get(RPG_STORAGE_KEY)).toBe(raw);
      failMarker = false;
      expect(getRpgStorage().readStringStrict(RPG_STORAGE_KEY)).toBe(raw);
      expect(fixture.legacy.get(RPG_STORAGE_KEY)).toBe(raw);
    } finally {
      database.close();
    }
  });

  it('does not hide legacy migration failure behind the non-Android fallback', async () => {
    fixture.platform.OS = 'web';
    fixture.open.mockReturnValue(fakeDatabase());
    fixture.legacyReadFails = true;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const local = { getItem: vi.fn(() => null), setItem: vi.fn() };
    vi.stubGlobal('localStorage', local);
    const { getRpgStorage } = await import('./rpg-db');
    expect(getRpgStorage().supportsGuardedWrites).toBe(false);
    expect(local.getItem).not.toHaveBeenCalled();
    expect(local.setItem).not.toHaveBeenCalled();
  });

  it('never overwrites a SQLite record created while legacy migration begins', async () => {
    const db = fakeDatabase();
    const read = db.getFirstSync.getMockImplementation()!;
    let sourceReads = 0;
    db.getFirstSync.mockImplementation((sql: string, name: string) => {
      if (!sql.includes('rpg_meta') && name === 'senior_club_rpg_state_v1' && ++sourceReads === 2) {
        fixture.values.set(name, '{"stats":{"acorns":900}}');
      }
      return read(sql, name);
    });
    fixture.open.mockReturnValue(db);
    fixture.legacy.set('senior_club_rpg_state_v1', '{"stats":{"acorns":250}}');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { getRpgStorage, RPG_STORAGE_KEY } = await import('./rpg-db');
    expect(getRpgStorage().supportsGuardedWrites).toBe(false);
    expect(fixture.values.get(RPG_STORAGE_KEY)).toBe('{"stats":{"acorns":900}}');
    expect(fixture.legacy.get(RPG_STORAGE_KEY)).toBe('{"stats":{"acorns":250}}');
    expect(getRpgStorage().readStringStrict(RPG_STORAGE_KEY)).toBe('{"stats":{"acorns":900}}');
  });

  it('keeps non-Android localStorage fallback behavior when SQLite is unavailable', async () => {
    fixture.platform.OS = 'web';
    fixture.open.mockImplementation(() => { throw new Error('SQLite unavailable'); });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const local = new Map([['senior_club_rpg_state_v1', '{"stats":{"acorns":7}}']]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => local.get(key) ?? null,
      setItem: (key: string, value: string) => local.set(key, value),
    });
    const { getRpgStorage, RPG_STORAGE_KEY } = await import('./rpg-db');
    const store = getRpgStorage();

    expect(store.getString(RPG_STORAGE_KEY)).toBe('{"stats":{"acorns":7}}');
    store.setString(RPG_STORAGE_KEY, '{"stats":{"acorns":8}}');
    expect(local.get(RPG_STORAGE_KEY)).toBe('{"stats":{"acorns":8}}');
  });

  it.each(['open', 'schema'] as const)(
    'protects Android saves when SQLite %s fails and reopens the original on retry',
    async (failure) => {
      const db = fakeDatabase();
      const original = '{"stats":{"acorns":900}}';
      fixture.values.set('senior_club_rpg_state_v1', original);
      if (failure === 'open') fixture.open.mockImplementation(() => { throw new Error('open failed'); });
      else {
        db.execSync.mockImplementation(() => { throw new Error('schema failed'); });
        fixture.open.mockReturnValue(db);
      }
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const local = new Map([['senior_club_rpg_state_v1', '{"stats":{"acorns":1}}']]);
      const getItem = vi.fn((key: string) => local.get(key) ?? null);
      const setItem = vi.fn((key: string, value: string) => local.set(key, value));
      vi.stubGlobal('localStorage', { getItem, setItem });
      const { getRpgStorage, RPG_STORAGE_KEY } = await import('./rpg-db');
      const { loadRoundState, saveRound } = await import('../arcade/round-save');

      const unavailable = getRpgStorage();
      expect(unavailable.supportsGuardedWrites).toBe(false);
      expect(() => unavailable.readStringStrict(RPG_STORAGE_KEY)).toThrow();
      expect(() => unavailable.getString('round')).toThrow();
      expect(() => unavailable.setString('round', 'new round')).toThrow();
      expect(loadRoundState(unavailable, 'round', (_value): _value is object => true).status).toBe('protected');
      expect(saveRound(unavailable, 'round', { progress: 1 })).toBe('failed');
      expect(unavailable.guardedWrite(RPG_STORAGE_KEY, null, 'new game')).toBe('unavailable');
      expect(getItem).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
      expect(fixture.values.get(RPG_STORAGE_KEY)).toBe(original);

      db.execSync.mockReset();
      fixture.open.mockReturnValue(db);
      const recovered = getRpgStorage();
      expect(recovered.supportsGuardedWrites).toBe(true);
      expect(recovered.readStringStrict(RPG_STORAGE_KEY)).toBe(original);
      expect(fixture.values.get(RPG_STORAGE_KEY)).toBe(original);
      expect(local.get(RPG_STORAGE_KEY)).toBe('{"stats":{"acorns":1}}');
    },
  );
});
