import { withRevenueCat } from './revenuecat';

/** The existing Play billing code acknowledges purchases; RevenueCat observes them. */
export async function initializeRevenueCatObserver(): Promise<void> {
  await withRevenueCat(async () => undefined);
}

/** Only invoked after a purchase or a user-initiated restore, never on every launch. */
export async function syncRevenueCatPurchase(): Promise<void> {
  await withRevenueCat(async (sdk) => {
    if (sdk) await sdk.syncPurchases();
  });
}
