import * as Notifications from 'expo-notifications';
import { type Href, router } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { useAppState } from '@/hooks/use-app-state';
import { notificationRouteFromData } from '@/notifications/notification-route';
import {
  initializeAndroidPush,
  registerAndroidDeviceToken,
} from '@/notifications/push-registration';
import { pushRegistrationRetryDelay } from '@/notifications/push-registration-retry';

if (Platform.OS === 'android') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function routeNotificationResponse(
  response: Notifications.NotificationResponse,
  handledResponses: Set<string>,
) {
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
    return;
  }

  const responseKey = `${response.notification.request.identifier}:${response.actionIdentifier}`;
  if (handledResponses.has(responseKey)) {
    return;
  }

  const destination = notificationRouteFromData(
    response.notification.request.content.data,
  );
  if (!destination.ok) {
    return;
  }

  handledResponses.add(responseKey);
  router.push(destination.route as Href);
}

export function PushNotificationCoordinator() {
  const { session } = useAppState();
  const sessionId = session?.sessionId;

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    const handledResponses = new Set<string>();
    try {
      const coldStartResponse = Notifications.getLastNotificationResponse();
      if (coldStartResponse) {
        routeNotificationResponse(coldStartResponse, handledResponses);
        Notifications.clearLastNotificationResponse();
      }
    } catch {
      // Push support is optional on unsupported runtimes such as Android Expo Go.
    }

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => routeNotificationResponse(response, handledResponses),
    );
    return () => responseSubscription.remove();
  }, []);

  useEffect(() => {
    if (!sessionId || Platform.OS !== 'android') {
      return;
    }

    let active = true;
    let registrationComplete = false;
    let registrationInFlight = false;
    let failedAttempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const clearRetryTimer = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const attemptRegistration = async () => {
      if (!active || registrationComplete || registrationInFlight) return;

      registrationInFlight = true;
      try {
        await initializeAndroidPush(sessionId);
        clearRetryTimer();
        registrationComplete = true;
        failedAttempts = 0;
      } catch {
        if (!active) return;
        failedAttempts += 1;
        const delay = pushRegistrationRetryDelay(failedAttempts);
        if (delay !== null) {
          clearRetryTimer();
          retryTimer = setTimeout(() => {
            retryTimer = null;
            void attemptRegistration();
          }, delay);
        }
      } finally {
        registrationInFlight = false;
      }
    };

    void attemptRegistration();

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (
        nextState !== 'active' ||
        !active ||
        registrationComplete ||
        registrationInFlight ||
        retryTimer
      ) {
        return;
      }

      failedAttempts = 0;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void attemptRegistration();
      }, 1_000);
    });

    const tokenSubscription = Notifications.addPushTokenListener((token) => {
      if (active && token.type === 'android' && typeof token.data === 'string') {
        void registerAndroidDeviceToken(token.data, sessionId).catch(() => {
          registrationComplete = false;
          failedAttempts = 0;
          if (!retryTimer) {
            retryTimer = setTimeout(() => {
              retryTimer = null;
              void attemptRegistration();
            }, 2_000);
          }
        });
      }
    });

    return () => {
      active = false;
      clearRetryTimer();
      appStateSubscription.remove();
      tokenSubscription.remove();
    };
  }, [sessionId]);

  return null;
}
