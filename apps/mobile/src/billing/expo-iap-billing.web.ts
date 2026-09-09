import { BillingError, type BillingPort, type BillingProbe, type BillingPurchase } from './billing-port';

export function createExpoIapBilling(): BillingPort {
  const unavailable = (action: string): BillingError =>
    new BillingError('unavailable', `web has no store: ${action}`);

  return {
    async connect(): Promise<void> {},

    async ownedTokens(): Promise<BillingProbe> {
      return { status: 'unavailable' };
    },

    async buy(): Promise<BillingPurchase> {
      throw unavailable('buy');
    },

    async finish(): Promise<void> {
      throw unavailable('finish');
    },
  };
}

export async function disconnectExpoIapBilling(): Promise<void> {}
