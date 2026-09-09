import {
  defaultSecureStoreOptions,
  expoSecureKeyValueStore,
  type SecureKeyValueStore,
} from '@/auth/session-store';

import type { TokenStore } from './billing-port';
import { REMOVE_ADS_TOKEN_KEY } from './product';

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
