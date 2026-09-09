import type { BillingProbe } from './entitlement';

export type { BillingProbe };

export interface BillingPurchase {
  readonly productId: string;
  readonly purchaseToken: string;
  readonly isPending: boolean;
}

export type BillingErrorCode =
  | 'user-cancelled'
  | 'already-owned'
  | 'deferred'
  | 'retryable'
  | 'unavailable'
  | 'product-invalid';

export class BillingError extends Error {
  readonly code: BillingErrorCode;
  readonly detail: string;

  constructor(code: BillingErrorCode, detail: string) {
    super(`billing failed: ${code}`);
    this.name = 'BillingError';
    this.code = code;
    this.detail = detail;
  }
}

export function isBillingError(value: unknown): value is BillingError {
  return value instanceof BillingError;
}

export interface BillingPort {
  connect(): Promise<void>;
  ownedTokens(): Promise<BillingProbe>;
  buy(productId: string): Promise<BillingPurchase>;
  finish(purchase: BillingPurchase): Promise<void>;
}

export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}
