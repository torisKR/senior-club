import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import { useEffect } from 'react';

import {
  buildPendingAuthHref,
  consumePendingAuthNavigation,
  isPendingAuthDestination,
  persistPendingAuthNavigation,
  readPendingAuthNavigation,
} from '@/auth/pending-auth-navigation';
import { useAppState } from '@/hooks/use-app-state';
import { sanitizeAuthIntent, sanitizeReturnTo } from '@/utils/auth-routing';

const AUTH_JOURNEY_PATHS = new Set(['/', '/login', '/onboarding']);

/**
 * Persists incoming auth route parameters and completes a restored journey once the
 * authenticated user reaches its destination. The entry route performs cold-start recovery.
 */
export function PendingAuthIntentCoordinator() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{
    intent?: string | string[];
    returnTo?: string | string[];
  }>();
  const { isHydrated, onboardingCompleted, session } = useAppState();
  const intent = sanitizeAuthIntent(params.intent);
  const returnTo = sanitizeReturnTo(params.returnTo);

  useEffect(() => {
    if (
      !isHydrated ||
      !intent ||
      (pathname !== '/login' && pathname !== '/onboarding')
    ) {
      return;
    }

    void persistPendingAuthNavigation({ returnTo, intent }).catch(() => {
      // Auth remains usable if SecureStore is unavailable; route query parameters still work.
    });
  }, [intent, isHydrated, pathname, returnTo]);

  useEffect(() => {
    if (!isHydrated || !session || !onboardingCompleted) {
      return;
    }

    let active = true;
    void readPendingAuthNavigation()
      .then(async (pending) => {
        if (!active || !pending) return;

        if (isPendingAuthDestination(pathname, pending)) {
          await consumePendingAuthNavigation(pending.state);
          return;
        }

        if (AUTH_JOURNEY_PATHS.has(pathname)) {
          router.replace(buildPendingAuthHref(pending, 'complete'));
        }
      })
      .catch(() => {
        // A SecureStore read failure must not block the current authenticated route.
      });

    return () => {
      active = false;
    };
  }, [isHydrated, onboardingCompleted, pathname, session]);

  return null;
}
