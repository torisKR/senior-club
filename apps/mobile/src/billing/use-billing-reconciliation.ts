import React from 'react';
import { AppState } from 'react-native';

/** Refresh after returning from Play or after a pending purchase is approved. */
export function useBillingReconciliation(refresh: () => Promise<void>): void {
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (timer !== undefined) clearTimeout(timer);
      timer = state === 'active' ? setTimeout(() => void refresh(), 1500) : undefined;
    });
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      subscription.remove();
    };
  }, [refresh]);
}
