export const REGISTERED_ANDROID_PUSH_TOKEN_KEY = 'senior-club.android-fcm-token.v1';

const STORE_VERSION = 1 as const;
const MAX_SERIALIZED_LENGTH = 8_192;
const MIN_TOKEN_LENGTH = 20;
const MAX_TOKEN_LENGTH = 4_096;

interface StoredAndroidPushToken {
  version: typeof STORE_VERSION;
  token: string;
  savedAt: number;
}

export interface PushTokenKeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface RegisteredAndroidPushTokenStore {
  read(): Promise<string | null>;
  write(token: string): Promise<void>;
  clear(): Promise<void>;
}

interface CreateRegisteredAndroidPushTokenStoreOptions {
  storage: PushTokenKeyValueStore;
  key?: string;
  now?: () => number;
}

export function isValidAndroidPushToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= MIN_TOKEN_LENGTH &&
    value.length <= MAX_TOKEN_LENGTH &&
    !/[\s\u0000-\u001F\u007F]/.test(value)
  );
}

function parseStoredToken(serialized: string): StoredAndroidPushToken | null {
  if (serialized.length > MAX_SERIALIZED_LENGTH) return null;

  try {
    const candidate = JSON.parse(serialized) as Partial<StoredAndroidPushToken>;
    if (
      candidate.version !== STORE_VERSION ||
      !isValidAndroidPushToken(candidate.token) ||
      typeof candidate.savedAt !== 'number' ||
      !Number.isFinite(candidate.savedAt) ||
      candidate.savedAt <= 0
    ) {
      return null;
    }
    return candidate as StoredAndroidPushToken;
  } catch {
    return null;
  }
}

/** Persists only the last successfully registered native FCM token. */
export function createRegisteredAndroidPushTokenStore(
  options: CreateRegisteredAndroidPushTokenStoreOptions,
): RegisteredAndroidPushTokenStore {
  const key = options.key ?? REGISTERED_ANDROID_PUSH_TOKEN_KEY;
  const now = options.now ?? Date.now;

  return {
    async read() {
      const serialized = await options.storage.getItemAsync(key);
      if (serialized === null) return null;

      const stored = parseStoredToken(serialized);
      if (!stored) {
        await options.storage.deleteItemAsync(key);
        return null;
      }
      return stored.token;
    },

    async write(token) {
      if (!isValidAndroidPushToken(token)) {
        throw new TypeError('Android push token 형식이 유효하지 않습니다.');
      }
      const savedAt = now();
      if (!Number.isFinite(savedAt) || savedAt <= 0) {
        throw new TypeError('Android push token 저장 시각이 유효하지 않습니다.');
      }
      await options.storage.setItemAsync(
        key,
        JSON.stringify({ version: STORE_VERSION, token, savedAt }),
      );
    },

    clear() {
      return options.storage.deleteItemAsync(key);
    },
  };
}
