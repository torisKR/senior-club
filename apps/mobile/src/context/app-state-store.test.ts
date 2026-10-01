import { describe, expect, it } from 'vitest';

import { createDefaultAppState } from '@/context/persisted-app-state';
import type { PersistedAppState } from '@/types';

import {
  createAppStateStore,
  LEGACY_APP_STATE_STORAGE_KEYS,
  UI_PREFERENCES_STORAGE_KEY,
} from './app-state-store';

const SENTINEL = 'private-member-sentinel';

function memberState(): PersistedAppState {
  return {
    ...createDefaultAppState(),
    largeTextEnabled: true,
    session: {
      userId: `${SENTINEL}-id`, email: `${SENTINEL}@example.org`,
      phoneNumber: '+821055551234', displayName: `${SENTINEL}-name`, role: 'admin',
      sessionId: `${SENTINEL}-session`, accessTokenExpiresAt: '2027-01-01T00:00:00Z',
      refreshTokenExpiresAt: '2027-02-01T00:00:00Z', signedInAt: '2026-10-01T00:00:00Z',
      onboardingCompletedAt: '2026-10-01T00:00:00Z',
    },
    user: {
      id: `${SENTINEL}-id`, email: `${SENTINEL}@example.org`, phoneNumber: '+821055551234',
      name: `${SENTINEL}-name`, role: 'admin', birthYear: 1951, ageGroup: '70대',
      region: `${SENTINEL}-region`, interestIds: [`${SENTINEL}-interest`],
      joinedClubIds: [`${SENTINEL}-club`], profileImageUri: `https://example.org/${SENTINEL}`,
    },
    selectedInterestIds: [`${SENTINEL}-interest`],
    onboardingCompleted: true,
    participations: [{
      id: `${SENTINEL}-application`, userId: `${SENTINEL}-id`, eventId: `${SENTINEL}-event`,
      status: 'approved', appliedAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
    }],
  };
}

function memoryStorage(entries: [string, string][] = []) {
  const bytes = new Map(entries);
  const failures = { read: false, write: false, remove: false };
  return {
    bytes, failures,
    getRaw(key: string) {
      if (failures.read) throw new Error('read unavailable');
      return bytes.get(key) ?? null;
    },
    set<T>(key: string, value: T) {
      if (failures.write) throw new Error('write unavailable');
      bytes.set(key, JSON.stringify(value));
    },
    remove(key: string) {
      if (failures.remove) throw new Error('remove unavailable');
      bytes.delete(key);
    },
  };
}

describe('preference-only generic persistence', () => {
  it('migrates the font preference while deleting all known legacy member caches', () => {
    const source = memoryStorage(LEGACY_APP_STATE_STORAGE_KEYS.map((key) => [
      key, JSON.stringify(memberState()),
    ]));
    source.bytes.set('unrelated.preference', 'keep-me');
    const store = createAppStateStore(source);
    expect(store.getSnapshot()).toEqual({ ...createDefaultAppState(), largeTextEnabled: true });
    for (const key of LEGACY_APP_STATE_STORAGE_KEYS) expect(source.bytes.has(key)).toBe(false);
    expect(source.bytes.get(UI_PREFERENCES_STORAGE_KEY)).toBe('{"largeTextEnabled":true}');
    expect(source.bytes.get('unrelated.preference')).toBe('keep-me');
    expect([...source.bytes.values()].join('')).not.toContain(SENTINEL);
  });

  it('keeps profile/session/activity in memory and persists only the exact allowlist', () => {
    const source = memoryStorage();
    const store = createAppStateStore(source);
    store.update(() => memberState());
    expect(store.getSnapshot().user.region).toBe(`${SENTINEL}-region`);
    expect(store.getSnapshot().participations).toHaveLength(1);
    expect([...source.bytes.entries()]).toEqual([[UI_PREFERENCES_STORAGE_KEY, '{"largeTextEnabled":true}']]);
    expect([...source.bytes.values()].join('')).not.toContain(SENTINEL);
    expect([...source.bytes.values()].join('')).not.toContain('+821055551234');
    expect([...source.bytes.values()].join('')).not.toContain('1951');
    expect(createAppStateStore(source).getSnapshot()).toEqual({ ...createDefaultAppState(), largeTextEnabled: true });
  });

  it('honors an explicit new false preference over legacy true and strips unexpected fields', () => {
    const source = memoryStorage([
      [UI_PREFERENCES_STORAGE_KEY, JSON.stringify({ largeTextEnabled: false, user: memberState().user })],
      [LEGACY_APP_STATE_STORAGE_KEYS[0], JSON.stringify(memberState())],
    ]);
    expect(createAppStateStore(source).getSnapshot().largeTextEnabled).toBe(false);
    expect([...source.bytes.entries()]).toEqual([[UI_PREFERENCES_STORAGE_KEY, '{"largeTextEnabled":false}']]);
  });

  it.each(['{broken', 'null', '[]', '{"largeTextEnabled":"true"}'])('removes malformed legacy cache %s without hydrating a member', (raw) => {
    const source = memoryStorage([[LEGACY_APP_STATE_STORAGE_KEYS[0], raw]]);
    expect(createAppStateStore(source).getSnapshot()).toEqual(createDefaultAppState());
    expect(source.bytes.has(LEGACY_APP_STATE_STORAGE_KEYS[0])).toBe(false);
  });

  it('falls back to a valid older font preference when the latest legacy cache is malformed', () => {
    const source = memoryStorage([
      [UI_PREFERENCES_STORAGE_KEY, '{broken'],
      [LEGACY_APP_STATE_STORAGE_KEYS[0], '{broken'],
      [LEGACY_APP_STATE_STORAGE_KEYS[1], JSON.stringify({ ...memberState(), largeTextEnabled: false })],
      [LEGACY_APP_STATE_STORAGE_KEYS[2], JSON.stringify(memberState())],
    ]);
    expect(createAppStateStore(source).getSnapshot().largeTextEnabled).toBe(false);
    expect([...source.bytes.entries()]).toEqual([[UI_PREFERENCES_STORAGE_KEY, '{"largeTextEnabled":false}']]);
  });

  it('sanitizes legacy bytes if deletion fails and retries deletion on a later update', () => {
    const source = memoryStorage([[LEGACY_APP_STATE_STORAGE_KEYS[0], JSON.stringify(memberState())]]);
    source.failures.remove = true;
    const store = createAppStateStore(source);
    expect([...source.bytes.values()].every((raw) => raw === '{"largeTextEnabled":true}')).toBe(true);
    source.failures.remove = false;
    store.update((current) => ({ ...current, largeTextEnabled: false }));
    expect([...source.bytes.entries()]).toEqual([[UI_PREFERENCES_STORAGE_KEY, '{"largeTextEnabled":false}']]);
  });

  it('does not hydrate stale account data when both deletion and writes fail, including after logout', () => {
    const source = memoryStorage([[LEGACY_APP_STATE_STORAGE_KEYS[0], JSON.stringify(memberState())]]);
    source.failures.write = source.failures.remove = true;
    const store = createAppStateStore(source);
    expect(store.getSnapshot().session).toBeNull();
    store.update(() => memberState());
    store.update((current) => ({ ...current, session: null }));
    expect(store.getSnapshot()).toEqual({ ...createDefaultAppState(), largeTextEnabled: true });
    expect(createAppStateStore(source).getSnapshot()).toEqual({ ...createDefaultAppState(), largeTextEnabled: true });
    // Physical erasure is best effort while the platform rejects both operations.
    expect(source.bytes.get(LEGACY_APP_STATE_STORAGE_KEYS[0])).toContain(SENTINEL);
    source.failures.write = source.failures.remove = false;
    store.update((current) => current);
    expect(source.bytes.has(LEGACY_APP_STATE_STORAGE_KEYS[0])).toBe(false);
  });

  it('keeps the migrated font setting in memory even if the preference write fails', () => {
    const source = memoryStorage([[LEGACY_APP_STATE_STORAGE_KEYS[0], JSON.stringify(memberState())]]);
    source.failures.write = true;
    const store = createAppStateStore(source);
    expect(store.getSnapshot().largeTextEnabled).toBe(true);
    expect(source.bytes.has(LEGACY_APP_STATE_STORAGE_KEYS[0])).toBe(false);
  });

  it('allows in-memory login/logout when generic storage is entirely unavailable', () => {
    const source = memoryStorage();
    source.failures.read = source.failures.write = source.failures.remove = true;
    const store = createAppStateStore(source);
    store.update(() => memberState());
    expect(store.getSnapshot().session?.userId).toBe(`${SENTINEL}-id`);
    store.update((current) => ({ ...current, session: null }));
    expect(store.getSnapshot().user.id).toBe('anonymous');
    expect(store.getSnapshot().participations).toEqual([]);
  });
});
