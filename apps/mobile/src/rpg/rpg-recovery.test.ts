// @vitest-environment jsdom
import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  values: new Map<string, string>(),
  metadata: new Map<string, string>(),
  legacy: new Map<string, string>(),
  open: vi.fn(),
  legacyReadFails: false,
  openUrl: vi.fn(async () => undefined),
}));

vi.mock('expo-sqlite', () => ({ openDatabaseSync: fixture.open }));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  Alert: { alert: vi.fn() }, Linking: { openURL: fixture.openUrl },
}));
vi.mock('@/utils/storage', () => ({ storage: {
  getRaw: (key: string) => {
    if (fixture.legacyReadFails) throw new Error('legacy read failed');
    return fixture.legacy.get(key) ?? null;
  },
  set: (key: string, value: unknown) => fixture.legacy.set(key, JSON.stringify(value)),
} }));
vi.mock('@/components/ui', () => ({
  Screen: ({ children, testID }: { children?: ReactNode; testID?: string }) => createElement('div', { 'data-testid': testID }, children),
  AppText: ({ children }: { children?: ReactNode }) => createElement('p', null, children),
  SeniorButton: ({ label, onPress, testID }: { label: string; onPress?: () => void; testID?: string }) =>
    createElement('button', { onClick: onPress, 'data-testid': testID }, label),
}));

const key = 'senior_club_rpg_state_v1';
let root: Root;
let container: HTMLDivElement;

function fakeDatabase() {
  return {
    execSync: vi.fn(), closeSync: vi.fn(),
    getFirstSync: vi.fn((sql: string, name: string) => {
      const value = (sql.includes('rpg_meta') ? fixture.metadata : fixture.values).get(name);
      return value === undefined ? null : { value };
    }),
    runSync: vi.fn((sql: string, name: string, value: string) => {
      (sql.includes('rpg_meta') ? fixture.metadata : fixture.values).set(name, value);
    }),
    withTransactionSync: vi.fn((run: () => void) => run()),
  };
}

beforeEach(() => {
  vi.resetModules();
  fixture.values.clear(); fixture.metadata.clear(); fixture.legacy.clear();
  fixture.open.mockReset(); fixture.legacyReadFails = false;
  fixture.openUrl.mockClear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.parentNode?.removeChild(container);
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function mount() {
  const { RpgProvider, useRpg } = await import('./rpg-store');
  const { RpgStorageGate } = await import('./rpg-storage-gate');
  let current: ReturnType<typeof useRpg>;
  function Probe() {
    const value = useRpg();
    useEffect(() => { current = value; }, [value]);
    return null;
  }
  await act(async () => root.render(createElement(RpgProvider, null,
    createElement(Probe), createElement(RpgStorageGate, null,
      createElement('div', { 'data-testid': 'game-content' }, '게임 화면')))));
  return () => current!;
}

async function retry() {
  const button = container.querySelector<HTMLButtonElement>('[data-testid="retry-save-protection"]');
  expect(button).not.toBeNull();
  await act(async () => button!.click());
}

describe('Android RPG storage recovery', () => {
  it('blocks all game screens, retries SQLite, and restores the existing save', async () => {
    const original = JSON.stringify({ storyVersion: 3, currentChapterId: 'chapter_3', stats: { acorns: 900 }, lastSavedTimestampMs: Date.now() });
    fixture.values.set(key, original);
    fixture.open.mockImplementation(() => { throw new Error('database unavailable'); });
    const getCurrent = await mount();
    expect(getCurrent().saveProtection).toBe('unavailable');
    expect(container.textContent).toContain('저장 기록 보호 중');
    expect(container.textContent).toContain('앱 데이터를 지우거나 앱을 삭제하지');
    expect(container.querySelector('[data-testid="game-content"]')).toBeNull();
    const support = container.querySelector<HTMLButtonElement>('[data-testid="storage-support"]');
    await act(async () => support!.click());
    expect(fixture.openUrl).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\//));
    await act(async () => { getCurrent().movePlayer(1, 0); getCurrent().doMorningGym(); });
    await retry();
    expect(getCurrent().saveProtection).toBe('unavailable');
    expect(fixture.values.get(key)).toBe(original);

    fixture.open.mockReturnValue(fakeDatabase());
    await retry();
    expect(getCurrent().saveProtection).toBe('ready');
    expect(getCurrent().state.stats.acorns).toBe(900);
    expect(getCurrent().state.currentChapterId).toBe('chapter_3');
    expect(container.querySelector('[data-testid="game-content"]')).not.toBeNull();
  });

  it('keeps an invalid legacy record protected until it can be read and migrated', async () => {
    const db = fakeDatabase();
    fixture.open.mockReturnValue(db);
    fixture.legacy.set(key, '{broken');
    const getCurrent = await mount();
    expect(getCurrent().saveProtection).toBe('unavailable');
    await retry();
    expect(fixture.legacy.get(key)).toBe('{broken');
    expect(fixture.values.has(key)).toBe(false);
    expect(container.querySelector('[data-testid="game-content"]')).toBeNull();

    fixture.legacy.set(key, JSON.stringify({ stats: { acorns: 250 }, currentChapterId: 'chapter_2' }));
    await retry();
    expect(getCurrent().saveProtection).toBe('ready');
    expect(getCurrent().state.stats.acorns).toBe(250);
    expect(getCurrent().state.currentChapterId).toBe('chapter_2');
    expect(JSON.parse(fixture.legacy.get(key)!).stats.acorns).toBe(250);
  });

  it('allows a genuinely new game after SQLite and the legacy check succeed', async () => {
    fixture.open.mockImplementationOnce(() => { throw new Error('database unavailable'); });
    fixture.open.mockReturnValue(fakeDatabase());
    const getCurrent = await mount();
    expect(getCurrent().saveProtection).toBe('unavailable');
    expect(fixture.values.has(key)).toBe(false);
    await retry();
    expect(getCurrent().saveProtection).toBe('ready');
    expect(fixture.values.has(key)).toBe(false);
    await act(async () => getCurrent().movePlayer(1, 0));
    expect(fixture.values.has(key)).toBe(true);
  });

  it('retries a temporarily unreadable legacy save without creating a new one', async () => {
    fixture.open.mockReturnValue(fakeDatabase());
    const original = '{"stats":{"acorns":321},"currentChapterId":"chapter_2"}';
    fixture.legacy.set(key, original);
    fixture.legacyReadFails = true;
    const getCurrent = await mount();
    expect(getCurrent().saveProtection).toBe('unavailable');
    await retry();
    expect(fixture.values.has(key)).toBe(false);
    expect(fixture.legacy.get(key)).toBe(original);
    fixture.legacyReadFails = false;
    await retry();
    expect(getCurrent().saveProtection).toBe('ready');
    expect(getCurrent().state.stats.acorns).toBe(321);
    expect(fixture.legacy.get(key)).toBe(original);
  });

  it('rechecks an unreadable SQLite save without overwriting it', async () => {
    const db = fakeDatabase();
    const original = '{broken';
    fixture.values.set(key, original);
    fixture.metadata.set('migrated_from_async_storage_v1', 'done');
    fixture.open.mockReturnValue(db);
    const getCurrent = await mount();
    expect(getCurrent().saveProtection).toBe('read_failed');
    await retry();
    expect(getCurrent().saveProtection).toBe('read_failed');
    expect(fixture.values.get(key)).toBe(original);
    expect(db.runSync).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="game-content"]')).toBeNull();

    fixture.values.set(key, '{"storyVersion":3,"stats":{"acorns":654}}');
    await retry();
    expect(getCurrent().saveProtection).toBe('ready');
    expect(getCurrent().state.stats.acorns).toBe(654);
  });
});
