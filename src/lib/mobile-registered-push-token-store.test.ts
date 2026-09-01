import { describe, expect, it } from "vitest";

import {
  REGISTERED_ANDROID_PUSH_TOKEN_KEY,
  createRegisteredAndroidPushTokenStore,
  type PushTokenKeyValueStore,
} from "../../apps/mobile/src/notifications/registered-push-token-store";

function createMemoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(REGISTERED_ANDROID_PUSH_TOKEN_KEY, initial);

  const storage: PushTokenKeyValueStore = {
    async getItemAsync(key) {
      return values.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      values.set(key, value);
    },
    async deleteItemAsync(key) {
      values.delete(key);
    },
  };
  return { storage, values };
}

describe("registered Android push token store", () => {
  const token = "fcm-token_abcdefghijklmnopqrstuvwxyz0123456789";

  it("persists only a versioned token and timestamp", async () => {
    const memory = createMemoryStorage();
    const store = createRegisteredAndroidPushTokenStore({
      storage: memory.storage,
      now: () => 1_700_000_000_000,
    });

    await store.write(token);

    expect(JSON.parse(memory.values.get(REGISTERED_ANDROID_PUSH_TOKEN_KEY)!)).toEqual({
      version: 1,
      token,
      savedAt: 1_700_000_000_000,
    });
    expect(await store.read()).toBe(token);
  });

  it("removes corrupt or unexpected values", async () => {
    const memory = createMemoryStorage('{"version":1,"token":"short","savedAt":1}');
    const store = createRegisteredAndroidPushTokenStore({ storage: memory.storage });

    expect(await store.read()).toBeNull();
    expect(memory.values.has(REGISTERED_ANDROID_PUSH_TOKEN_KEY)).toBe(false);
  });

  it("rejects invalid tokens and clears a valid token", async () => {
    const memory = createMemoryStorage();
    const store = createRegisteredAndroidPushTokenStore({ storage: memory.storage });

    await expect(store.write("contains whitespace and is invalid")).rejects.toThrow(TypeError);
    await store.write(token);
    await store.clear();
    expect(await store.read()).toBeNull();
  });
});
