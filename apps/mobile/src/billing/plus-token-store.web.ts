import type { TokenStore } from './billing-port';
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
