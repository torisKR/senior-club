import { describe, expect, it, vi } from 'vitest';
import {
  buildPendingAuthHref,
  consumePendingAuthNavigation,
  isPendingAuthDestination,
  persistPendingAuthNavigation,
  readPendingAuthNavigation,
} from '@/auth/pending-auth-navigation';
import { createPendingAuthIntentStore } from '@/auth/pending-intent-store';
import type { SecureKeyValueStore } from '@/auth/session-store';

vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock('@/api/idempotency-key', () => ({
  createNativeIdempotencyKey: () => '00000000-0000-4000-8000-000000000000',
}));

function createPersistentMemory() {
  const values = new Map<string, string>();
  const storage: SecureKeyValueStore = {
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      values.set(key, value);
    },
    deleteItemAsync: async (key) => {
      values.delete(key);
    },
  };
  return { storage, values };
}

describe('pending auth navigation', () => {
  it('restores an apply return route through login and onboarding after a process restart', async () => {
    const { storage } = createPersistentMemory();
    const beforeRestart = createPendingAuthIntentStore({ storage, now: () => 1_000 });

    const saved = await persistPendingAuthNavigation(
      { returnTo: '/event/event-123', intent: 'apply' },
      {
        store: beforeRestart,
        createState: () => 'secure-state-0000000000000001',
      },
    );

    const afterRestart = createPendingAuthIntentStore({ storage, now: () => 2_000 });
    const restored = await readPendingAuthNavigation({ store: afterRestart });

    expect(restored).toEqual(saved);
    expect(buildPendingAuthHref(restored!, 'anonymous')).toEqual({
      pathname: '/login',
      params: { returnTo: '/event/event-123', intent: 'apply' },
    });
    expect(buildPendingAuthHref(restored!, 'onboarding')).toEqual({
      pathname: '/onboarding',
      params: { returnTo: '/event/event-123', intent: 'apply' },
    });
    expect(buildPendingAuthHref(restored!, 'complete')).toBe(
      '/event/event-123?intent=apply',
    );
  });

  it('does not replace a matching OAuth intent or extend its expiry', async () => {
    const { storage } = createPersistentMemory();
    const store = createPendingAuthIntentStore({ storage, now: () => 10_000 });
    const original = await store.save({
      provider: 'google',
      state: 'google-state-000000000000001',
      codeVerifier: 'a'.repeat(43),
      returnTo: '/event/event-123',
      action: 'apply',
      ttlMs: 60_000,
    });
    const createState = vi.fn(() => 'replacement-state-000000001');

    const persisted = await persistPendingAuthNavigation(
      { returnTo: '/event/event-123', intent: 'apply' },
      { store, createState },
    );

    expect(persisted.state).toBe(original.state);
    expect(createState).not.toHaveBeenCalled();
    expect((await store.peek())?.provider).toBe('google');
    expect((await store.peek())?.expiresAt).toBe(original.expiresAt);
  });

  it('consumes only the matching state after reaching the validated destination', async () => {
    const { storage } = createPersistentMemory();
    const store = createPendingAuthIntentStore({ storage, now: () => 1_000 });
    const pending = await persistPendingAuthNavigation(
      { returnTo: '/event/event-123', intent: 'apply' },
      { store, createState: () => 'secure-state-0000000000000001' },
    );

    expect(isPendingAuthDestination('/event/event-123', pending)).toBe(true);
    expect(isPendingAuthDestination('/events', pending)).toBe(false);
    expect(await consumePendingAuthNavigation('wrong-state-00000000000001', { store })).toBeNull();
    expect(await readPendingAuthNavigation({ store })).toEqual(pending);
    expect(await consumePendingAuthNavigation(pending.state, { store })).toEqual(pending);
    expect(await readPendingAuthNavigation({ store })).toBeNull();
  });

  it('expires the stored route instead of replaying stale intent', async () => {
    const { storage, values } = createPersistentMemory();
    let now = 1_000;
    const store = createPendingAuthIntentStore({ storage, now: () => now });
    await persistPendingAuthNavigation(
      { returnTo: '/event/event-123', intent: 'apply' },
      { store, createState: () => 'secure-state-0000000000000001' },
    );

    now += 30 * 60 * 1_000 + 1;

    expect(await readPendingAuthNavigation({ store })).toBeNull();
    expect(values.size).toBe(0);
  });
});
