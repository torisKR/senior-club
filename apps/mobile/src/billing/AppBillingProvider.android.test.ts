// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppBillingProvider } from './AppBillingProvider';
import { useCosmeticBilling } from './CosmeticBillingProvider';
import { COSMETIC_PRODUCTS } from './cosmetic-products';
import { createFakeBilling } from './fake-billing';

const state = vi.hoisted(() => ({
  billing: undefined as unknown,
  listeners: new Set<(next: string) => void>(),
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: {
    addEventListener: (_name: string, listener: (next: string) => void) => {
      state.listeners.add(listener);
      return { remove: () => state.listeners.delete(listener) };
    },
  },
}));
vi.mock('./expo-iap-billing', () => ({ createExpoIapBilling: () => state.billing }));
vi.mock('./plus-token-store', () => ({
  createPlusTokenStore: () => ({ get: async () => null, set: async () => undefined, clear: async () => undefined }),
  createCosmeticTokenStore: () => ({ get: async () => null, set: async () => undefined, clear: async () => undefined }),
}));
vi.mock('./revenuecat-observer', () => ({
  initializeRevenueCatObserver: async () => undefined,
  syncRevenueCatPurchase: async () => undefined,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  state.listeners.clear();
});

describe('Android billing provider acknowledgement', () => {
  it('retries a purchase from the live provider on foreground return', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const fake = createFakeBilling();
    const finish = vi.fn(fake.billing.finish)
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'));
    state.billing = { ...fake.billing, finish };
    let current: ReturnType<typeof useCosmeticBilling>;
    function Probe() {
      const value = useCosmeticBilling();
      useEffect(() => { current = value; }, [value]);
      return null;
    }
    const root = createRoot(document.createElement('div'));
    await act(async () => root.render(createElement(AppBillingProvider, null, createElement(Probe))));
    await act(async () => {
      expect(await current.buy(COSMETIC_PRODUCTS[0].id)).toEqual({ status: 'owned' });
    });
    expect(finish).toHaveBeenCalledTimes(3);
    await act(async () => {
      state.listeners.forEach((listener) => listener('active'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fake.finishedTokens()).toHaveLength(1);
    await act(async () => root.unmount());
    expect(state.listeners.size).toBe(0);
  });
});
