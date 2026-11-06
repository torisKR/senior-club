import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAcknowledgementRetryBilling, RETRY_INITIAL_DELAY_MS } from './acknowledgement-retry';
import type { BillingPort, TokenStore } from './billing-port';
import { COSMETIC_PRODUCTS } from './cosmetic-products';
import { createFakeBilling } from './fake-billing';
import { purchaseNonConsumable, syncEntitlement } from './remove-ads';

const productId = COSMETIC_PRODUCTS[0].id;
const tokens: TokenStore = { get: async () => null, set: async () => undefined, clear: async () => undefined };

afterEach(() => vi.useRealTimers());

describe('purchase acknowledgement recovery', () => {
  it('keeps retrying a completed purchase after the immediate attempts fail', async () => {
    vi.useFakeTimers();
    const fake = createFakeBilling();
    const finish = vi.fn(fake.billing.finish)
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('still offline'));
    const retry = createAcknowledgementRetryBilling({ ...fake.billing, finish });

    expect(await purchaseNonConsumable({ billing: retry.billing, tokens }, productId)).toEqual({ status: 'owned' });
    expect(finish).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(RETRY_INITIAL_DELAY_MS);
    expect(finish).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(RETRY_INITIAL_DELAY_MS * 2 - 1);
    expect(finish).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(finish).toHaveBeenCalledTimes(5);
    expect(fake.finishedTokens()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(finish).toHaveBeenCalledTimes(5);
    retry.stop();
  });

  it('rechecks Play after an unavailable startup probe, even without a cached token', async () => {
    vi.useFakeTimers();
    const fake = createFakeBilling();
    fake.seedOwnedProduct(productId, 'owned-token');
    fake.setProbeUnavailable(true);
    const retry = createAcknowledgementRetryBilling(fake.billing);
    const recovered = vi.fn();
    const unsubscribe = retry.billing.subscribeReconciliation?.(recovered);

    expect(await syncEntitlement({ billing: retry.billing, tokens }, productId)).toBe(false);
    fake.setProbeUnavailable(false);
    await vi.advanceTimersByTimeAsync(RETRY_INITIAL_DELAY_MS);
    expect(fake.finishedTokens()).toEqual(['owned-token']);
    expect(recovered).toHaveBeenCalledOnce();
    unsubscribe?.();
    retry.stop();
  });

  it('retries a failed initial connection before querying each product', async () => {
    vi.useFakeTimers();
    const fake = createFakeBilling();
    fake.seedOwnedProduct(productId, 'owned-token');
    let available = false;
    const connect = vi.fn(async () => { if (!available) throw new Error('offline'); });
    const ownedTokens = vi.fn(fake.billing.ownedTokens);
    const retry = createAcknowledgementRetryBilling({ ...fake.billing, connect, ownedTokens });

    expect(await syncEntitlement({ billing: retry.billing, tokens }, productId)).toBe(false);
    expect(ownedTokens).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(RETRY_INITIAL_DELAY_MS);
    expect(ownedTokens).not.toHaveBeenCalled();
    available = true;
    await vi.advanceTimersByTimeAsync(RETRY_INITIAL_DELAY_MS * 2);
    expect(ownedTokens).toHaveBeenCalledWith(productId);
    expect(fake.finishedTokens()).toEqual(['owned-token']);
    retry.stop();
  });

  it('does not retry an item Play no longer reports as owned', async () => {
    vi.useFakeTimers();
    const fake = createFakeBilling();
    fake.seedOwnedProduct(productId, 'refunded-token');
    const finish = vi.fn().mockRejectedValue(new Error('offline'));
    const retry = createAcknowledgementRetryBilling({ ...fake.billing, finish });
    await expect(retry.billing.finish({ productId, purchaseToken: 'refunded-token', isPending: false })).rejects.toThrow();
    fake.seedOwnedProduct(productId);
    await vi.advanceTimersByTimeAsync(RETRY_INITIAL_DELAY_MS * 10);
    expect(finish).toHaveBeenCalledOnce();
    retry.stop();
  });

  it('cancels retries on stop and resumes unfinished work when restarted', async () => {
    vi.useFakeTimers();
    const fake = createFakeBilling();
    fake.seedOwnedProduct(productId, 'owned-token');
    const finish = vi.fn(fake.billing.finish).mockRejectedValueOnce(new Error('offline'));
    const retry = createAcknowledgementRetryBilling({ ...fake.billing, finish });
    await expect(retry.billing.finish({ productId, purchaseToken: 'owned-token', isPending: false })).rejects.toThrow();
    retry.stop();
    await vi.advanceTimersByTimeAsync(RETRY_INITIAL_DELAY_MS * 2);
    expect(finish).toHaveBeenCalledOnce();
    retry.start();
    await vi.advanceTimersByTimeAsync(RETRY_INITIAL_DELAY_MS);
    expect(fake.finishedTokens()).toEqual(['owned-token']);
    retry.stop();
  });

  it('does not queue pending transactions', async () => {
    vi.useFakeTimers();
    const finish = vi.fn().mockRejectedValue(new Error('pending'));
    const fake = createFakeBilling();
    const retry = createAcknowledgementRetryBilling({ ...fake.billing, finish } as BillingPort);
    await expect(retry.billing.finish({ productId, purchaseToken: 'pending-token', isPending: true })).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(RETRY_INITIAL_DELAY_MS * 10);
    expect(finish).toHaveBeenCalledOnce();
    retry.stop();
  });

  it('polls a pending purchase without granting it, then acknowledges it after approval', async () => {
    vi.useFakeTimers();
    const fake = createFakeBilling();
    let approved = false;
    const buy = vi.fn(async () => ({ productId, purchaseToken: 'pending-token', isPending: true }));
    const ownedTokens = vi.fn(async () => approved
      ? { status: 'ok' as const, tokens: ['pending-token'] }
      : { status: 'ok' as const, tokens: [], pending: true });
    const finish = vi.fn().mockResolvedValue(undefined);
    const retry = createAcknowledgementRetryBilling({ ...fake.billing, buy, ownedTokens, finish });
    expect(await purchaseNonConsumable({ billing: retry.billing, tokens }, productId)).toEqual({ status: 'pending' });
    await vi.advanceTimersByTimeAsync(RETRY_INITIAL_DELAY_MS);
    expect(finish).not.toHaveBeenCalled();
    approved = true;
    await vi.advanceTimersByTimeAsync(RETRY_INITIAL_DELAY_MS * 2);
    expect(finish).toHaveBeenCalledWith({ productId, purchaseToken: 'pending-token', isPending: false });
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(finish).toHaveBeenCalledOnce();
    retry.stop();
  });

  it('resumes polling a Play-pending purchase after app restart and stops if it is cancelled', async () => {
    vi.useFakeTimers();
    const fake = createFakeBilling();
    const ownedTokens = vi.fn()
      .mockResolvedValueOnce({ status: 'ok', tokens: [], pending: true })
      .mockResolvedValue({ status: 'ok', tokens: [] });
    const finish = vi.fn();
    const retry = createAcknowledgementRetryBilling({ ...fake.billing, ownedTokens, finish });
    expect(await syncEntitlement({ billing: retry.billing, tokens }, productId)).toBe(false);
    await vi.advanceTimersByTimeAsync(RETRY_INITIAL_DELAY_MS * 10);
    expect(ownedTokens).toHaveBeenCalledTimes(2);
    expect(finish).not.toHaveBeenCalled();
    retry.stop();
  });

  it('recovers an unacknowledged purchase from Play after a new app instance starts', async () => {
    vi.useFakeTimers();
    const fake = createFakeBilling();
    fake.seedOwnedProduct(productId, 'owned-after-restart');
    const retry = createAcknowledgementRetryBilling(fake.billing);
    expect(await syncEntitlement({ billing: retry.billing, tokens }, productId)).toBe(true);
    expect(fake.finishedTokens()).toEqual(['owned-after-restart']);
    retry.stop();
  });

  it('deduplicates overlapping acknowledgement attempts for one purchase', async () => {
    const fake = createFakeBilling();
    let resolve: () => void = () => undefined;
    const finish = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const retry = createAcknowledgementRetryBilling({ ...fake.billing, finish });
    const purchase = { productId, purchaseToken: 'same-purchase', isPending: false };
    const first = retry.billing.finish(purchase);
    const second = retry.billing.finish(purchase);
    await Promise.resolve();
    expect(finish).toHaveBeenCalledOnce();
    resolve();
    await Promise.all([first, second]);
    retry.stop();
  });

  it('immediately retries queued work on foreground return', async () => {
    vi.useFakeTimers();
    const fake = createFakeBilling();
    fake.seedOwnedProduct(productId, 'owned-token');
    const finish = vi.fn(fake.billing.finish).mockRejectedValueOnce(new Error('offline'));
    const retry = createAcknowledgementRetryBilling({ ...fake.billing, finish });
    await expect(retry.billing.finish({ productId, purchaseToken: 'owned-token', isPending: false })).rejects.toThrow();
    retry.retryNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.finishedTokens()).toEqual(['owned-token']);
    retry.stop();
  });
});
