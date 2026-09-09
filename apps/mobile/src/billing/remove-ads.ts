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
  await billing.finish(purchase).catch(() => undefined);
}

function purchaseFromToken(token: string): BillingPurchase {
  return { productId: REMOVE_ADS_PRODUCT_ID, purchaseToken: token, isPending: false };
}

function settledToken(decision: EntitlementDecision, storedToken: string | null): string {
  return decision.write === 'none' || decision.write === 'clear'
    ? (storedToken ?? '')
    : decision.write.token;
}

export async function syncEntitlement(deps: RemoveAdsDeps): Promise<boolean> {
  const storedToken = await deps.tokens.get().catch(() => null);

  try {
    await deps.billing.connect();
    const probe = await deps.billing.ownedTokens();
    const decision = decideEntitlement(storedToken, probe);
    await applyDecision(deps, decision);

    if (decision.owned) {
      await finishQuietly(deps.billing, purchaseFromToken(settledToken(decision, storedToken)));
    }

    return decision.owned;
  } catch {
    return storedToken !== null && storedToken !== '';
  }
}

async function reconcileFromStore(deps: RemoveAdsDeps): Promise<RestoreOutcome> {
  const storedToken = await deps.tokens.get();
  const probe = await deps.billing.ownedTokens();

  if (probe.status === 'unavailable') {
    return RETRYABLE_FAILURE;
  }

  const decision = decideEntitlement(storedToken, probe);
  await applyDecision(deps, decision);

  if (!decision.owned) {
    return { status: 'none' };
  }

  await finishQuietly(deps.billing, purchaseFromToken(settledToken(decision, storedToken)));
  return { status: 'owned' };
}

export async function purchaseRemoveAds(deps: RemoveAdsDeps): Promise<PurchaseOutcome> {
  try {
    const purchase = await deps.billing.buy(REMOVE_ADS_PRODUCT_ID);

    if (purchase.isPending) {
      return { status: 'pending' };
    }

    await deps.tokens.set(purchase.purchaseToken);
    await finishQuietly(deps.billing, purchase);
    return { status: 'owned' };
  } catch (error: unknown) {
    return classifyPurchaseFailure(deps, error);
  }
}

async function classifyPurchaseFailure(
  deps: RemoveAdsDeps,
  error: unknown,
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
    const restored = await reconcileFromStore(deps).catch((): RestoreOutcome => RETRYABLE_FAILURE);
    if (restored.status === 'owned') {
      return { status: 'owned' };
    }
    return { status: 'failed', code: 'already-owned', retryable: true };
  }

  return { status: 'failed', code: error.code, retryable: error.code === 'retryable' };
}

export async function restoreRemoveAds(deps: RemoveAdsDeps): Promise<RestoreOutcome> {
  try {
    return await reconcileFromStore(deps);
  } catch (error: unknown) {
    const code = isBillingError(error) ? error.code : 'unknown';
    return { status: 'failed', code, retryable: code === 'retryable' };
  }
}
