import { storage } from '@/utils/storage';

export const UI_PREFERENCES_STORAGE_KEY = 'senior-club.ui-preferences.v1';
export const LEGACY_APP_STATE_STORAGE_KEYS = [
  'senior-club.app-state.v4',
  'senior-club.app-state.v3',
  'senior-club.app-state.v2',
  'senior-club.app-state.v1',
] as const;

export interface UiPreferences {
  largeTextEnabled: boolean;
}

type PreferenceStorage = Pick<typeof storage, 'getRaw' | 'set'>;

export const defaultPreferences: UiPreferences = { largeTextEnabled: false };

function readPreferences(source: PreferenceStorage, key: string): UiPreferences | null {
  try {
    const raw = source.getRaw(key);
    const value: unknown = raw === null ? null : JSON.parse(raw);
    if (
      typeof value !== 'object' || value === null || Array.isArray(value) ||
      !('largeTextEnabled' in value) || typeof value.largeTextEnabled !== 'boolean'
    ) return null;
    return { largeTextEnabled: value.largeTextEnabled };
  } catch {
    return null;
  }
}

/** Read only the font preference; leave older and unrelated saves untouched. */
export function createAppStateStore(source: PreferenceStorage = storage) {
  let current = readPreferences(source, UI_PREFERENCES_STORAGE_KEY) ??
    LEGACY_APP_STATE_STORAGE_KEYS.reduce<UiPreferences | null>(
      (found, key) => found ?? readPreferences(source, key),
      null,
    ) ?? defaultPreferences;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update(updater: (state: UiPreferences) => UiPreferences) {
      const next = updater(current);
      if (next.largeTextEnabled === current.largeTextEnabled) return current;
      current = { largeTextEnabled: next.largeTextEnabled };
      try {
        source.set(UI_PREFERENCES_STORAGE_KEY, current);
      } catch {
        // The current session remains usable even if platform storage is unavailable.
      }
      listeners.forEach((listener) => listener());
      return current;
    },
  };
}
