import {
  defaultSecureStoreOptions,
  expoSecureKeyValueStore,
  type SecureKeyValueStore,
} from '@/auth/session-store';

import type { TokenStore } from './billing-port';
import { REMOVE_ADS_TOKEN_KEY } from './product';
import type { CosmeticProductId } from './cosmetic-products';

export function createPlusTokenStore(
  storage: SecureKeyValueStore = expoSecureKeyValueStore,
): TokenStore {
  return {
    async get() {
      return storage.getItemAsync(REMOVE_ADS_TOKEN_KEY, defaultSecureStoreOptions);
    },
    async set(token: string) {
      await storage.setItemAsync(REMOVE_ADS_TOKEN_KEY, token, defaultSecureStoreOptions);
    },
    async clear() {
      await storage.deleteItemAsync(REMOVE_ADS_TOKEN_KEY, defaultSecureStoreOptions);
    },
  };
}

export function createCosmeticTokenStore(
  productId: CosmeticProductId,
  storage: SecureKeyValueStore = expoSecureKeyValueStore,
): TokenStore {
  const key = `senior-club.cosmetic.v1.${productId}`;
  return {
    async get() { return storage.getItemAsync(key, defaultSecureStoreOptions); },
    async set(token) { await storage.setItemAsync(key, token, defaultSecureStoreOptions); },
    async clear() { await storage.deleteItemAsync(key, defaultSecureStoreOptions); },
  };
}
