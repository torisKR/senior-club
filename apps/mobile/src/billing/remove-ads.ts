import { decideEntitlement, type EntitlementDecision } from './entitlement';
import {
  isBillingError,
  type BillingPort,
  type BillingPurchase,
  type TokenStore,
} from './billing-port';
import { REMOVE_ADS_PRODUCT_ID } from './product';

export interface RemoveAdsDeps {
  readonly billing: BillingPort;
  readonly tokens: TokenStore;
}

export type PurchaseOutcome =
  | { readonly status: 'owned' }
  | { readonly status: 'cancelled' }
  | { readonly status: 'pending' }
  | { readonly status: 'failed'; readonly code: string; readonly retryable: boolean };

export type RestoreOutcome =
  | { readonly status: 'owned' }
  | { readonly status: 'none' }
  | { readonly status: 'failed'; readonly code: string; readonly retryable: boolean };

const RETRYABLE_FAILURE = { status: 'failed', code: 'retryable', retryable: true } as const;

async function applyDecision(deps: RemoveAdsDeps, decision: EntitlementDecision): Promise<void> {
  if (decision.write === 'none') return;
  if (decision.write === 'clear') {
    await deps.tokens.clear();
    return;
  }
  await deps.tokens.set(decision.write.token);
}

async function finishQuietly(billing: BillingPort, purchase: BillingPurchase): Promise<void> {
  // Keep the purchase usable if the store is temporarily unavailable, but retry
  // acknowledgement now and again on the next entitlement reconciliation.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await billing.finish(purchase);
      return;
    } catch {
      // A later reconciliation will retry if all attempts fail.
    }
  }
}

function purchaseFromToken(token: string, productId: string): BillingPurchase {
  return { productId, purchaseToken: token, isPending: false };
}

function settledToken(decision: EntitlementDecision, storedToken: string | null): string {
  return decision.write === 'none' || decision.write === 'clear'
    ? (storedToken ?? '')
    : decision.write.token;
}

export async function syncEntitlement(deps: RemoveAdsDeps, productId = REMOVE_ADS_PRODUCT_ID): Promise<boolean> {
  const storedToken = await deps.tokens.get().catch(() => null);

  try {
    await deps.billing.connect();
    const probe = await deps.billing.ownedTokens(productId);
    const decision = decideEntitlement(storedToken, probe);
    // Play is authoritative even if this device cannot persist its offline cache.
    // In particular, a cache failure must not prevent acknowledgement.
    await applyDecision(deps, decision).catch(() => undefined);

    if (decision.owned) {
      await finishQuietly(deps.billing, purchaseFromToken(settledToken(decision, storedToken), productId));
    }

    return decision.owned;
  } catch {
    return storedToken !== null && storedToken !== '';
  }
}

async function reconcileFromStore(deps: RemoveAdsDeps, productId: string): Promise<RestoreOutcome> {
  const storedToken = await deps.tokens.get().catch(() => null);
  const probe = await deps.billing.ownedTokens(productId);

  if (probe.status === 'unavailable') {
    return RETRYABLE_FAILURE;
  }

  const decision = decideEntitlement(storedToken, probe);
  await applyDecision(deps, decision).catch(() => undefined);

  if (!decision.owned) {
    return { status: 'none' };
  }

  await finishQuietly(deps.billing, purchaseFromToken(settledToken(decision, storedToken), productId));
  return { status: 'owned' };
}

export async function purchaseNonConsumable(deps: RemoveAdsDeps, productId: string): Promise<PurchaseOutcome> {
  try {
    const purchase = await deps.billing.buy(productId);

    if (purchase.productId !== productId || !purchase.purchaseToken.trim()) {
      return { status: 'failed', code: 'product-invalid', retryable: false };
    }

    if (purchase.isPending) {
      return { status: 'pending' };
    }

    await deps.tokens.set(purchase.purchaseToken).catch(() => undefined);
    await finishQuietly(deps.billing, purchase);
    return { status: 'owned' };
  } catch (error: unknown) {
    return classifyPurchaseFailure(deps, error, productId);
  }
}

async function classifyPurchaseFailure(
  deps: RemoveAdsDeps,
  error: unknown,
  productId: string,
): Promise<PurchaseOutcome> {
  if (!isBillingError(error)) {
    return { status: 'failed', code: 'unknown', retryable: false };
  }

  if (error.code === 'user-cancelled') {
    return { status: 'cancelled' };
  }

  if (error.code === 'deferred') {
    return { status: 'pending' };
  }

  if (error.code === 'already-owned') {
    const restored = await reconcileFromStore(deps, productId).catch((): RestoreOutcome => RETRYABLE_FAILURE);
    if (restored.status === 'owned') {
      return { status: 'owned' };
    }
    return { status: 'failed', code: 'already-owned', retryable: true };
  }

  return { status: 'failed', code: error.code, retryable: error.code === 'retryable' };
}

export async function restoreNonConsumable(deps: RemoveAdsDeps, productId: string): Promise<RestoreOutcome> {
  try {
    return await reconcileFromStore(deps, productId);
  } catch (error: unknown) {
    const code = isBillingError(error) ? error.code : 'unknown';
    return { status: 'failed', code, retryable: code === 'retryable' };
  }
}

export const purchaseRemoveAds = (deps: RemoveAdsDeps): Promise<PurchaseOutcome> =>
  purchaseNonConsumable(deps, REMOVE_ADS_PRODUCT_ID);

export const restoreRemoveAds = (deps: RemoveAdsDeps): Promise<RestoreOutcome> =>
  restoreNonConsumable(deps, REMOVE_ADS_PRODUCT_ID);
