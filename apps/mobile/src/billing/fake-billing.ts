import { REMOVE_ADS_PRODUCT_ID } from './product';
import { isCosmeticProductId } from './cosmetic-products';
import {
  BillingError,
  type BillingErrorCode,
  type BillingPort,
  type BillingProbe,
  type BillingPurchase,
} from './billing-port';

export interface FakeBilling {
  readonly billing: BillingPort;
  seedOwned(...tokens: readonly string[]): void;
  seedOwnedProduct(productId: string, ...tokens: readonly string[]): void;
  setProbeUnavailable(unavailable: boolean): void;
  failNextBuy(code: BillingErrorCode, detail?: string): void;
  failNextFinish(code: BillingErrorCode, detail?: string): void;
  finishedTokens(): readonly string[];
}

function fakeToken(sequence: number): string {
  return `apjeidfnak.AO-J1Oy_FAKE${sequence}`;
}

export function createFakeBilling(): FakeBilling {
  const owned = new Map<string, Set<string>>();
  const finished: string[] = [];
  let sequence = 0;
  let probeUnavailable = false;
  let nextBuyError: BillingError | null = null;
  let nextFinishError: BillingError | null = null;

  const billing: BillingPort = {
    async connect() {},

    async productPrice(productId: string) {
      if (productId === REMOVE_ADS_PRODUCT_ID) return '₩4,900';
      return isCosmeticProductId(productId) ? '₩1,900' : null;
    },

    async ownedTokens(productId = REMOVE_ADS_PRODUCT_ID): Promise<BillingProbe> {
      if (probeUnavailable) return { status: 'unavailable' };
      return { status: 'ok', tokens: [...(owned.get(productId) ?? [])] };
    },

    async buy(productId: string): Promise<BillingPurchase> {
      if (productId !== REMOVE_ADS_PRODUCT_ID && !isCosmeticProductId(productId)) {
        throw new BillingError('product-invalid', productId);
      }
      if (nextBuyError) {
        const error = nextBuyError;
        nextBuyError = null;
        throw error;
      }
      if ((owned.get(productId)?.size ?? 0) > 0) {
        throw new BillingError('already-owned', productId);
      }
      sequence += 1;
      const purchaseToken = fakeToken(sequence);
      owned.set(productId, new Set([purchaseToken]));
      return { productId, purchaseToken, isPending: false };
    },

    async finish(purchase: BillingPurchase): Promise<void> {
      if (purchase.isPending) {
        throw new BillingError('deferred', purchase.productId);
      }
      if (nextFinishError) {
        const error = nextFinishError;
        nextFinishError = null;
        throw error;
      }
      finished.push(purchase.purchaseToken);
    },
  };

  return {
    billing,
    seedOwned(...tokens) {
      owned.set(REMOVE_ADS_PRODUCT_ID, new Set(tokens));
    },
    seedOwnedProduct(productId, ...tokens) {
      owned.set(productId, new Set(tokens));
    },
    setProbeUnavailable(unavailable) {
      probeUnavailable = unavailable;
    },
    failNextBuy(code, detail = code) {
      nextBuyError = new BillingError(code, detail);
    },
    failNextFinish(code, detail = code) {
      nextFinishError = new BillingError(code, detail);
    },
    finishedTokens() {
      return finished;
    },
  };
}
