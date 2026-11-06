import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Purchases, { PURCHASES_ARE_COMPLETED_BY_TYPE, STOREKIT_VERSION } from 'react-native-purchases';

export const REVENUECAT_ANDROID_KEY = 'goog_nCiAtuVHUJhsiEPugAkfdaZyayY';

export type RevenueCatError = {
  code: 'unavailable' | 'retryable' | 'unknown';
  message: string;
};

let configured = false;
let configurePromise: Promise<void> | null = null;

export async function withRevenueCat<T>(
  action: (sdk: typeof Purchases | null) => Promise<T>
): Promise<T> {
  if (Platform.OS !== 'android') {
    return action(null);
  }

  if ((Constants.executionEnvironment as string) === 'storeClient') {
    const error: RevenueCatError = {
      code: 'unavailable',
      message: 'In-app purchases are not supported in Expo Go. Please use a development build.',
    };
    throw error;
  }

  if (!configured) {
    if (!configurePromise) {
      configurePromise = (async () => {
        Purchases.configure({
          apiKey: REVENUECAT_ANDROID_KEY,
          purchasesAreCompletedBy: {
            type: PURCHASES_ARE_COMPLETED_BY_TYPE.MY_APP,
            storeKitVersion: STOREKIT_VERSION.STOREKIT_2,
          },
        });
        configured = true;
      })().finally(() => {
        configurePromise = null;
      });
    }
    await configurePromise;
  }
  // With no app account, let RevenueCat use its device-cached identity. Google
  // Play remains the source of truth for the app's non-consumable purchases.
  return action(Purchases);
}
