import 'expo-sqlite/localStorage/install';

type StorageListener = () => void;

const listeners = new Map<string, Set<StorageListener>>();

function notify(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

export const storage = {
  getRaw(key: string): string | null {
    return globalThis.localStorage.getItem(key);
  },

  get<T>(key: string, defaultValue: T): T {
    const value = this.getRaw(key);

    if (value === null) {
      return defaultValue;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return defaultValue;
    }
  },

  set<T>(key: string, value: T): void {
    globalThis.localStorage.setItem(key, JSON.stringify(value));
    notify(key);
  },

  update<T>(key: string, defaultValue: T, updater: (current: T) => T): T {
    const currentValue = this.get(key, defaultValue);
    const nextValue = updater(currentValue);
    if (Object.is(nextValue, currentValue)) {
      return currentValue;
    }
    this.set(key, nextValue);
    return nextValue;
  },

  remove(key: string): void {
    globalThis.localStorage.removeItem(key);
    notify(key);
  },

  subscribe(key: string, listener: StorageListener): () => void {
    const keyListeners = listeners.get(key) ?? new Set<StorageListener>();
    keyListeners.add(listener);
    listeners.set(key, keyListeners);

    return () => {
      keyListeners.delete(listener);

      if (keyListeners.size === 0) {
        listeners.delete(key);
      }
    };
  },
};
