import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { devicesApi } from '@/api/devices-api';
import {
  defaultSecureStoreOptions,
  expoSecureKeyValueStore,
} from '@/auth/session-store';
import {
  createRegisteredAndroidPushTokenStore,
  isValidAndroidPushToken,
} from '@/notifications/registered-push-token-store';

export const EVENT_UPDATES_CHANNEL_ID = 'event-updates';

const registeredTokenStore = createRegisteredAndroidPushTokenStore({
  storage: {
    getItemAsync: (key) => expoSecureKeyValueStore.getItemAsync(key, defaultSecureStoreOptions),
    setItemAsync: (key, value) =>
      expoSecureKeyValueStore.setItemAsync(key, value, defaultSecureStoreOptions),
    deleteItemAsync: (key) =>
      expoSecureKeyValueStore.deleteItemAsync(key, defaultSecureStoreOptions),
  },
});

let currentRegistration: { token: string; sessionId: string } | null = null;
let registrationPromise: Promise<void> | null = null;

export async function registerAndroidDeviceToken(token: string, sessionId: string) {
  if (!isValidAndroidPushToken(token) || !sessionId) {
    return;
  }
  if (currentRegistration?.token === token && currentRegistration.sessionId === sessionId) return;
  if (registrationPromise) {
    await registrationPromise;
    if (currentRegistration?.token === token && currentRegistration.sessionId === sessionId) return;
  }

  registrationPromise = (async () => {
    await devicesApi.registerAndroid(token, Constants.expoConfig?.version);
    try {
      await registeredTokenStore.write(token);
    } catch (error) {
      await devicesApi.unregister(token).catch(() => undefined);
      throw error;
    }
    currentRegistration = { token, sessionId };
  })().finally(() => {
    registrationPromise = null;
  });
  await registrationPromise;
}

export async function initializeAndroidPush(sessionId: string) {
  if (Platform.OS !== 'android' || !Device.isDevice) {
    return;
  }

  await Notifications.setNotificationChannelAsync(EVENT_UPDATES_CHANNEL_ID, {
    name: '모임 소식',
    description: '신청 승인, 일정 변경과 모임 준비 소식을 알려드립니다.',
    importance: Notifications.AndroidImportance.HIGH,
    enableVibrate: true,
    vibrationPattern: [0, 250, 180, 250],
    showBadge: true,
  });

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted' && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (permission.status !== 'granted') {
    return;
  }

  const token = await Notifications.getDevicePushTokenAsync();
  if (token.type === 'android' && typeof token.data === 'string') {
    await registerAndroidDeviceToken(token.data, sessionId);
  }
}

export async function unregisterCurrentAndroidDevice() {
  await registrationPromise?.catch(() => undefined);
  const tokens = new Set<string>();
  if (currentRegistration?.token) tokens.add(currentRegistration.token);
  const storedToken = await registeredTokenStore.read().catch(() => null);
  if (storedToken) tokens.add(storedToken);

  currentRegistration = null;
  await registeredTokenStore.clear().catch(() => undefined);

  let firstError: unknown;
  for (const token of tokens) {
    try {
      await devicesApi.unregister(token);
    } catch (error) {
      firstError ??= error;
    }
  }
  if (firstError) throw firstError;
}
