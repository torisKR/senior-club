import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPlusTokenStore } from '@/billing/plus-token-store';
import { REMOVE_ADS_TOKEN_KEY } from '@/billing/product';
import { defaultSecureStoreOptions } from './session-store';

const fixture = vi.hoisted(() => ({ values: new Map<string, string>(), reads: [] as string[] }));
vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: async (key: string) => { fixture.reads.push(key); return fixture.values.get(key) ?? null; },
  setItemAsync: async (key: string, value: string) => { fixture.values.set(key, value); },
  deleteItemAsync: async (key: string) => { fixture.values.delete(key); },
}));


beforeEach(() => { fixture.values.clear(); fixture.reads.length = 0; });

describe('purchase SecureStore compatibility', () => {
  it('continues to read and write the existing purchase token without touching a legacy session', async () => {
    fixture.values.set(REMOVE_ADS_TOKEN_KEY, 'old-purchase-token');
    fixture.values.set('senior-club.session.v1', 'old-session');
    const store = createPlusTokenStore();
    expect(defaultSecureStoreOptions).toEqual({ keychainAccessible: 'device-only' });
    expect(await store.get()).toBe('old-purchase-token');
    await store.set('restored-purchase-token');
    expect(await store.get()).toBe('restored-purchase-token');
    expect(fixture.reads).toEqual([REMOVE_ADS_TOKEN_KEY, REMOVE_ADS_TOKEN_KEY]);
    expect(fixture.values.get('senior-club.session.v1')).toBe('old-session');
  });
});
