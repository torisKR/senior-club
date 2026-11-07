import { describe, expect, it, vi } from 'vitest';

import {
  createAppStateStore,
  LEGACY_APP_STATE_STORAGE_KEYS,
  UI_PREFERENCES_STORAGE_KEY,
} from './app-state-store';

function memoryStorage(entries: [string, string][] = []) {
  const bytes = new Map(entries);
  let failWrites = false;
  return {
    bytes,
    getRaw: (key: string) => bytes.get(key) ?? null,
    set: <T>(key: string, value: T) => {
      if (failWrites) throw new Error('storage unavailable');
      bytes.set(key, JSON.stringify(value));
    },
    failWrites: () => { failWrites = true; },
  };
}

describe('offline game preferences', () => {
  it('reads the latest old font preference without changing game, billing or legacy saves', () => {
    const legacy = JSON.stringify({ largeTextEnabled: true, user: { name: 'former user' } });
    const source = memoryStorage([
      [LEGACY_APP_STATE_STORAGE_KEYS[0], legacy],
      ['senior_club_rpg_state_v1', 'rpg-save'],
      ['senior-club.arcade.v1', 'arcade-save'],
      ['purchase-key', 'purchase-save'],
    ]);
    const original = [...source.bytes.entries()];
    const store = createAppStateStore(source);
    expect(store.getSnapshot()).toEqual({ largeTextEnabled: true });
    expect([...source.bytes.entries()]).toEqual(original);

    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.update(() => ({ largeTextEnabled: false }));
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    expect(source.bytes.get(UI_PREFERENCES_STORAGE_KEY)).toBe('{"largeTextEnabled":false}');
    for (const [key, value] of original) expect(source.bytes.get(key)).toBe(value);
    expect(createAppStateStore(source).getSnapshot().largeTextEnabled).toBe(false);
  });

  it('prefers a valid current value and falls back through corrupt legacy values', () => {
    const source = memoryStorage([
      [UI_PREFERENCES_STORAGE_KEY, '{broken'],
      [LEGACY_APP_STATE_STORAGE_KEYS[0], '{"largeTextEnabled":"yes"}'],
      [LEGACY_APP_STATE_STORAGE_KEYS[1], '{"largeTextEnabled":false}'],
      [LEGACY_APP_STATE_STORAGE_KEYS[2], '{"largeTextEnabled":true}'],
    ]);
    expect(createAppStateStore(source).getSnapshot().largeTextEnabled).toBe(false);
    source.bytes.set(UI_PREFERENCES_STORAGE_KEY, '{"largeTextEnabled":true}');
    expect(createAppStateStore(source).getSnapshot().largeTextEnabled).toBe(true);
  });

  it('keeps the previous save when a preference write fails', () => {
    const old = '{"largeTextEnabled":true}';
    const source = memoryStorage([[LEGACY_APP_STATE_STORAGE_KEYS[0], old]]);
    source.failWrites();
    const store = createAppStateStore(source);
    store.update(() => ({ largeTextEnabled: false }));
    expect(store.getSnapshot().largeTextEnabled).toBe(false);
    expect(source.bytes.get(LEGACY_APP_STATE_STORAGE_KEYS[0])).toBe(old);
    expect(createAppStateStore(source).getSnapshot().largeTextEnabled).toBe(true);
  });
});
