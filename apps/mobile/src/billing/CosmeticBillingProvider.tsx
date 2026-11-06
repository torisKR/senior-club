import React from 'react';

import type { BillingPort, TokenStore } from './billing-port';
import { COSMETIC_PRODUCTS, type CosmeticProductId } from './cosmetic-products';
import { purchaseNonConsumable, restoreNonConsumable, syncEntitlement, type PurchaseOutcome } from './remove-ads';
import { useBillingReconciliation } from './use-billing-reconciliation';

export type CosmeticState = { owned: boolean; ready: boolean; price: string | null; priceLoaded: boolean };
export type CosmeticStates = Record<CosmeticProductId, CosmeticState>;
export type CosmeticStores = Record<CosmeticProductId, TokenStore>;

function emptyStates(): CosmeticStates {
  return Object.fromEntries(COSMETIC_PRODUCTS.map(({ id }) => [id, {
    owned: false, ready: false, price: null, priceLoaded: false,
  }])) as CosmeticStates;
}

type CosmeticBillingValue = {
  readonly items: CosmeticStates;
  readonly buy: (id: CosmeticProductId) => Promise<PurchaseOutcome>;
  readonly restore: () => Promise<{ restored: number; failed: number }>;
  readonly retryPrice: (id: CosmeticProductId) => void;
};

const CosmeticBillingContext = React.createContext<CosmeticBillingValue>({
  items: emptyStates(),
  buy: async () => ({ status: 'failed', code: 'unavailable', retryable: true }),
  restore: async () => ({ restored: 0, failed: COSMETIC_PRODUCTS.length }),
  retryPrice: () => undefined,
});

export function useCosmeticBilling(): CosmeticBillingValue {
  return React.useContext(CosmeticBillingContext);
}

export function CosmeticBillingProvider({
  billing, stores, syncPurchase, children,
}: React.PropsWithChildren<{
  billing: BillingPort;
  stores: CosmeticStores;
  syncPurchase?: () => Promise<void>;
}>): React.ReactElement {
  const [items, setItems] = React.useState<CosmeticStates>(emptyStates);
  const busy = React.useRef(false);
  const mounted = React.useRef(false);

  const update = React.useCallback((id: CosmeticProductId, patch: Partial<CosmeticState>) => {
    if (!mounted.current) return;
    setItems((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }, []);

  const retryPrice = React.useCallback((id: CosmeticProductId) => {
    update(id, { price: null, priceLoaded: false });
    void billing.productPrice(id).catch(() => null).then((price) => update(id, { price, priceLoaded: true }));
  }, [billing, update]);

  const refresh = React.useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await Promise.all(COSMETIC_PRODUCTS.map(async ({ id }) => {
        const owned = await syncEntitlement({ billing, tokens: stores[id] }, id);
        update(id, { owned, ready: true });
      }));
    } finally {
      busy.current = false;
    }
  }, [billing, stores, update]);

  React.useEffect(() => {
    mounted.current = true;
    void refresh();
    for (const { id } of COSMETIC_PRODUCTS) retryPrice(id);
    return () => { mounted.current = false; };
  }, [refresh, retryPrice]);
  useBillingReconciliation(refresh, billing);

  const buy = React.useCallback(async (id: CosmeticProductId): Promise<PurchaseOutcome> => {
    if (busy.current || !items[id].ready || !items[id].price) {
      return { status: 'failed', code: 'retryable', retryable: true };
    }
    busy.current = true;
    try {
      const result = await purchaseNonConsumable({ billing, tokens: stores[id] }, id);
      if (result.status === 'owned') {
        update(id, { owned: true });
        void syncPurchase?.().catch(() => undefined);
      }
      return result;
    } finally {
      busy.current = false;
    }
  }, [billing, stores, items, syncPurchase, update]);

  const restore = React.useCallback(async () => {
    if (busy.current) return { restored: 0, failed: COSMETIC_PRODUCTS.length };
    busy.current = true;
    let restored = 0;
    let failed = 0;
    try {
      for (const { id } of COSMETIC_PRODUCTS) {
        const result = await restoreNonConsumable({ billing, tokens: stores[id] }, id);
        if (result.status === 'failed') { failed += 1; continue; }
        const owned = result.status === 'owned';
        if (owned) restored += 1;
        update(id, { owned, ready: true });
      }
      if (restored) void syncPurchase?.().catch(() => undefined);
      return { restored, failed };
    } finally {
      busy.current = false;
    }
  }, [billing, stores, syncPurchase, update]);

  const value = React.useMemo(() => ({ items, buy, restore, retryPrice }), [items, buy, restore, retryPrice]);
  return <CosmeticBillingContext.Provider value={value}>{children}</CosmeticBillingContext.Provider>;
}
