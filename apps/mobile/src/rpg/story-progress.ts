import { STORY_CHAPTERS } from './story-data';
import type { NpcId } from './bond-logic';

/** Existing callers compile unchanged, but a story attempt must carry both IDs. */
type AttemptIdentity = { chapterId?: string; attemptId?: string };
export type StoryGameResult =
  | ({ type: 'parkgolf'; hole: number; strokesFromPar: number } & AttemptIdentity)
  | ({ type: 'alkkagi'; doubleKnockouts: number } & AttemptIdentity)
  | ({ type: 'sacheonseong'; maxCombo: number } & AttemptIdentity)
  | { type: 'parkgolf'; hole: number; outcome: 'failure'; chapterId: string; attemptId: string }
  | { type: 'alkkagi' | 'sacheonseong'; outcome: 'failure'; chapterId: string; attemptId: string };

export type StoryActionId =
  | 'invite_exchange'
  | 'welcome_exchange'
  | 'collect_supplies'
  | 'deliver_supplies'
  | 'reopen_tea_room';
export type StoryActionSource = 'performed' | 'legacy';
export type StoryLegacyChoice = 'pending' | 'keep' | 'replay';
export interface StoryLegacyArchive {
  currentChapterId: string;
  completedChapterIds: string[];
  completedTrialIds: string[];
  storySkippedTrialIds: string[];
  storyTrialFailures: Record<string, number>;
  storyAttemptIds: string[];
  storyActionFlags: Partial<Record<StoryActionId, StoryActionSource>>;
}


export const STORY_ACTIONS: readonly {
  id: StoryActionId;
  chapterId: string;
  npcId: NpcId;
  label: string;
  notice: string;
  requires?: StoryActionId;
  afterTrial?: boolean;
}[] = [
  { id: 'invite_exchange', chapterId: 'chapter_3', npcId: 'chief', label: '태평마을에 초대장 보내기', notice: '김 이장과 친선 교류 초대장을 보냈습니다.' },
  { id: 'welcome_exchange', chapterId: 'chapter_3', npcId: 'tea_manager', label: '친선 손님과 차 나누기', notice: '이 다도명인과 태평마을 손님에게 차를 건네고 인사를 나눴습니다.', requires: 'invite_exchange' },
  { id: 'collect_supplies', chapterId: 'chapter_4', npcId: 'herbalist', label: '차와 약재 꾸러미 받기', notice: '강 원장에게 다실에 전할 차와 약재 꾸러미를 받았습니다.' },
  { id: 'deliver_supplies', chapterId: 'chapter_4', npcId: 'tea_manager', label: '차와 약재 전달하기', notice: '이 다도명인에게 차와 약재 꾸러미를 전했습니다.', requires: 'collect_supplies' },
  { id: 'reopen_tea_room', chapterId: 'chapter_4', npcId: 'tea_manager', label: '함께 다실 다시 열기', notice: '이 다도명인과 매화다실 문을 다시 열었습니다.', requires: 'deliver_supplies', afterTrial: true },
];

export interface StoryProgress {
  currentChapterId: string;
  completedChapterIds: string[];
  completedTrialIds: string[];
  storyVersion?: number;
  storyTrialFailures?: Record<string, number>;
  storyAttemptIds?: string[];
  storySkippedTrialIds?: string[];
  storyActionFlags?: Partial<Record<StoryActionId, StoryActionSource>>;
  storyLegacyChoice?: StoryLegacyChoice | null;
  storyLegacyKeepChapterId?: string | null;
  storyLegacyArchive?: StoryLegacyArchive | null;
  storyRewardedChapterIds?: string[];
  storyFreshTrialChapterIds?: string[];
  storyFreshTrialCompletedIds?: string[];
}

export function storyTrialCompleted(state: StoryProgress): boolean {
  return (state.storyFreshTrialChapterIds ?? []).includes(state.currentChapterId)
    ? (state.storyFreshTrialCompletedIds ?? []).includes(state.currentChapterId)
    : state.completedTrialIds.includes(state.currentChapterId);
}

export function trialResolved(state: StoryProgress): boolean {
  return storyTrialCompleted(state) || (state.storySkippedTrialIds ?? []).includes(state.currentChapterId);
}

/** Counts only completed attempts for this chapter's game/hole, never CP or wins. */
export function recordStoryTrial<T extends StoryProgress>(state: T, result: StoryGameResult): T {
  const chapter = STORY_CHAPTERS.find((item) => item.id === state.currentChapterId);
  if (state.storyLegacyChoice === 'pending' || !chapter || state.completedChapterIds.includes(chapter.id) || storyTrialCompleted(state)) return state;
  if (result.chapterId !== chapter.id || typeof result.attemptId !== 'string' || !result.attemptId.trim()) return state;
  if (result.type !== chapter.climaxTrial.type) return state;
  if (result.type === 'parkgolf' && result.hole !== (chapter.id === 'chapter_6' ? 3 : 1)) return state;
  const attemptKey = `${chapter.id}:${result.attemptId}`;
  if ((state.storyAttemptIds ?? []).includes(attemptKey)) return state;

  let qualified = false;
  if (!('outcome' in result)) {
    switch (result.type) {
      case 'parkgolf':
        if (!Number.isFinite(result.strokesFromPar)) return state;
        qualified = chapter.id === 'chapter_6' || result.strokesFromPar <= 0;
        break;
      case 'alkkagi':
        if (!Number.isFinite(result.doubleKnockouts) || result.doubleKnockouts < 0) return state;
        qualified = chapter.id === 'chapter_2' || result.doubleKnockouts >= 1;
        break;
      case 'sacheonseong':
        if (!Number.isFinite(result.maxCombo) || result.maxCombo < 0) return state;
        qualified = result.maxCombo >= 3;
        break;
    }
  }
  const attempts = [...(state.storyAttemptIds ?? []), attemptKey];
  if (qualified) {
    return {
      ...state,
      completedTrialIds: state.completedTrialIds.includes(chapter.id) ? state.completedTrialIds : [...state.completedTrialIds, chapter.id],
      storyFreshTrialCompletedIds: (state.storyFreshTrialChapterIds ?? []).includes(chapter.id)
        ? [...(state.storyFreshTrialCompletedIds ?? []), chapter.id] : state.storyFreshTrialCompletedIds,
      storySkippedTrialIds: (state.storySkippedTrialIds ?? []).filter((id) => id !== chapter.id),
      storyAttemptIds: attempts,
    };
  }
  const failures = state.storyTrialFailures?.[chapter.id] ?? 0;
  return {
    ...state,
    storyTrialFailures: trialResolved(state) || failures >= 3
      ? state.storyTrialFailures : { ...state.storyTrialFailures, [chapter.id]: failures + 1 },
    storyAttemptIds: attempts,
  };
}

/** The player must explicitly choose to continue after three failures. */
export function continueStoryAfterFailures<T extends StoryProgress>(state: T): T {
  if (state.storyLegacyChoice === 'pending' || state.completedChapterIds.includes(state.currentChapterId) || trialResolved(state) ||
      (state.storyTrialFailures?.[state.currentChapterId] ?? 0) < 3 ||
      !STORY_CHAPTERS.some((chapter) => chapter.id === state.currentChapterId)) return state;
  return { ...state, storySkippedTrialIds: [...(state.storySkippedTrialIds ?? []), state.currentChapterId] };
}

export function isStoryActionAvailable(state: StoryProgress, actionId: StoryActionId): boolean {
  const action = STORY_ACTIONS.find((item) => item.id === actionId);
  return Boolean(state.storyLegacyChoice !== 'pending' && action && state.currentChapterId === action.chapterId &&
    !state.completedChapterIds.includes(action.chapterId) &&
    !state.storyActionFlags?.[action.id] &&
    (!action.requires || state.storyActionFlags?.[action.requires]) &&
    (!action.afterTrial || trialResolved(state)));
}

export function performStoryAction<T extends StoryProgress>(state: T, actionId: StoryActionId): T {
  if (!isStoryActionAvailable(state, actionId)) return state;
  return { ...state, storyActionFlags: { ...state.storyActionFlags, [actionId]: 'performed' } };
}

export function storyStatus(state: StoryProgress, cp: number) {
  const index = STORY_CHAPTERS.findIndex((chapter) => chapter.id === state.currentChapterId);
  const chapter = STORY_CHAPTERS[index];
  if (!chapter) return { kind: 'invalid' } as const;
  if (state.storyLegacyChoice === 'pending') return { kind: 'legacy_choice' } as const;
  if (state.completedChapterIds.includes(chapter.id)) {
    const next = STORY_CHAPTERS[index + 1];
    if (!next) return { kind: 'finished' } as const;
    if (cp < (next.minCp ?? 0)) return { kind: 'rank', requiredCp: next.minCp ?? 0 } as const;
    return { kind: 'ready', isFinal: false, alreadyRecorded: true } as const;
  }
  if (!trialResolved(state)) return { kind: 'trial' } as const;
  const missingAction = STORY_ACTIONS.find((action) => action.chapterId === chapter.id && !state.storyActionFlags?.[action.id]);
  if (missingAction) return { kind: 'actions', nextActionId: missingAction.id } as const;
  const next = STORY_CHAPTERS[index + 1];
  // Keep the existing CP gate; completing the story never changes CP or grants a rank.
  const requiredCp = next?.minCp ?? 3500;
  if (cp < requiredCp) return { kind: 'rank', requiredCp } as const;
  return { kind: 'ready', isFinal: !next } as const;
}

export function completeStoryChapter<T extends StoryProgress>(state: T, cp: number): T {
  if (storyStatus(state, cp).kind !== 'ready') return state;
  const index = STORY_CHAPTERS.findIndex((chapter) => chapter.id === state.currentChapterId);
  return {
    ...state,
    currentChapterId: STORY_CHAPTERS[index + 1]?.id ?? state.currentChapterId,
    completedChapterIds: state.completedChapterIds.includes(state.currentChapterId) ? state.completedChapterIds : [...state.completedChapterIds, state.currentChapterId],
  };
}

/** Save the original history before changing the active route; never manufacture event flags. */
export function resolveLegacyStoryChoice<T extends StoryProgress>(state: T, choice: 'keep' | 'replay'): T {
  if (state.storyLegacyChoice !== 'pending') return state;
  const archive: StoryLegacyArchive = {
    currentChapterId: state.currentChapterId,
    completedChapterIds: [...state.completedChapterIds],
    completedTrialIds: [...state.completedTrialIds],
    storySkippedTrialIds: [...(state.storySkippedTrialIds ?? [])],
    storyTrialFailures: { ...state.storyTrialFailures },
    storyAttemptIds: [...(state.storyAttemptIds ?? [])],
    storyActionFlags: { ...state.storyActionFlags },
  };
  const rewarded = [...new Set([...(state.storyRewardedChapterIds ?? []), ...state.completedChapterIds])];
  if (choice === 'keep') {
    // A chapter_4 trial may be the old finale rather than the new golf trial.
    // Keep it in the archive, but require a real result if chapter 4 is active.
    if (state.currentChapterId !== 'chapter_4') return { ...state, storyLegacyChoice: choice, storyLegacyArchive: archive, storyRewardedChapterIds: rewarded };
    const failures = { ...state.storyTrialFailures };
    delete failures.chapter_4;
    return {
      ...state,
      currentChapterId: state.storyLegacyKeepChapterId ?? state.currentChapterId,
      storyFreshTrialChapterIds: [...new Set([...(state.storyFreshTrialChapterIds ?? []), 'chapter_4'])],
      storyFreshTrialCompletedIds: (state.storyFreshTrialCompletedIds ?? []).filter((id) => id !== 'chapter_4'),
      storySkippedTrialIds: (state.storySkippedTrialIds ?? []).filter((id) => id !== 'chapter_4'),
      storyTrialFailures: failures,
      storyLegacyChoice: choice, storyLegacyArchive: archive, storyRewardedChapterIds: rewarded,
    };
  }
  const replayed = new Set(['chapter_4', 'chapter_5', 'chapter_6']);
  const actionFlags = { ...state.storyActionFlags };
  delete actionFlags.collect_supplies;
  delete actionFlags.deliver_supplies;
  delete actionFlags.reopen_tea_room;
  const failures = { ...state.storyTrialFailures };
  for (const chapterId of replayed) delete failures[chapterId];
  return {
    ...state,
    currentChapterId: 'chapter_4',
    completedChapterIds: state.completedChapterIds.filter((id) => !replayed.has(id)),
    storyFreshTrialChapterIds: [...new Set([...(state.storyFreshTrialChapterIds ?? []), ...replayed])],
    storyFreshTrialCompletedIds: (state.storyFreshTrialCompletedIds ?? []).filter((id) => !replayed.has(id)),
    storySkippedTrialIds: (state.storySkippedTrialIds ?? []).filter((id) => !replayed.has(id)),
    storyTrialFailures: failures,
    storyActionFlags: actionFlags,
    storyLegacyChoice: choice,
    storyLegacyArchive: archive,
    storyRewardedChapterIds: rewarded,
  };
}
