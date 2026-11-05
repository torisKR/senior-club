import React from 'react';

import type { BillingPort, TokenStore } from './billing-port';
import type { PurchaseOutcome, RestoreOutcome } from './remove-ads';
import { purchaseRemoveAds, restoreRemoveAds, syncEntitlement } from './remove-ads';
import { REMOVE_ADS_PRODUCT_ID } from './product';
import { useBillingReconciliation } from './use-billing-reconciliation';

export type BillingContextValue = {
  readonly owned: boolean;
  readonly ready: boolean;
  readonly price: string | null;
  readonly priceLoaded: boolean;
  readonly retryPrice: () => void;
  readonly buy: () => Promise<PurchaseOutcome>;
  readonly restore: () => Promise<RestoreOutcome>;
};

const BillingContext = React.createContext<BillingContextValue | null>(null);

export function useBilling(): BillingContextValue {
  const value = React.useContext(BillingContext);
  if (value === null) {
    throw new Error('useBilling must be called inside a BillingProvider');
  }
  return value;
}

export function useAdsAllowed(): boolean {
  const value = React.useContext(BillingContext);
  if (value === null) return false;
  return value.ready && !value.owned;
}

export type BillingProviderProps = {
  readonly children?: React.ReactNode;
  readonly billing: BillingPort;
  readonly tokens: TokenStore;
  readonly syncPurchase?: () => Promise<void>;
};

export function BillingProvider({
  children,
  billing,
  tokens,
  syncPurchase,
}: BillingProviderProps): React.ReactElement {
  const [owned, setOwned] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [price, setPrice] = React.useState<string | null>(null);
  const [priceLoaded, setPriceLoaded] = React.useState(false);
  const [priceAttempt, setPriceAttempt] = React.useState(0);
  const busy = React.useRef(false);
  const mounted = React.useRef(false);
  const deps = React.useMemo(() => ({ billing, tokens }), [billing, tokens]);

  const refresh = React.useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const next = await syncEntitlement(deps);
      if (mounted.current) {
        setOwned(next);
        setReady(true);
      }
    } finally {
      busy.current = false;
    }
  }, [deps]);

  React.useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; };
  }, [refresh]);
  useBillingReconciliation(refresh);

  React.useEffect(() => {
    let live = true;
    void billing.productPrice(REMOVE_ADS_PRODUCT_ID).catch(() => null).then((next) => {
      if (!live) return;
      setPrice(next);
      setPriceLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [billing, priceAttempt]);

  const retryPrice = React.useCallback(() => {
    setPriceLoaded(false);
    setPriceAttempt((attempt) => attempt + 1);
  }, []);

  const buy = React.useCallback(async (): Promise<PurchaseOutcome> => {
    if (busy.current) return { status: 'failed', code: 'retryable', retryable: true };
    busy.current = true;
    try {
      const outcome = await purchaseRemoveAds(deps);
      if (outcome.status === 'owned') {
        if (mounted.current) setOwned(true);
        void syncPurchase?.().catch(() => undefined);
      }
      return outcome;
    } finally {
      busy.current = false;
    }
  }, [deps, syncPurchase]);

  const restore = React.useCallback(async (): Promise<RestoreOutcome> => {
    if (busy.current) return { status: 'failed', code: 'retryable', retryable: true };
    busy.current = true;
    try {
      const outcome = await restoreRemoveAds(deps);
      if (outcome.status !== 'failed' && mounted.current) setOwned(outcome.status === 'owned');
      if (outcome.status === 'owned') void syncPurchase?.().catch(() => undefined);
      return outcome;
    } finally {
      busy.current = false;
    }
  }, [deps, syncPurchase]);

  const value = React.useMemo<BillingContextValue>(
    () => ({ owned, ready, price, priceLoaded, retryPrice, buy, restore }),
    [owned, ready, price, priceLoaded, retryPrice, buy, restore],
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}
