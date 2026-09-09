import {
  endConnection,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Purchase,
} from 'expo-iap';

import { BillingError, type BillingPort, type BillingProbe, type BillingPurchase } from './billing-port';
import { mapVendorErrorCode, toBillingPurchase, toOwnedProbe } from './expo-iap-mapping';

const PURCHASE_TIMEOUT_MS = 120_000;

type VendorPurchaseError = Parameters<Parameters<typeof purchaseErrorListener>[0]>[0];

export function createExpoIapBilling(): BillingPort {
  const rawByToken = new Map<string, Purchase>();
  let connecting: Promise<void> | null = null;

  const remember = (purchases: readonly Purchase[]): void => {
    for (const purchase of purchases) {
      const token = purchase.purchaseToken ?? '';
      if (token !== '') rawByToken.set(token, purchase);
    }
  };

  const connect = async (): Promise<void> => {
    connecting ??= initConnection()
      .then(() => undefined)
      .catch((error: unknown) => {
        connecting = null;
        throw error;
      });
    return connecting;
  };

  const findRaw = async (purchaseToken: string): Promise<Purchase | null> => {
    const cached = rawByToken.get(purchaseToken);
    if (cached !== undefined) return cached;

    const purchases = await getAvailablePurchases();
    remember(purchases);
    return rawByToken.get(purchaseToken) ?? null;
  };

  return {
    connect,

    async ownedTokens(): Promise<BillingProbe> {
      try {
        await connect();
        const purchases = await getAvailablePurchases();
        remember(purchases);
        return toOwnedProbe(purchases);
      } catch {
        return { status: 'unavailable' };
      }
    },

    async buy(productId: string): Promise<BillingPurchase> {
      await connect();

      return new Promise<BillingPurchase>((resolve, reject) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const cleanup = (): void => {
          settled = true;
          if (timer !== null) clearTimeout(timer);
          updated.remove();
          failed.remove();
        };

        const succeed = (purchase: Purchase): void => {
          if (settled) return;

          const mapped = toBillingPurchase(purchase);
          if (mapped === null || mapped.productId !== productId) return;

          remember([purchase]);
          cleanup();
          resolve(mapped);
        };

        const fail = (error: VendorPurchaseError): void => {
          if (settled) return;
          cleanup();
          reject(
            new BillingError(
              mapVendorErrorCode(error.code),
              `${productId}: ${error.code ?? 'no-code'} ${error.message ?? ''}`.trim(),
            ),
          );
        };

        const updated = purchaseUpdatedListener(succeed);
        const failed = purchaseErrorListener(fail);

        timer = setTimeout(() => {
          if (settled) return;
          cleanup();
          reject(
            new BillingError(
              'retryable',
              `${productId}: no purchase event within ${PURCHASE_TIMEOUT_MS}ms`,
            ),
          );
        }, PURCHASE_TIMEOUT_MS);

        requestPurchase({
          type: 'in-app',
          request: { google: { skus: [productId] }, apple: { sku: productId } },
        }).catch((error: unknown) => {
          if (settled) return;
          cleanup();
          const code = (error as { code?: string } | null)?.code;
          reject(new BillingError(mapVendorErrorCode(code), `${productId}: ${String(error)}`));
        });
      });
    },

    async finish(purchase: BillingPurchase): Promise<void> {
      if (purchase.isPending) {
        throw new BillingError('deferred', `${purchase.productId}: pending purchase cannot finish`);
      }

      await connect();
      const raw = await findRaw(purchase.purchaseToken);
      if (raw === null) {
        throw new BillingError(
          'retryable',
          `${purchase.productId}: purchase not found in store, cannot acknowledge`,
        );
      }

      try {
        await finishTransaction({ purchase: raw, isConsumable: false });
      } catch (error: unknown) {
        const code = (error as { code?: string } | null)?.code;
        throw new BillingError(
          mapVendorErrorCode(code),
          `${purchase.productId}: finish failed ${String(error)}`,
        );
      }
    },
  };
}

export async function disconnectExpoIapBilling(): Promise<void> {
  try {
    await endConnection();
  } catch {
    // Shutdown path. There is nothing useful to do if disconnect fails.
  }
}
