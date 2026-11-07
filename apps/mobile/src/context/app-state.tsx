import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useMemo, useState, useSyncExternalStore } from 'react';

import { createAppStateStore, defaultPreferences } from '@/context/app-state-store';

export interface AppStateContextValue {
  largeTextEnabled: boolean;
  toggleLargeText: () => void;
}

export const AppStateContext = createContext<AppStateContextValue | undefined>(undefined);

export function AppStateProvider({ children }: PropsWithChildren) {
  const [stateStore] = useState(() => createAppStateStore());
  const preferences = useSyncExternalStore(
    stateStore.subscribe,
    stateStore.getSnapshot,
    () => defaultPreferences,
  );
  const toggleLargeText = useCallback(() => {
    stateStore.update((current) => ({ largeTextEnabled: !current.largeTextEnabled }));
  }, [stateStore]);
  const value = useMemo(() => ({ ...preferences, toggleLargeText }), [preferences, toggleLargeText]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}
