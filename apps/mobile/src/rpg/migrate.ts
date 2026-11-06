/**
 * Pure helpers for reading a legacy `@/utils/storage` RPG save (a JSON blob
 * that used to live under the AsyncStorage-compatible key
 * `senior_club_rpg_state_v1`) and merging it with defaults.
 *
 * Types are declared locally (structurally compatible with `rpg-store`'s
 * `RpgPersistedState`) to avoid an import cycle between the store and the
 * migration helpers. No React Native / Expo imports here, so this module is
 * testable in plain Node.
 */

export interface LegacyRpgStatsLike {
  vitality?: number;
  maxVitality?: number;
  wisdomExp?: number;
  acorns?: number;
  reputation?: number;
  dailyMorningGymDone?: boolean;
  dailyMedicationTaken?: boolean;
}

export interface LegacyRpgSaveLike {
  playerPos?: { x: number; y: number };
  stats?: LegacyRpgStatsLike;
  quests?: unknown[];
  inventory?: unknown[];
  facilities?: unknown[];
  partners?: unknown[];
  lastSavedTimestampMs?: number;
  currentChapterId?: string;
  completedChapterIds?: string[];
  lastDailyResetDate?: string | null;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

/**
 * Parses the raw legacy save string.
 *
 * - Returns `null` for missing / empty / non-JSON input.
 * - Tolerates partial saves: unknown or wrongly typed fields are dropped.
 * - Returns `null` when nothing usable was found (treated as garbage).
 */
export function parseLegacyRpgSave(
  raw: string | null | undefined,
): Partial<LegacyRpgSaveLike> | null {
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  // Be forgiving about a double-encoded payload (JSON string of a JSON string).
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }

  if (!isPlainObject(parsed)) return null;

  const out: Partial<LegacyRpgSaveLike> = {};

  const playerPos = parsed.playerPos;
  if (isPlainObject(playerPos) && isFiniteNumber(playerPos.x) && isFiniteNumber(playerPos.y)) {
    out.playerPos = { x: playerPos.x, y: playerPos.y };
  }

  const stats = parsed.stats;
  if (isPlainObject(stats)) {
    const nextStats: LegacyRpgStatsLike = {};
    if (isFiniteNumber(stats.vitality)) nextStats.vitality = stats.vitality;
    if (isFiniteNumber(stats.maxVitality)) nextStats.maxVitality = stats.maxVitality;
    if (isFiniteNumber(stats.wisdomExp)) nextStats.wisdomExp = stats.wisdomExp;
    if (isFiniteNumber(stats.acorns)) nextStats.acorns = stats.acorns;
    if (isFiniteNumber(stats.reputation)) nextStats.reputation = stats.reputation;
    if (typeof stats.dailyMorningGymDone === 'boolean') {
      nextStats.dailyMorningGymDone = stats.dailyMorningGymDone;
    }
    if (typeof stats.dailyMedicationTaken === 'boolean') {
      nextStats.dailyMedicationTaken = stats.dailyMedicationTaken;
    }
    if (Object.keys(nextStats).length > 0) out.stats = nextStats;
  }

  if (Array.isArray(parsed.quests)) out.quests = parsed.quests as unknown[];
  if (Array.isArray(parsed.inventory)) out.inventory = parsed.inventory as unknown[];
  if (Array.isArray(parsed.facilities)) out.facilities = parsed.facilities as unknown[];
  if (Array.isArray(parsed.partners)) out.partners = parsed.partners as unknown[];

  if (isFiniteNumber(parsed.lastSavedTimestampMs)) {
    out.lastSavedTimestampMs = parsed.lastSavedTimestampMs;
  }
  if (isNonEmptyString(parsed.currentChapterId)) {
    out.currentChapterId = parsed.currentChapterId;
  }
  if (Array.isArray(parsed.completedChapterIds)) {
    out.completedChapterIds = parsed.completedChapterIds.filter(isNonEmptyString);
  }
  if (parsed.lastDailyResetDate === null || isNonEmptyString(parsed.lastDailyResetDate)) {
    out.lastDailyResetDate = parsed.lastDailyResetDate as string | null;
  }

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Shallow merge that keeps every default and only lets *defined* saved values
 * win. Nested objects (e.g. `stats`) are merged by the caller.
 */
export function mergeWithDefaults<T extends object>(
  saved: Partial<T> | null | undefined,
  defaults: T,
): T {
  if (!saved) return defaults;

  const merged = { ...defaults } as Record<string, unknown>;
  for (const [key, value] of Object.entries(saved)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged as T;
}
