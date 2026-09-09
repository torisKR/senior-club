import React from 'react';

import type { BillingPort, TokenStore } from './billing-port';
import type { PurchaseOutcome, RestoreOutcome } from './remove-ads';
import { purchaseRemoveAds, restoreRemoveAds, syncEntitlement } from './remove-ads';

export type BillingContextValue = {
  readonly owned: boolean;
  readonly ready: boolean;
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
  readonly children: React.ReactNode;
  readonly billing: BillingPort;
  readonly tokens: TokenStore;
};

export function BillingProvider({
  children,
  billing,
  tokens,
}: BillingProviderProps): React.ReactElement {
  const [owned, setOwned] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const deps = React.useMemo(() => ({ billing, tokens }), [billing, tokens]);

  React.useEffect(() => {
    let live = true;
    void syncEntitlement(deps).then((next) => {
      if (!live) return;
      setOwned(next);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [deps]);

  const buy = React.useCallback(async (): Promise<PurchaseOutcome> => {
    const outcome = await purchaseRemoveAds(deps);
    if (outcome.status === 'owned') setOwned(true);
    return outcome;
  }, [deps]);

  const restore = React.useCallback(async (): Promise<RestoreOutcome> => {
    const outcome = await restoreRemoveAds(deps);
    if (outcome.status === 'owned') setOwned(true);
    return outcome;
  }, [deps]);

  const value = React.useMemo<BillingContextValue>(
    () => ({ owned, ready, buy, restore }),
    [owned, ready, buy, restore],
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}
