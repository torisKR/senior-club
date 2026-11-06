import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  values: new Map<string, string>(),
  metadata: new Map<string, string>(),
  legacy: new Map<string, string>(),
  open: vi.fn(),
}));

vi.mock('expo-sqlite', () => ({ openDatabaseSync: fixture.open }));
vi.mock('@/utils/storage', () => ({
  storage: {
    getRaw: (key: string) => fixture.legacy.get(key) ?? null,
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
    const { getRpgStorage, RPG_STORAGE_KEY, RPG_MIGRATION_META_KEY } = await import('./rpg-db');

    expect(getRpgStorage().getString(RPG_STORAGE_KEY)).toBe('{"stats":{"acorns":900}}');
    expect(fixture.legacy.get(RPG_STORAGE_KEY)).toBe('{"stats":{"acorns":1}}');
    expect(fixture.metadata.get(RPG_MIGRATION_META_KEY)).toBe('done');
  });

  it('keeps using the same localStorage key when SQLite is unavailable', async () => {
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
});
