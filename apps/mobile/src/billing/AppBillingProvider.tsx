import React from 'react';
import { AppState, Platform } from 'react-native';

import { createAcknowledgementRetryBilling } from './acknowledgement-retry';
import { BillingProvider } from './BillingProvider';
import { createExpoIapBilling } from './expo-iap-billing';
import { createCosmeticTokenStore, createPlusTokenStore } from './plus-token-store';
import { COSMETIC_PRODUCTS } from './cosmetic-products';
import { CosmeticBillingProvider, type CosmeticStores } from './CosmeticBillingProvider';
import { initializeRevenueCatObserver, syncRevenueCatPurchase } from './revenuecat-observer';

export function AppBillingProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement {
  const { billing, retry } = React.useMemo(() => {
    const delegate = createExpoIapBilling();
    const retry = Platform.OS === 'android' ? createAcknowledgementRetryBilling(delegate) : null;
    return { billing: retry?.billing ?? delegate, retry };
  }, []);
  const tokens = React.useMemo(() => createPlusTokenStore(), []);
  const cosmeticStores = React.useMemo(() => Object.fromEntries(
    COSMETIC_PRODUCTS.map(({ id }) => [id, createCosmeticTokenStore(id)]),
  ) as CosmeticStores, []);

  React.useEffect(() => {
    void initializeRevenueCatObserver().catch(() => undefined);
  }, []);

  React.useEffect(() => {
    if (!retry) return;
    retry.start();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') retry.retryNow();
    });
    return () => { subscription.remove(); retry.stop(); };
  }, [retry]);

  return (
    <BillingProvider billing={billing} tokens={tokens} syncPurchase={syncRevenueCatPurchase}>
      <CosmeticBillingProvider billing={billing} stores={cosmeticStores} syncPurchase={syncRevenueCatPurchase}>
        {children}
      </CosmeticBillingProvider>
    </BillingProvider>
  );
}
