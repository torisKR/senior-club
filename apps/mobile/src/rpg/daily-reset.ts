/**
 * Pure helpers for the date-keyed daily reset of wellness flags.
 *
 * They are deliberately free of React Native / Expo imports so they can be
 * unit tested in a plain Node environment.
 */

export interface DailyResettableStats {
  dailyMorningGymDone?: boolean;
  dailyMedicationTaken?: boolean;
}

export interface DailyResettableState {
  lastDailyResetDate?: string | null;
  stats?: DailyResettableStats;
  /** 하루가 지나면 완만히 식는 마음 온도 (0~100) */
  heartWarmth?: number;
  quests?: readonly { targetType: string; completed: boolean; currentCount: number }[];
}

/** 하루가 지날 때 마음 온도가 식는 양 */
export const WARMTH_DAILY_DECAY = 10;

const pad2 = (value: number): string => (value < 10 ? `0${value}` : String(value));

/**
 * Local-time date key in `YYYY-MM-DD` form (not UTC, so "today" matches the
 * user's wall clock).
 */
export function todayKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** A reset is needed whenever the stored key is missing or from another day. */
export function needsDailyReset(
  lastResetDate: string | null | undefined,
  today: string,
): boolean {
  if (!today) return false;
  return lastResetDate !== today;
}

/**
 * Returns the state with `lastDailyResetDate` stamped to `today` and the daily
 * wellness flags cleared when the day changed. Returns the identical object
 * (no copy) when no reset is needed.
 */
export function withDailyReset<T extends DailyResettableState>(state: T, today: string): T {
  if (!needsDailyReset(state.lastDailyResetDate ?? null, today)) {
    return state;
  }

  return {
    ...state,
    lastDailyResetDate: today,
    ...(state.stats
      ? {
          stats: {
            ...state.stats,
            dailyMorningGymDone: false,
            dailyMedicationTaken: false,
          },
        }
      : {}),
    ...(typeof state.heartWarmth === 'number'
      ? { heartWarmth: Math.max(0, state.heartWarmth - WARMTH_DAILY_DECAY) }
      : {}),
    ...(state.quests
      ? { quests: state.quests.map((quest) => quest.targetType === 'daily_wellness' && !quest.completed
        ? { ...quest, currentCount: 0 } : quest) }
      : {}),
  } as T;
}
