// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BillingProvider, useBilling, type BillingContextValue, type BillingProviderProps } from './BillingProvider';
import { createFakeBilling, type FakeBilling } from './fake-billing';

vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
}));

let container: HTMLDivElement;
let root: Root;
let fake: FakeBilling;
let current: BillingContextValue;
const sync = vi.fn();

function Probe() {
  const value = useBilling();
  useEffect(() => { current = value; }, [value]);
  return null;
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  sync.mockReset();
  fake = createFakeBilling();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const tokens = { get: async () => null, set: async () => undefined, clear: async () => undefined };
  await act(async () => root.render(createElement(BillingProvider, {
    billing: fake.billing, tokens, syncPurchase: sync,
  } as BillingProviderProps, createElement(Probe))));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('billing and RevenueCat observer', () => {
  it('keeps a completed Play purchase even if the observer sync fails', async () => {
    sync.mockRejectedValue(new Error('offline'));
    await act(async () => { expect(await current.buy()).toEqual({ status: 'owned' }); });
    expect(current.owned).toBe(true);
    expect(sync).toHaveBeenCalledOnce();
    expect(fake.finishedTokens()).toHaveLength(1);
  });

  it('does not sync a cancelled purchase and syncs a user-initiated restore', async () => {
    sync.mockResolvedValue(undefined);
    fake.failNextBuy('user-cancelled');
    await act(async () => { expect(await current.buy()).toEqual({ status: 'cancelled' }); });
    expect(sync).not.toHaveBeenCalled();
    fake.seedOwned('fixture-token');
    await act(async () => { expect(await current.restore()).toEqual({ status: 'owned' }); });
    expect(sync).toHaveBeenCalledOnce();
  });

  it('updates the displayed ownership when a restore finds that a purchase was refunded', async () => {
    sync.mockResolvedValue(undefined);
    fake.seedOwned('fixture-token');
    await act(async () => { await current.restore(); });
    expect(current.owned).toBe(true);
    fake.seedOwned();
    await act(async () => { expect(await current.restore()).toEqual({ status: 'none' }); });
    expect(current.owned).toBe(false);
  });
});
