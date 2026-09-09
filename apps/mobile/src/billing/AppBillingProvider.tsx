import React from 'react';

import { BillingProvider } from './BillingProvider';
import { createExpoIapBilling } from './expo-iap-billing';
import { createPlusTokenStore } from './plus-token-store';

export function AppBillingProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement {
  const billing = React.useMemo(() => createExpoIapBilling(), []);
  const tokens = React.useMemo(() => createPlusTokenStore(), []);

  return (
    <BillingProvider billing={billing} tokens={tokens}>
      {children}
    </BillingProvider>
  );
}
