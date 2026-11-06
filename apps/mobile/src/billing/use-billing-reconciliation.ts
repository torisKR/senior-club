import React from 'react';
import { AppState } from 'react-native';

import type { BillingPort } from './billing-port';

/** Refresh after returning from Play or after a pending purchase is approved. */
export function useBillingReconciliation(refresh: () => Promise<void>, billing?: BillingPort): void {
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = billing?.subscribeReconciliation?.(() => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 1500);
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (timer !== undefined) clearTimeout(timer);
      timer = state === 'active' ? setTimeout(() => void refresh(), 1500) : undefined;
    });
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      unsubscribe?.();
      subscription.remove();
    };
  }, [refresh, billing]);
}
