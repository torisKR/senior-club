import type { Href } from 'expo-router';

import { createNativeIdempotencyKey } from '@/api/idempotency-key';
import {
  pendingAuthIntentStore,
  type PendingAuthIntent,
  type PendingAuthIntentStore,
} from '@/auth/pending-intent-store';
import {
  buildLoginHref,
  buildOnboardingHref,
  buildPostAuthHref,
  sanitizeAuthIntent,
  sanitizeReturnTo,
  type AuthIntent,
} from '@/utils/auth-routing';

const AUTH_NAVIGATION_TTL_MS = 30 * 60 * 1000;

export interface PendingAuthNavigation {
  state: string;
  returnTo: string;
  intent: AuthIntent;
}

export interface PendingAuthNavigationDependencies {
  store?: PendingAuthIntentStore;
  createState?: () => string;
}

export type PendingAuthStage = 'anonymous' | 'onboarding' | 'complete';

function asNavigation(intent: PendingAuthIntent | null): PendingAuthNavigation | null {
  if (!intent || intent.action !== 'apply') {
    return null;
  }

  return {
    state: intent.state,
    returnTo: intent.returnTo,
    intent: intent.action,
  };
}

/** Persist a validated return route before auth so it survives an Android process restart. */
export async function persistPendingAuthNavigation(
  input: { returnTo: string; intent: AuthIntent },
  dependencies: PendingAuthNavigationDependencies = {},
) {
  const store = dependencies.store ?? pendingAuthIntentStore;
  const intent = sanitizeAuthIntent(input.intent);
  if (!intent) {
    throw new TypeError('지원하지 않는 인증 후 동작입니다.');
  }

  const returnTo = sanitizeReturnTo(input.returnTo);
  const current = await store.peek();
  if (current?.action === intent && current.returnTo === returnTo) {
    return asNavigation(current)!;
  }

  const saved = await store.save({
    provider: 'phone',
    state: (dependencies.createState ?? createNativeIdempotencyKey)(),
    returnTo,
    action: intent,
    ttlMs: AUTH_NAVIGATION_TTL_MS,
  });
  return asNavigation(saved)!;
}

export async function readPendingAuthNavigation(
  dependencies: Pick<PendingAuthNavigationDependencies, 'store'> = {},
) {
  return asNavigation(await (dependencies.store ?? pendingAuthIntentStore).peek());
}

export async function consumePendingAuthNavigation(
  expectedState: string,
  dependencies: Pick<PendingAuthNavigationDependencies, 'store'> = {},
) {
  return asNavigation(
    await (dependencies.store ?? pendingAuthIntentStore).consume(expectedState),
  );
}

export function buildPendingAuthHref(
  pending: PendingAuthNavigation,
  stage: PendingAuthStage,
): Href {
  if (stage === 'anonymous') {
    return buildLoginHref(pending.returnTo, pending.intent);
  }
  if (stage === 'onboarding') {
    return buildOnboardingHref(pending.returnTo, pending.intent);
  }
  return buildPostAuthHref(pending.returnTo, pending.intent);
}

export function isPendingAuthDestination(pathname: string, pending: PendingAuthNavigation) {
  const parsed = new URL(pending.returnTo, 'https://senior-club.invalid');
  return pathname === parsed.pathname;
}
