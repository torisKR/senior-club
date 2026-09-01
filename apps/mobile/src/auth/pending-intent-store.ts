import type { SecureStoreOptions } from 'expo-secure-store';

import {
  defaultSecureStoreOptions,
  expoSecureKeyValueStore,
  type SecureKeyValueStore,
} from '@/auth/session-store';
import { parseAppRoute, type SafeAppRoute } from '@/notifications/notification-route';

export const PENDING_AUTH_INTENT_STORAGE_KEY = 'senior-club.pending-auth-intent.v1';

const PENDING_INTENT_VERSION = 1 as const;
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_TTL_MS = 30 * 60 * 1000;
const MAX_SERIALIZED_LENGTH = 8_192;
const PKCE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const OAUTH_STATE = /^[A-Za-z0-9._~-]{16,512}$/;

export type AuthProvider = 'phone' | 'email' | 'kakao' | 'naver' | 'google';
export type PendingAuthAction = 'apply';

export interface PendingAuthIntent {
  version: typeof PENDING_INTENT_VERSION;
  provider: AuthProvider;
  state: string;
  codeVerifier?: string;
  nonce?: string;
  returnTo: SafeAppRoute;
  action?: PendingAuthAction;
  createdAt: number;
  expiresAt: number;
}

export interface PendingAuthIntentInput {
  provider: AuthProvider;
  state: string;
  codeVerifier?: string;
  nonce?: string;
  returnTo: string;
  action?: PendingAuthAction;
  ttlMs?: number;
}

export interface PendingAuthIntentStore {
  save(input: PendingAuthIntentInput): Promise<PendingAuthIntent>;
  peek(): Promise<PendingAuthIntent | null>;
  consume(expectedState: string): Promise<PendingAuthIntent | null>;
  clear(): Promise<void>;
}

export interface CreatePendingAuthIntentStoreOptions {
  storage?: SecureKeyValueStore;
  key?: string;
  secureStoreOptions?: SecureStoreOptions;
  now?: () => number;
}

const PROVIDERS = new Set<AuthProvider>(['phone', 'email', 'kakao', 'naver', 'google']);

function isBoundedString(value: unknown, minLength: number, maxLength: number): value is string {
  return typeof value === 'string' && value.length >= minLength && value.length <= maxLength;
}

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return difference === 0;
}

function parsePendingIntent(serialized: string): PendingAuthIntent | null {
  if (serialized.length > MAX_SERIALIZED_LENGTH) {
    return null;
  }

  try {
    const candidate = JSON.parse(serialized) as Partial<PendingAuthIntent>;
    const parsedRoute = parseAppRoute(candidate.returnTo);

    if (
      candidate.version !== PENDING_INTENT_VERSION ||
      !PROVIDERS.has(candidate.provider as AuthProvider) ||
      !isBoundedString(candidate.state, 16, 512) ||
      !OAUTH_STATE.test(candidate.state) ||
      (candidate.codeVerifier !== undefined && !PKCE_VERIFIER.test(candidate.codeVerifier)) ||
      (candidate.nonce !== undefined && !isBoundedString(candidate.nonce, 8, 512)) ||
      (candidate.action !== undefined && candidate.action !== 'apply') ||
      typeof candidate.createdAt !== 'number' ||
      !Number.isFinite(candidate.createdAt) ||
      typeof candidate.expiresAt !== 'number' ||
      !Number.isFinite(candidate.expiresAt) ||
      candidate.expiresAt <= candidate.createdAt ||
      !parsedRoute.ok
    ) {
      return null;
    }

    return { ...candidate, returnTo: parsedRoute.route } as PendingAuthIntent;
  } catch {
    return null;
  }
}

function validateInput(input: PendingAuthIntentInput, now: number): PendingAuthIntent {
  const route = parseAppRoute(input.returnTo);
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;

  if (!PROVIDERS.has(input.provider)) {
    throw new TypeError('지원하지 않는 인증 제공자입니다.');
  }
  if (!isBoundedString(input.state, 16, 512) || !OAUTH_STATE.test(input.state)) {
    throw new TypeError('OAuth state는 16~512자의 URL-safe 문자열이어야 합니다.');
  }
  if (input.codeVerifier !== undefined && !PKCE_VERIFIER.test(input.codeVerifier)) {
    throw new TypeError('codeVerifier가 RFC 7636 형식에 맞지 않습니다.');
  }
  if (input.nonce !== undefined && !isBoundedString(input.nonce, 8, 512)) {
    throw new TypeError('nonce는 8자 이상 512자 이하여야 합니다.');
  }
  if (input.action !== undefined && input.action !== 'apply') {
    throw new TypeError('지원하지 않는 인증 후 동작입니다.');
  }
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TTL_MS) {
    throw new TypeError('인증 대기 만료 시간은 0초 초과 30분 이하여야 합니다.');
  }
  if (!route.ok) {
    throw new TypeError(`허용되지 않은 앱 복귀 경로입니다: ${route.reason}`);
  }

  return {
    version: PENDING_INTENT_VERSION,
    provider: input.provider,
    state: input.state,
    ...(input.codeVerifier ? { codeVerifier: input.codeVerifier } : {}),
    ...(input.nonce ? { nonce: input.nonce } : {}),
    returnTo: route.route,
    ...(input.action ? { action: input.action } : {}),
    createdAt: now,
    expiresAt: now + ttlMs,
  };
}

export function createPendingAuthIntentStore(
  options: CreatePendingAuthIntentStoreOptions = {},
): PendingAuthIntentStore {
  const storage = options.storage ?? expoSecureKeyValueStore;
  const key = options.key ?? PENDING_AUTH_INTENT_STORAGE_KEY;
  const secureStoreOptions = options.secureStoreOptions ?? defaultSecureStoreOptions;
  const now = options.now ?? Date.now;

  async function clear() {
    await storage.deleteItemAsync(key, secureStoreOptions);
  }

  async function peek() {
    const serialized = await storage.getItemAsync(key, secureStoreOptions);
    if (serialized === null) {
      return null;
    }

    const intent = parsePendingIntent(serialized);
    if (!intent || intent.expiresAt <= now()) {
      await clear();
      return null;
    }

    return intent;
  }

  return {
    async save(input) {
      const intent = validateInput(input, now());
      await storage.setItemAsync(key, JSON.stringify(intent), secureStoreOptions);
      return intent;
    },
    peek,
    async consume(expectedState) {
      if (!OAUTH_STATE.test(expectedState)) {
        return null;
      }
      const intent = await peek();
      if (!intent || !constantTimeEqual(intent.state, expectedState)) {
        return null;
      }

      await clear();
      return intent;
    },
    clear,
  };
}

export const pendingAuthIntentStore = createPendingAuthIntentStore();
