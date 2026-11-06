import { describe, expect, it, vi } from 'vitest';

import { createFakeBilling } from './fake-billing';
import type { TokenStore } from './billing-port';
import { purchaseRemoveAds, restoreRemoveAds, syncEntitlement } from './remove-ads';

const SEEDED = 'apjeidfnak.AO-J1Oy_SEEDED';

function createMemoryTokens(initial: string | null = null): TokenStore {
  let value = initial;
  return {
    async get() {
      return value;
    },
    async set(token) {
      value = token;
    },
    async clear() {
      value = null;
    },
  };
}

describe('syncEntitlement', () => {
  it('waits for the billing connection before querying ownership', async () => {
    const fake = createFakeBilling();
    let resolveConnect!: () => void;
    const connect = vi.fn(() => new Promise<void>((resolve) => { resolveConnect = resolve; }));
    const ownedTokens = vi.fn(fake.billing.ownedTokens);
    const syncing = syncEntitlement({ billing: { ...fake.billing, connect, ownedTokens }, tokens: createMemoryTokens() });
    await Promise.resolve();
    await Promise.resolve();
    expect(connect).toHaveBeenCalledOnce();
    expect(ownedTokens).not.toHaveBeenCalled();
    resolveConnect();
    await expect(syncing).resolves.toBe(false);
    expect(ownedTokens).toHaveBeenCalledOnce();
  });

  it('keeps a stored purchase when Play is offline', async () => {
    const fake = createFakeBilling();
    const tokens = createMemoryTokens(SEEDED);
    fake.setProbeUnavailable(true);

    await expect(syncEntitlement({ billing: fake.billing, tokens })).resolves.toBe(true);
    await expect(tokens.get()).resolves.toBe(SEEDED);
  });

  it('clears a stored purchase when Play reports none', async () => {
    const fake = createFakeBilling();
    const tokens = createMemoryTokens(SEEDED);

    await expect(syncEntitlement({ billing: fake.billing, tokens })).resolves.toBe(false);
    await expect(tokens.get()).resolves.toBeNull();
  });
});

describe('purchaseRemoveAds', () => {
  it('stores the token and acknowledges the purchase', async () => {
    const fake = createFakeBilling();
    const tokens = createMemoryTokens();

    await expect(purchaseRemoveAds({ billing: fake.billing, tokens })).resolves.toEqual({
      status: 'owned',
    });
    await expect(tokens.get()).resolves.toMatch(/^apjeidfnak\./);
    expect(fake.finishedTokens()).toHaveLength(1);
  });

  it('retries an acknowledgement after a transient store failure', async () => {
    const fake = createFakeBilling();
    const tokens = createMemoryTokens();
    fake.failNextFinish('retryable');

    await expect(purchaseRemoveAds({ billing: fake.billing, tokens })).resolves.toEqual({ status: 'owned' });
    expect(fake.finishedTokens()).toHaveLength(1);
  });

  it('acknowledges and grants a Play purchase even when local cache storage fails', async () => {
    const fake = createFakeBilling();
    const tokens: TokenStore = {
      get: async () => null,
      set: async () => { throw new Error('storage unavailable'); },
      clear: async () => undefined,
    };

    await expect(purchaseRemoveAds({ billing: fake.billing, tokens })).resolves.toEqual({ status: 'owned' });
    expect(fake.finishedTokens()).toHaveLength(1);
    await expect(syncEntitlement({ billing: fake.billing, tokens })).resolves.toBe(true);
    expect(fake.finishedTokens()).toHaveLength(2);
  });

  it('rejects a purchase returned for a different product', async () => {
    const fake = createFakeBilling();
    const billing = { ...fake.billing, buy: async () => ({ productId: 'other.product', purchaseToken: 'wrong', isPending: false }) };
    const tokens = createMemoryTokens();

    await expect(purchaseRemoveAds({ billing, tokens })).resolves.toEqual({ status: 'failed', code: 'product-invalid', retryable: false });
    await expect(tokens.get()).resolves.toBeNull();
    expect(fake.finishedTokens()).toHaveLength(0);
  });

  it('does not treat a cancelled sheet as a failure', async () => {
    const fake = createFakeBilling();
    const tokens = createMemoryTokens();
    fake.failNextBuy('user-cancelled');

    await expect(purchaseRemoveAds({ billing: fake.billing, tokens })).resolves.toEqual({
      status: 'cancelled',
    });
    await expect(tokens.get()).resolves.toBeNull();
  });

  it('restores when Play says the item is already owned', async () => {
    const fake = createFakeBilling();
    const tokens = createMemoryTokens();
    fake.seedOwned(SEEDED);
    fake.failNextBuy('already-owned');

    await expect(purchaseRemoveAds({ billing: fake.billing, tokens })).resolves.toEqual({
      status: 'owned',
    });
    await expect(tokens.get()).resolves.toBe(SEEDED);
  });
});

describe('restoreRemoveAds', () => {
  it('reports none when there is nothing to restore', async () => {
    const fake = createFakeBilling();
    const tokens = createMemoryTokens();

    await expect(restoreRemoveAds({ billing: fake.billing, tokens })).resolves.toEqual({
      status: 'none',
    });
  });
});
