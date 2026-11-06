import type { TokenStore } from './billing-port';
import type { CosmeticProductId } from './cosmetic-products';
import { REMOVE_ADS_TOKEN_KEY } from './product';

export function createPlusTokenStore(): TokenStore {
  return {
    async get() {
      return globalThis.localStorage.getItem(REMOVE_ADS_TOKEN_KEY);
    },
    async set(token: string) {
      globalThis.localStorage.setItem(REMOVE_ADS_TOKEN_KEY, token);
    },
    async clear() {
      globalThis.localStorage.removeItem(REMOVE_ADS_TOKEN_KEY);
    },
  };
}

export function createCosmeticTokenStore(productId: CosmeticProductId): TokenStore {
  const key = `senior-club.cosmetic.v1.${productId}`;
  return {
    async get() { return globalThis.localStorage.getItem(key); },
    async set(token) { globalThis.localStorage.setItem(key, token); },
    async clear() { globalThis.localStorage.removeItem(key); },
  };
}
