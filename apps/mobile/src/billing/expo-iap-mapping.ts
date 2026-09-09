import { REMOVE_ADS_PRODUCT_ID } from './product';
import type { BillingErrorCode, BillingProbe, BillingPurchase } from './billing-port';

export interface VendorPurchase {
  readonly productId?: string | null;
  readonly ids?: readonly string[] | null;
  readonly purchaseToken?: string | null;
  readonly purchaseState?: string | null;
}

const CODE_GROUPS: readonly (readonly [BillingErrorCode, readonly string[]])[] = [
  ['user-cancelled', ['user-cancelled', 'user-cancel', 'cancelled']],
  ['already-owned', ['already-owned', 'item-already-owned', 'duplicate-purchase']],
  ['deferred', ['deferred-payment', 'pending', 'purchase-deferred']],
  [
    'unavailable',
    [
      'billing-unavailable',
      'iap-not-available',
      'feature-not-supported',
      'activity-unavailable',
      'not-supported',
      'service-unavailable',
    ],
  ],
  [
    'product-invalid',
    [
      'sku-not-found',
      'skunotfound',
      'item-unavailable',
      'item-not-available',
      'empty-sku-list',
      'query-product',
      'developer-error',
      'sku-offer-mismatch',
    ],
  ],
  [
    'retryable',
    [
      'network-error',
      'service-error',
      'service-disconnected',
      'service-timeout',
      'interrupted',
      'remote-error',
      'connection-closed',
      'init-connection',
      'not-prepared',
      'sync-error',
    ],
  ],
];

function normalizeCode(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
    .replace(/^e-/, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function mapVendorErrorCode(code: string | null | undefined): BillingErrorCode {
  if (typeof code !== 'string' || code.trim() === '') return 'retryable';

  const normalized = normalizeCode(code);
  for (const [ours, vendorCodes] of CODE_GROUPS) {
    if (vendorCodes.includes(normalized)) return ours;
  }
  return 'retryable';
}

function readProductId(purchase: VendorPurchase): string {
  const direct = purchase.productId ?? '';
  if (direct !== '') return direct;
  return purchase.ids?.[0] ?? '';
}

export function toBillingPurchase(purchase: VendorPurchase): BillingPurchase | null {
  const purchaseToken = purchase.purchaseToken ?? '';
  if (purchaseToken === '') return null;

  return {
    productId: readProductId(purchase),
    purchaseToken,
    isPending: purchase.purchaseState === 'pending',
  };
}

export function toOwnedProbe(purchases: readonly VendorPurchase[]): BillingProbe {
  const tokens: string[] = [];

  for (const purchase of purchases) {
    if (readProductId(purchase) !== REMOVE_ADS_PRODUCT_ID) continue;

    const state = purchase.purchaseState;
    if (state != null && state !== 'purchased') continue;

    const token = purchase.purchaseToken ?? '';
    if (token === '' || tokens.includes(token)) continue;

    tokens.push(token);
  }

  return { status: 'ok', tokens };
}
