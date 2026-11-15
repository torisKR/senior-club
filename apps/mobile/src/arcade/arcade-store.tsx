import * as Haptics from 'expo-haptics';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { storage } from '@/utils/storage';
import { useCosmeticBilling } from '@/billing/CosmeticBillingProvider';
import { COSMETIC_PRODUCTS } from '@/billing/cosmetic-products';
import { MotionPreferenceContext } from '@/fx/motion-preference';
import { stopAllSfx } from '@/audio/sound-manager';

import {
  INITIAL_ARCADE_STATE,
  mergeArcadeState,
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
  saveReadProtected: boolean;
  saveConflict: boolean;
  saveWriteFailed: boolean;
  retrySave: () => boolean;
  appearance: EquippedSkinsState;
  rankProgress: ReturnType<typeof resolveRankProgress>;
  recordParkGolfClear: (strokesDeltaFromPar: number) => void;
  recordAlkkagiWin: (doubleKnockoutsInMatch: number) => void;
  recordSacheonseongClear: (maxCombo: number) => void;
  claimAttendanceStamp: () => boolean;
  equipSkin: <K extends keyof EquippedSkinsState>(category: K, skin: EquippedSkinsState[K]) => void;
  toggleSound: () => void;
  toggleHaptic: () => void;
  toggleReduceMotion: () => void;
  triggerHaptic: (kind?: 'light' | 'medium' | 'success') => void;
}

const ArcadeContext = createContext<ArcadeContextValue | null>(null);

export function ArcadeProvider({ children }: { children: React.ReactNode }) {
  const { items } = useCosmeticBilling();
  const [loaded] = useState((): { state: ArcadePersistedState; protected: boolean; writeFailed: boolean; expectedRaw: string | null } => {
    try {
      const raw = storage.getRaw(STORAGE_KEY);
      const saved: unknown = raw === null ? {} : JSON.parse(raw);
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        const merged = mergeArcadeState(saved);
        const today = todayKey();
        if (isCalendarDayChanged(merged.lastDailyResetDate, today)) {
          const corrected: ArcadePersistedState = {
            ...merged,
            dailyMissions: resetDailyMissions(merged.dailyMissions, today, merged.lastDailyResetDate),
            lastDailyResetDate: today,
          };
          // 다음 실제 변경을 저장할 때 날짜 초기화도 함께 저장합니다.
          return { state: corrected, protected: false, writeFailed: false, expectedRaw: raw };
        }
        return { state: merged, protected: false, writeFailed: false, expectedRaw: raw };
      }
    } catch {
      // Keep the existing record untouched if it cannot be read.
    }
    return { state: DEFAULT_STATE, protected: true, writeFailed: false, expectedRaw: null };
  });
  const [state, setState] = useState<ArcadePersistedState>(loaded.state);
  const stateRef = useRef(loaded.state);
  const expectedRaw = useRef(loaded.expectedRaw);
  const conflictRef = useRef(false);
  const [saveConflict, setSaveConflict] = useState(false);
  const [saveWriteFailed, setSaveWriteFailed] = useState(loaded.writeFailed);

  const persist = useCallback((next: ArcadePersistedState): boolean => {
    if (loaded.protected || conflictRef.current) return false;
    try {
      if (storage.getRaw(STORAGE_KEY) !== expectedRaw.current) {
        conflictRef.current = true;
        setSaveConflict(true);
        return false;
      }
      storage.set(STORAGE_KEY, next);
      expectedRaw.current = JSON.stringify(next);
      setSaveWriteFailed(false);
      return true;
    } catch {
      setSaveWriteFailed(true);
      return false;
    }
  }, [loaded.protected]);

  const retrySave = useCallback(() => persist(stateRef.current), [persist]);

  const updateAndPersist = useCallback(
    (updater: (prev: ArcadePersistedState) => ArcadePersistedState) => {
      const stored = stateRef.current;
      const today = todayKey();
      const current = isCalendarDayChanged(stored.lastDailyResetDate, today)
        ? { ...stored, dailyMissions: resetDailyMissions(stored.dailyMissions, today, stored.lastDailyResetDate), lastDailyResetDate: today }
        : stored;
      const next = updater(current);
      if (next === stored) return;
      stateRef.current = next;
      setState(next);
      persist(next);
    },
    [persist],
  );

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const refreshDay = () => updateAndPersist((prev) => prev);
    const updateTimer = (nextState: string) => {
      if (timer !== null) clearInterval(timer);
      timer = null;
      if (nextState !== 'active') {
        stopAllSfx();
        return;
      }
      refreshDay();
      timer = setInterval(refreshDay, 60_000);
    };
    const subscription = AppState.addEventListener('change', (nextState) => {
      updateTimer(nextState);
    });
    updateTimer(AppState.currentState ?? 'active');
    return () => {
      subscription.remove();
      if (timer !== null) clearInterval(timer);
    };
  }, [updateAndPersist]);

  const triggerHaptic = useCallback(
    (kind: 'light' | 'medium' | 'success' = 'light') => {
      if (!stateRef.current.hapticEnabled) return;
      if (kind === 'success') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      } else if (kind === 'medium') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      } else {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      }
    },
    [],
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
    if (stateRef.current.soundEnabled) stopAllSfx();
    updateAndPersist((prev) => ({
      ...prev,
      soundEnabled: !prev.soundEnabled,
    }));
  }, [updateAndPersist]);

  const toggleHaptic = useCallback(() => {
    updateAndPersist((prev) => ({ ...prev, hapticEnabled: !prev.hapticEnabled }));
  }, [updateAndPersist]);

  const toggleReduceMotion = useCallback(() => {
    updateAndPersist((prev) => ({ ...prev, reduceMotion: !prev.reduceMotion }));
  }, [updateAndPersist]);

  const rankProgress = useMemo(() => resolveRankProgress(state.cp), [state.cp]);
  const appearance = useMemo(() => availableEquipment(state.equippedSkins, new Set(
    COSMETIC_PRODUCTS.filter(({ id }) => items[id].owned).map(({ id }) => id),
  )), [items, state.equippedSkins]);

  const value = useMemo(
    () => ({
      state,
      saveReadProtected: loaded.protected,
      saveConflict,
      saveWriteFailed,
      retrySave,
      appearance,
      rankProgress,
      recordParkGolfClear,
      recordAlkkagiWin,
      recordSacheonseongClear,
      claimAttendanceStamp,
      equipSkin,
      toggleSound,
      toggleHaptic,
      toggleReduceMotion,
      triggerHaptic,
    }),
    [
      state,
      loaded.protected,
      saveConflict,
      saveWriteFailed,
      retrySave,
      appearance,
      rankProgress,
      recordParkGolfClear,
      recordAlkkagiWin,
      recordSacheonseongClear,
      claimAttendanceStamp,
      equipSkin,
      toggleSound,
      toggleHaptic,
      toggleReduceMotion,
      triggerHaptic,
    ],
  );

  return <ArcadeContext.Provider value={value}>
    <MotionPreferenceContext.Provider value={state.reduceMotion}>{children}</MotionPreferenceContext.Provider>
  </ArcadeContext.Provider>;
}

export function useArcade() {
  const ctx = useContext(ArcadeContext);
  if (!ctx) {
    throw new Error('useArcade must be used inside ArcadeProvider');
  }
  return ctx;
}
