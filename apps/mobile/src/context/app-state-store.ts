import {
  createDefaultAppState,
  normalizeInMemoryAppState,
} from '@/context/persisted-app-state';
import type { PersistedAppState } from '@/types';
import { storage } from '@/utils/storage';

export const UI_PREFERENCES_STORAGE_KEY = 'senior-club.ui-preferences.v1';
export const LEGACY_APP_STATE_STORAGE_KEYS = [
  'senior-club.app-state.v4',
  'senior-club.app-state.v3',
  'senior-club.app-state.v2',
  'senior-club.app-state.v1',
] as const;

interface UiPreferences {
  largeTextEnabled: boolean;
}

type PreferenceStorage = Pick<typeof storage, 'getRaw' | 'set' | 'remove'>;

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

/** Member data is never read from generic storage, even if legacy cleanup fails. */
export function createAppStateStore(source: PreferenceStorage = storage) {
  const preferences = readPreferences(source, UI_PREFERENCES_STORAGE_KEY) ??
    LEGACY_APP_STATE_STORAGE_KEYS.reduce<UiPreferences | null>(
      (found, key) => found ?? readPreferences(source, key),
      null,
    ) ?? { largeTextEnabled: false };
  let current: PersistedAppState = {
    ...createDefaultAppState(),
    ...preferences,
  };
  const listeners = new Set<() => void>();

  const persistPreferences = () => {
    // An explicit allowlist also strips unexpected fields from a corrupted/newer cache.
    const allowed: UiPreferences = { largeTextEnabled: current.largeTextEnabled };
    try {
      source.set(UI_PREFERENCES_STORAGE_KEY, allowed);
    } catch {
      // Storage availability must not govern authentication or clearing account data.
    }
    for (const key of LEGACY_APP_STATE_STORAGE_KEYS) {
      try {
        source.remove(key);
      } catch {
        // If deletion is unavailable, try replacing the old PII with harmless preferences.
        try { source.set(key, allowed); } catch { /* Retry cleanup on the next update. */ }
      }
    }
  };

  persistPreferences();

  return {
    getSnapshot: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update(updater: (state: PersistedAppState) => PersistedAppState) {
      current = normalizeInMemoryAppState(updater(current));
      persistPreferences();
      listeners.forEach((listener) => listener());
      return current;
    },
  };
}
