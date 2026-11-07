// Billing still uses these SecureStore primitives through this module. Keep the
// device-only options and purchase keys unchanged during the community removal.
import * as SecureStore from 'expo-secure-store';
import type { SecureStoreOptions } from 'expo-secure-store';

export const defaultSecureStoreOptions: SecureStoreOptions = Object.freeze({
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
});

export interface SecureKeyValueStore {
  getItemAsync(key: string, options?: SecureStoreOptions): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: SecureStoreOptions): Promise<void>;
  deleteItemAsync(key: string, options?: SecureStoreOptions): Promise<void>;
}

export const expoSecureKeyValueStore: SecureKeyValueStore = {
  getItemAsync: SecureStore.getItemAsync,
  setItemAsync: SecureStore.setItemAsync,
  deleteItemAsync: SecureStore.deleteItemAsync,
};
