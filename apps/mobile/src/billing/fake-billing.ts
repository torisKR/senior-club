import { REMOVE_ADS_PRODUCT_ID } from './product';
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
  setProbeUnavailable(unavailable: boolean): void;
  failNextBuy(code: BillingErrorCode, detail?: string): void;
  failNextFinish(code: BillingErrorCode, detail?: string): void;
  finishedTokens(): readonly string[];
}

function fakeToken(sequence: number): string {
  return `apjeidfnak.AO-J1Oy_FAKE${sequence}`;
}

export function createFakeBilling(): FakeBilling {
  const owned = new Set<string>();
  const finished: string[] = [];
  let sequence = 0;
  let probeUnavailable = false;
  let nextBuyError: BillingError | null = null;
  let nextFinishError: BillingError | null = null;

  const billing: BillingPort = {
    async connect() {},

    async ownedTokens(): Promise<BillingProbe> {
      if (probeUnavailable) return { status: 'unavailable' };
      return { status: 'ok', tokens: [...owned] };
    },

    async buy(productId: string): Promise<BillingPurchase> {
      if (productId !== REMOVE_ADS_PRODUCT_ID) {
        throw new BillingError('product-invalid', productId);
      }
      if (nextBuyError) {
        const error = nextBuyError;
        nextBuyError = null;
        throw error;
      }
      if (owned.size > 0) {
        throw new BillingError('already-owned', productId);
      }
      sequence += 1;
      const purchaseToken = fakeToken(sequence);
      owned.add(purchaseToken);
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
      tokens.forEach((token) => owned.add(token));
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
