import type { StoryActionId, StoryActionSource, StoryLegacyArchive, StoryLegacyChoice } from './story-progress';

export const STORY_SAVE_VERSION = 3;
export const STORY_MIGRATION_BACKUP_KEY = 'senior_club_rpg_state_before_story_v3';
export const PREVIOUS_STORY_BACKUP_KEY = 'senior_club_rpg_state_before_story_v2';

type StorySaveFields = {
  storyVersion: number;
  completedTrialIds: string[];
  storyTrialFailures: Record<string, number>;
  storyAttemptIds: string[];
  storySkippedTrialIds: string[];
  storyActionFlags: Partial<Record<StoryActionId, StoryActionSource>>;
  storyLegacyChoice: StoryLegacyChoice | null;
  storyLegacyKeepChapterId: string | null;
  storyLegacyArchive: StoryLegacyArchive | null;
  storyRewardedChapterIds: string[];
  storyFreshTrialChapterIds: string[];
  storyFreshTrialCompletedIds: string[];
};

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}
function version(saved: Record<string, unknown>): number {
  return typeof saved.storyVersion === 'number' && Number.isFinite(saved.storyVersion) ? saved.storyVersion : 1;
}

/** Some older storage adapters returned a JSON-encoded JSON string. */
export function parseRpgSave(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    let parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    return object(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** In versionless saves chapter_4 may refer to two different stories. */
function hasChapterFourEvidence(saved: Record<string, unknown>): boolean {
  const completed = strings(saved.completedChapterIds);
  // Earlier main may already have moved the old finale from 4 to 6 before
  // story saves were versioned. A normal six-act route records 4 and 5 first.
  const previousMainMovedOldFinale = saved.currentChapterId === 'chapter_6' &&
    ['chapter_1', 'chapter_2', 'chapter_3'].every((id) => completed.includes(id)) &&
    !completed.includes('chapter_4') && !completed.includes('chapter_5');
  return saved.currentChapterId === 'chapter_4' || completed.includes('chapter_4') ||
    strings(saved.completedTrialIds).includes('chapter_4') || previousMainMovedOldFinale;
}
export function hasAmbiguousLegacyChapter(saved: Record<string, unknown>): boolean {
  return version(saved) < 2 && hasChapterFourEvidence(saved);
}

/** Preserve main's known old four-act finale mapping, but apply it only after the player's choice. */
function legacyFinalContinuation(saved: Record<string, unknown>): string | null {
  const completed = strings(saved.completedChapterIds);
  const legacyFinal = saved.currentChapterId === 'chapter_4' &&
    !Object.prototype.hasOwnProperty.call(saved, 'completedTrialIds') &&
    !Object.prototype.hasOwnProperty.call(saved, 'onboarding') &&
    ['chapter_1', 'chapter_2', 'chapter_3'].every((id) => completed.includes(id)) &&
    !completed.includes('chapter_4');
  return legacyFinal ? 'chapter_6' : null;
}

/** Only story fields are upgraded; all other and unknown purchase data survives unchanged. */
export function migrateRpgStorySave<T extends Record<string, unknown>>(saved: T, originalV1: Record<string, unknown> | null = null): T & StorySaveFields {
  const oldVersion = version(saved);
  const ambiguous = oldVersion < 2 ? hasAmbiguousLegacyChapter(saved)
    : oldVersion === 2 && (originalV1 !== null ? hasAmbiguousLegacyChapter(originalV1) : hasChapterFourEvidence(saved));
  const actionFlags: StorySaveFields['storyActionFlags'] = {};
  if (object(saved.storyActionFlags)) {
    for (const [key, value] of Object.entries(saved.storyActionFlags)) {
      if (value === 'performed' || value === 'legacy') actionFlags[key as StoryActionId] = value;
    }
  }
  if (oldVersion < 2 && strings(saved.completedChapterIds).includes('chapter_3')) {
    actionFlags.invite_exchange ??= 'legacy';
    actionFlags.welcome_exchange ??= 'legacy';
  }
  // The former v2 migration inferred these three flags from chapter_4 alone.
  // Preserve actual performed flags, but never claim the inferred events happened.
  if (ambiguous && oldVersion === 2) {
    for (const id of ['collect_supplies', 'deliver_supplies', 'reopen_tea_room'] as const) {
      if (actionFlags[id] === 'legacy') delete actionFlags[id];
    }
  }
  const failures: Record<string, number> = {};
  if (object(saved.storyTrialFailures)) {
    for (const [key, value] of Object.entries(saved.storyTrialFailures)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) failures[key] = Math.floor(value);
    }
  }
  const existingChoice = saved.storyLegacyChoice;
  const choice: StoryLegacyChoice | null = existingChoice === 'pending' || existingChoice === 'keep' || existingChoice === 'replay'
    ? existingChoice : ambiguous ? 'pending' : null;
  return {
    ...saved,
    storyVersion: Math.max(STORY_SAVE_VERSION, oldVersion),
    completedTrialIds: strings(saved.completedTrialIds),
    storyTrialFailures: failures,
    storyAttemptIds: strings(saved.storyAttemptIds),
    storySkippedTrialIds: strings(saved.storySkippedTrialIds),
    storyActionFlags: actionFlags,
    storyLegacyChoice: choice,
    storyLegacyKeepChapterId: typeof saved.storyLegacyKeepChapterId === 'string' ? saved.storyLegacyKeepChapterId
      : ambiguous ? legacyFinalContinuation(originalV1 ?? saved) : null,
    storyLegacyArchive: object(saved.storyLegacyArchive) ? saved.storyLegacyArchive as unknown as StoryLegacyArchive : null,
    storyRewardedChapterIds: [...new Set([...strings(saved.storyRewardedChapterIds), ...strings(saved.completedChapterIds)])],
    storyFreshTrialChapterIds: strings(saved.storyFreshTrialChapterIds),
    storyFreshTrialCompletedIds: strings(saved.storyFreshTrialCompletedIds),
  };
}
