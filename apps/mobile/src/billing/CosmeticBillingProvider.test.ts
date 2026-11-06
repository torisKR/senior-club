// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CosmeticBillingProvider, useCosmeticBilling, type CosmeticStores } from './CosmeticBillingProvider';
import { COSMETIC_PRODUCTS, type CosmeticProductId } from './cosmetic-products';
import { createFakeBilling, type FakeBilling } from './fake-billing';

vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
}));

const first = COSMETIC_PRODUCTS[0].id;
const second = COSMETIC_PRODUCTS[1].id;
let container: HTMLDivElement;
let root: Root;
let fake: FakeBilling;
let stores: CosmeticStores;
let current: ReturnType<typeof useCosmeticBilling>;
const sync = vi.fn();

function Probe() {
  const value = useCosmeticBilling();
  useEffect(() => { current = value; }, [value]);
  return null;
}

async function mount() {
  root = createRoot(container);
  await act(async () => root.render(createElement(CosmeticBillingProvider, {
    billing: fake.billing, stores, syncPurchase: sync,
  }, createElement(Probe))));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  sync.mockReset().mockResolvedValue(undefined);
  fake = createFakeBilling();
  const saved = new Map<CosmeticProductId, string>();
  stores = Object.fromEntries(COSMETIC_PRODUCTS.map(({ id }) => [id, {
    get: async () => saved.get(id) ?? null,
    set: async (token: string) => { saved.set(id, token); },
    clear: async () => { saved.delete(id); },
  }])) as CosmeticStores;
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('independent cosmetic purchases', () => {
  it('restores only the purchased item and leaves ad removal and other items independent', async () => {
    fake.seedOwnedProduct(first, 'owned-putter');
    await mount();
    expect(current.items[first]).toMatchObject({ owned: true, ready: true, price: '₩1,900' });
    expect(current.items[second]).toMatchObject({ owned: false, ready: true });
    expect(await fake.billing.ownedTokens()).toEqual({ status: 'ok', tokens: [] });
  });

  it('keeps a purchased item offline after restart and revokes it only after a successful empty Play query', async () => {
    await mount();
    await act(async () => { expect(await current.buy(first)).toEqual({ status: 'owned' }); });
    expect(current.items[first].owned).toBe(true);
    expect(sync).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    fake.setProbeUnavailable(true);
    await mount();
    expect(current.items[first].owned).toBe(true);
    fake.setProbeUnavailable(false);
    fake.seedOwnedProduct(first);
    await act(async () => { await current.restore(); });
    expect(current.items[first].owned).toBe(false);
  });
});
