import * as Haptics from 'expo-haptics';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { storage } from '@/utils/storage';
import { useCosmeticBilling } from '@/billing/CosmeticBillingProvider';
import { COSMETIC_PRODUCTS } from '@/billing/cosmetic-products';

import {
  INITIAL_ARCADE_STATE,
  type ArcadePersistedState,
  type EquippedSkinsState,
} from './arcade-defaults';
import { isCalendarDayChanged, markAttendance, resetDailyMissions, resolveRankProgress, todayKey } from './arcade-logic';
import { availableEquipment, requiredCosmetic } from './cosmetic-equipment';

const STORAGE_KEY = 'senior_club_arcade_state_v1';

export type { ArcadePersistedState, DailyMissionsState, EquippedSkinsState } from './arcade-defaults';

/** 하위 호환 별칭 — 새 코드는 INITIAL_ARCADE_STATE를 직접 씁니다. */
const DEFAULT_STATE: ArcadePersistedState = INITIAL_ARCADE_STATE;

interface ArcadeContextValue {
  state: ArcadePersistedState;
  appearance: EquippedSkinsState;
  rankProgress: ReturnType<typeof resolveRankProgress>;
  recordParkGolfClear: (strokesDeltaFromPar: number) => void;
  recordAlkkagiWin: (doubleKnockoutsInMatch: number) => void;
  recordSacheonseongClear: (maxCombo: number) => void;
  claimAttendanceStamp: () => boolean;
  equipSkin: <K extends keyof EquippedSkinsState>(category: K, skin: EquippedSkinsState[K]) => void;
  toggleSound: () => void;
  triggerHaptic: (kind?: 'light' | 'medium' | 'success') => void;
}

const ArcadeContext = createContext<ArcadeContextValue | null>(null);

export function ArcadeProvider({ children }: { children: React.ReactNode }) {
  const { items } = useCosmeticBilling();
  const [state, setState] = useState<ArcadePersistedState>(() => {
    try {
      const saved = storage.get<Partial<ArcadePersistedState>>(STORAGE_KEY, {});
      if (saved && typeof saved === 'object') {
        const merged: ArcadePersistedState = {
          ...DEFAULT_STATE,
          ...saved,
          dailyMissions: { ...DEFAULT_STATE.dailyMissions, ...(saved.dailyMissions ?? {}) },
          lastDailyResetDate: saved.lastDailyResetDate ?? null,
          equippedSkins: { ...DEFAULT_STATE.equippedSkins, ...(saved.equippedSkins ?? {}) },
        };
        const today = todayKey();
        if (isCalendarDayChanged(merged.lastDailyResetDate, today)) {
          const corrected: ArcadePersistedState = {
            ...merged,
            dailyMissions: resetDailyMissions(merged.dailyMissions, today, merged.lastDailyResetDate),
            lastDailyResetDate: today,
          };
          try {
            storage.set(STORAGE_KEY, corrected);
          } catch {
            // Ignore storage write errors on constrained devices
          }
          return corrected;
        }
        return merged;
      }
    } catch {
      // Fallback to default state
    }
    return DEFAULT_STATE;
  });

  const updateAndPersist = useCallback(
    (updater: (prev: ArcadePersistedState) => ArcadePersistedState) => {
      setState((prev) => {
        const next = updater(prev);
        try {
          storage.set(STORAGE_KEY, next);
        } catch {
          // Ignore storage write errors on constrained devices
        }
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      updateAndPersist((prev) => {
        const today = todayKey();
        if (!isCalendarDayChanged(prev.lastDailyResetDate, today)) return prev;
        return {
          ...prev,
          dailyMissions: resetDailyMissions(prev.dailyMissions, today, prev.lastDailyResetDate),
          lastDailyResetDate: today,
        };
      });
    });
    return () => subscription.remove();
  }, [updateAndPersist]);

  const triggerHaptic = useCallback(
    (kind: 'light' | 'medium' | 'success' = 'light') => {
      if (!state.soundEnabled) return;
      if (kind === 'success') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      } else if (kind === 'medium') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      } else {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      }
    },
    [state.soundEnabled],
  );

  const recordParkGolfClear = useCallback(
    (strokesDeltaFromPar: number) => {
      triggerHaptic('success');
      updateAndPersist((prev) => ({
        ...prev,
        cp: prev.cp + (strokesDeltaFromPar <= 0 ? 180 : 120),
        seals: prev.seals + 1,
        lastPlayedMode: 'parkgolf',
        parkGolfClears: prev.parkGolfClears + 1,
        parkGolfBestUnderPar: Math.min(prev.parkGolfBestUnderPar, strokesDeltaFromPar),
        dailyMissions: {
          ...prev.dailyMissions,
          parkGolfDone: true,
        },
      }));
    },
    [triggerHaptic, updateAndPersist],
  );

  const recordAlkkagiWin = useCallback(
    (doubleKnockoutsInMatch: number) => {
      triggerHaptic('success');
      updateAndPersist((prev) => ({
        ...prev,
        cp: prev.cp + 160 + doubleKnockoutsInMatch * 50,
        seals: prev.seals + 1,
        lastPlayedMode: 'alkkagi',
        alkkagiWins: prev.alkkagiWins + 1,
        alkkagiDoubleKnockouts: prev.alkkagiDoubleKnockouts + doubleKnockoutsInMatch,
        dailyMissions: {
          ...prev.dailyMissions,
          alkkagiDone: true,
        },
      }));
    },
    [triggerHaptic, updateAndPersist],
  );

  const recordSacheonseongClear = useCallback(
    (maxCombo: number) => {
      triggerHaptic('success');
      updateAndPersist((prev) => ({
        ...prev,
        cp: prev.cp + 170 + Math.max(0, maxCombo) * 10,
        seals: prev.seals + 1,
        lastPlayedMode: 'sacheonseong',
        sacheonseongClears: prev.sacheonseongClears + 1,
        sacheonseongMaxCombo: Math.max(prev.sacheonseongMaxCombo, maxCombo),
        dailyMissions: {
          ...prev.dailyMissions,
          sacheonseongDone: true,
        },
      }));
    },
    [triggerHaptic, updateAndPersist],
  );

  const claimAttendanceStamp = useCallback(() => {
    let claimed = false;
    updateAndPersist((prev) => {
      if (prev.dailyMissions.attendanceStampClaimed) return prev;
      claimed = true;
      return {
        ...prev,
        cp: prev.cp + 300,
        seals: prev.seals + 2,
        dailyMissions: markAttendance(prev.dailyMissions),
      };
    });
    if (claimed) triggerHaptic('success');
    return claimed;
  }, [triggerHaptic, updateAndPersist]);

  const equipSkin = useCallback(
    <K extends keyof EquippedSkinsState>(category: K, skin: EquippedSkinsState[K]) => {
      const productId = requiredCosmetic(category, skin);
      if (productId && !items[productId].owned) return;
      triggerHaptic('light');
      updateAndPersist((prev) => ({
        ...prev,
        equippedSkins: {
          ...prev.equippedSkins,
          [category]: skin,
        },
      }));
    },
    [items, triggerHaptic, updateAndPersist],
  );

  const toggleSound = useCallback(() => {
    updateAndPersist((prev) => ({
      ...prev,
      soundEnabled: !prev.soundEnabled,
    }));
  }, [updateAndPersist]);

  const rankProgress = useMemo(() => resolveRankProgress(state.cp), [state.cp]);
  const appearance = useMemo(() => availableEquipment(state.equippedSkins, new Set(
    COSMETIC_PRODUCTS.filter(({ id }) => items[id].owned).map(({ id }) => id),
  )), [items, state.equippedSkins]);

  const value = useMemo(
    () => ({
      state,
      appearance,
      rankProgress,
      recordParkGolfClear,
      recordAlkkagiWin,
      recordSacheonseongClear,
      claimAttendanceStamp,
      equipSkin,
      toggleSound,
      triggerHaptic,
    }),
    [
      state,
      appearance,
      rankProgress,
      recordParkGolfClear,
      recordAlkkagiWin,
      recordSacheonseongClear,
      claimAttendanceStamp,
      equipSkin,
      toggleSound,
      triggerHaptic,
    ],
  );

  return <ArcadeContext.Provider value={value}>{children}</ArcadeContext.Provider>;
}

export function useArcade() {
  const ctx = useContext(ArcadeContext);
  if (!ctx) {
    throw new Error('useArcade must be used inside ArcadeProvider');
  }
  return ctx;
}
