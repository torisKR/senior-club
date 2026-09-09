import { describe, expect, it } from 'vitest';

import { REMOVE_ADS_PRODUCT_ID } from './product';
import { mapVendorErrorCode, toBillingPurchase, toOwnedProbe, type VendorPurchase } from './expo-iap-mapping';

const purchased = (over: Partial<VendorPurchase> = {}): VendorPurchase => ({
  productId: REMOVE_ADS_PRODUCT_ID,
  purchaseToken: 'tok-1',
  purchaseState: 'purchased',
  ...over,
});

describe('mapVendorErrorCode', () => {
  it('maps cancel, already-owned, and deferred without treating them as generic failures', () => {
    expect(mapVendorErrorCode('user-cancelled')).toBe('user-cancelled');
    expect(mapVendorErrorCode('item-already-owned')).toBe('already-owned');
    expect(mapVendorErrorCode('pending')).toBe('deferred');
  });

  it('maps unknown vendor codes to retryable so a new Play code cannot lock the buy button', () => {
    expect(mapVendorErrorCode('brand-new-play-code')).toBe('retryable');
    expect(mapVendorErrorCode(undefined)).toBe('retryable');
  });
});

describe('toBillingPurchase', () => {
  it('drops purchases without a token', () => {
    expect(toBillingPurchase(purchased({ purchaseToken: '' }))).toBeNull();
  });

  it('marks pending Android purchases', () => {
    expect(toBillingPurchase(purchased({ purchaseState: 'pending' }))).toEqual({
      productId: REMOVE_ADS_PRODUCT_ID,
      purchaseToken: 'tok-1',
      isPending: true,
    });
  });
});

describe('toOwnedProbe', () => {
  it('ignores other products and pending purchases', () => {
    expect(
      toOwnedProbe([
        purchased({ productId: 'other.sku', purchaseToken: 'other' }),
        purchased({ purchaseState: 'pending', purchaseToken: 'pending-token' }),
        purchased({ purchaseToken: 'owned-token' }),
      ]),
    ).toEqual({ status: 'ok', tokens: ['owned-token'] });
  });
});
