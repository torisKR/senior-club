import * as SecureStore from 'expo-secure-store';
import type { SecureStoreOptions } from 'expo-secure-store';

export const SESSION_STORAGE_KEY = 'senior-club.session.v1';

const SESSION_VERSION = 1 as const;
const MAX_SECURE_VALUE_LENGTH = 16_384;

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

export interface StoredSession {
  version: typeof SESSION_VERSION;
  userId: string;
  refreshToken: string;
  sessionId?: string;
  refreshTokenExpiresAt?: number;
  savedAt: number;
}

export interface SessionToStore {
  userId: string;
  refreshToken: string;
  sessionId?: string;
  refreshTokenExpiresAt?: number;
}

export interface SessionStore {
  read(): Promise<StoredSession | null>;
  write(session: SessionToStore): Promise<StoredSession>;
  clear(): Promise<void>;
}

export interface CreateSessionStoreOptions {
  storage?: SecureKeyValueStore;
  key?: string;
  secureStoreOptions?: SecureStoreOptions;
  now?: () => number;
}

function isNonEmptyString(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isOptionalTimestamp(value: unknown) {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value > 0);
}

function parseStoredSession(value: string): StoredSession | null {
  if (value.length > MAX_SECURE_VALUE_LENGTH) {
    return null;
  }

  try {
    const candidate = JSON.parse(value) as Partial<StoredSession>;
    if (
      candidate.version !== SESSION_VERSION ||
      !isNonEmptyString(candidate.userId, 256) ||
      !isNonEmptyString(candidate.refreshToken, 12_000) ||
      (candidate.sessionId !== undefined && !isNonEmptyString(candidate.sessionId, 512)) ||
      !isOptionalTimestamp(candidate.refreshTokenExpiresAt) ||
      typeof candidate.savedAt !== 'number' ||
      !Number.isFinite(candidate.savedAt)
    ) {
      return null;
    }

    return candidate as StoredSession;
  } catch {
    return null;
  }
}

function assertSessionToStore(session: SessionToStore) {
  if (!isNonEmptyString(session.userId, 256)) {
    throw new TypeError('userId가 비어 있거나 너무 깁니다.');
  }
  if (!isNonEmptyString(session.refreshToken, 12_000)) {
    throw new TypeError('refreshToken이 비어 있거나 너무 깁니다.');
  }
  if (session.sessionId !== undefined && !isNonEmptyString(session.sessionId, 512)) {
    throw new TypeError('sessionId가 비어 있거나 너무 깁니다.');
  }
  if (!isOptionalTimestamp(session.refreshTokenExpiresAt)) {
    throw new TypeError('refreshTokenExpiresAt은 유효한 epoch millisecond여야 합니다.');
  }
}

/**
 * Persists only the refresh credential. Access tokens should remain in memory.
 * The injected storage and clock make corruption, expiration and rotation testable.
 */
export function createSessionStore(options: CreateSessionStoreOptions = {}): SessionStore {
  const storage = options.storage ?? expoSecureKeyValueStore;
  const key = options.key ?? SESSION_STORAGE_KEY;
  const secureStoreOptions = options.secureStoreOptions ?? defaultSecureStoreOptions;
  const now = options.now ?? Date.now;

  return {
    async read() {
      const serialized = await storage.getItemAsync(key, secureStoreOptions);
      if (serialized === null) {
        return null;
      }

      const session = parseStoredSession(serialized);
      if (!session || (session.refreshTokenExpiresAt !== undefined && session.refreshTokenExpiresAt <= now())) {
        await storage.deleteItemAsync(key, secureStoreOptions);
        return null;
      }

      return session;
    },

    async write(input) {
      assertSessionToStore(input);
      const savedAt = now();
      if (!Number.isFinite(savedAt) || savedAt <= 0) {
        throw new TypeError('세션 저장 시각이 유효하지 않습니다.');
      }
      const session: StoredSession = {
        version: SESSION_VERSION,
        userId: input.userId,
        refreshToken: input.refreshToken,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        ...(input.refreshTokenExpiresAt
          ? { refreshTokenExpiresAt: input.refreshTokenExpiresAt }
          : {}),
        savedAt,
      };
      const serialized = JSON.stringify(session);

      if (serialized.length > MAX_SECURE_VALUE_LENGTH) {
        throw new TypeError('저장할 세션 값이 SecureStore 제한보다 큽니다.');
      }

      await storage.setItemAsync(key, serialized, secureStoreOptions);
      return session;
    },

    clear() {
      return storage.deleteItemAsync(key, secureStoreOptions);
    },
  };
}

export const sessionStore = createSessionStore();
