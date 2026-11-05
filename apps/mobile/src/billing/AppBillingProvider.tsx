import React from 'react';

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
  const billing = React.useMemo(() => createExpoIapBilling(), []);
  const tokens = React.useMemo(() => createPlusTokenStore(), []);
  const cosmeticStores = React.useMemo(() => Object.fromEntries(
    COSMETIC_PRODUCTS.map(({ id }) => [id, createCosmeticTokenStore(id)]),
  ) as CosmeticStores, []);

  React.useEffect(() => {
    void initializeRevenueCatObserver().catch(() => undefined);
  }, []);

  return (
    <BillingProvider billing={billing} tokens={tokens} syncPurchase={syncRevenueCatPurchase}>
      <CosmeticBillingProvider billing={billing} stores={cosmeticStores} syncPurchase={syncRevenueCatPurchase}>
        {children}
      </CosmeticBillingProvider>
    </BillingProvider>
  );
}
