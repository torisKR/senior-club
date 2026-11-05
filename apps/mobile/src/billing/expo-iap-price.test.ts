import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createExpoIapBilling } from './expo-iap-billing';
import { REMOVE_ADS_PRODUCT_ID } from './product';

const store = vi.hoisted(() => ({
  initConnection: vi.fn(), fetchProducts: vi.fn(), getAvailablePurchases: vi.fn(), finishTransaction: vi.fn(),
}));
vi.mock('expo-iap', () => ({
  ...store,
  endConnection: vi.fn(),
  purchaseErrorListener: vi.fn(), purchaseUpdatedListener: vi.fn(), requestPurchase: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  store.initConnection.mockResolvedValue(true);
});

describe('Play acknowledgement', () => {
  it('acknowledges an unfinished purchase once and skips already acknowledged ones', async () => {
    const unfinished = { productId: REMOVE_ADS_PRODUCT_ID, purchaseToken: 'fixture', purchaseState: 'purchased', isAcknowledgedAndroid: false };
    store.getAvailablePurchases.mockResolvedValue([unfinished]);
    store.finishTransaction.mockResolvedValue(undefined);
    const billing = createExpoIapBilling();
    const purchase = { productId: REMOVE_ADS_PRODUCT_ID, purchaseToken: 'fixture', isPending: false };
    await billing.finish(purchase);
    await billing.finish(purchase);
    expect(store.finishTransaction).toHaveBeenCalledOnce();

    store.getAvailablePurchases.mockResolvedValue([{ ...unfinished, isAcknowledgedAndroid: true }]);
    await createExpoIapBilling().finish(purchase);
    expect(store.finishTransaction).toHaveBeenCalledOnce();
  });
});

describe('Play product price', () => {
  it('uses the matching store product price', async () => {
    store.fetchProducts.mockResolvedValue([
      { id: 'other', type: 'in-app', displayPrice: '$1.00' },
      { id: REMOVE_ADS_PRODUCT_ID, type: 'in-app', displayPrice: '₩4,900' },
    ]);
    expect(await createExpoIapBilling().productPrice(REMOVE_ADS_PRODUCT_ID)).toBe('₩4,900');
    expect(store.fetchProducts).toHaveBeenCalledWith({ skus: [REMOVE_ADS_PRODUCT_ID], type: 'in-app' });
  });

  it('reports no price when the product is absent or Play is unavailable', async () => {
    store.fetchProducts.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('offline'));
    const billing = createExpoIapBilling();
    expect(await billing.productPrice(REMOVE_ADS_PRODUCT_ID)).toBeNull();
    expect(await billing.productPrice(REMOVE_ADS_PRODUCT_ID)).toBeNull();
  });

  it('retries a failed Play connection on the next price request', async () => {
    store.initConnection.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    store.fetchProducts.mockResolvedValue([{ id: REMOVE_ADS_PRODUCT_ID, type: 'in-app', displayPrice: '₩4,900' }]);
    const billing = createExpoIapBilling();
    expect(await billing.productPrice(REMOVE_ADS_PRODUCT_ID)).toBeNull();
    expect(await billing.productPrice(REMOVE_ADS_PRODUCT_ID)).toBe('₩4,900');
    expect(store.initConnection).toHaveBeenCalledTimes(2);
  });
});
