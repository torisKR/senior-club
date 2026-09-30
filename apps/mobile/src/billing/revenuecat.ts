import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Purchases, { PURCHASES_ARE_COMPLETED_BY_TYPE, STOREKIT_VERSION } from 'react-native-purchases';

import { authSessionManager } from '@/auth/auth-session-manager';

export const REVENUECAT_ANDROID_KEY = 'goog_nCiAtuVHUJhsiEPugAkfdaZyayY';

export type RevenueCatError = {
  code: 'unavailable' | 'retryable' | 'unknown';
  message: string;
};

let configured = false;
let configuredUserId: string | null = null;
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

  const snapshot = authSessionManager.getSnapshot();
  if (snapshot.status === 'restoring' || (snapshot.status === 'anonymous' && snapshot.restoreError != null)) {
    const error: RevenueCatError = {
      code: 'retryable',
      message: 'Auth session is restoring or failed to restore.',
    };
    throw error;
  }

  const currentUserId = snapshot.session?.userId ?? null;

  if (!configured) {
    if (!configurePromise) {
      configurePromise = (async () => {
        Purchases.configure({
          apiKey: REVENUECAT_ANDROID_KEY,
          appUserID: currentUserId ?? undefined,
          purchasesAreCompletedBy: {
            type: PURCHASES_ARE_COMPLETED_BY_TYPE.MY_APP,
            storeKitVersion: STOREKIT_VERSION.STOREKIT_2,
          },
        });
        configured = true;
        configuredUserId = currentUserId;
      })().finally(() => {
        configurePromise = null;
      });
    }
    await configurePromise;
  } else if (currentUserId !== configuredUserId && currentUserId != null) {
    await Purchases.logIn(currentUserId);
    configuredUserId = currentUserId;
  }

  const identityBefore = authSessionManager.getSnapshot().session?.userId ?? null;
  const result = await action(Purchases);
  const identityAfter = authSessionManager.getSnapshot().session?.userId ?? null;

  if (identityBefore !== identityAfter) {
    const error: RevenueCatError = {
      code: 'retryable',
      message: 'Auth identity changed during purchase operation.',
    };
    throw error;
  }

  return result;
}
