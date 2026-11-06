import { STORY_CHAPTERS } from './story-data';

export type StoryGameResult =
  | { type: 'parkgolf'; hole: number; strokesFromPar: number }
  | { type: 'alkkagi'; doubleKnockouts: number }
  | { type: 'sacheonseong'; maxCombo: number };

export interface StoryProgress {
  currentChapterId: string;
  completedChapterIds: string[];
  completedTrialIds: string[];
}

export function recordStoryTrial<T extends StoryProgress>(state: T, result: StoryGameResult): T {
  if (state.completedChapterIds.includes(state.currentChapterId) || state.completedTrialIds.includes(state.currentChapterId)) return state;
  const qualified = (() => {
    switch (state.currentChapterId) {
      case 'chapter_1': return result.type === 'parkgolf' && result.hole === 1 && result.strokesFromPar <= 0;
      case 'chapter_2': return result.type === 'alkkagi';
      case 'chapter_3': return result.type === 'sacheonseong' && result.maxCombo >= 3;
      case 'chapter_4': return result.type === 'parkgolf' && result.hole === 1 && result.strokesFromPar <= 0;
      case 'chapter_5': return result.type === 'alkkagi' && result.doubleKnockouts >= 1;
      case 'chapter_6': return result.type === 'parkgolf' && result.hole === 3;
      default: return false;
    }
  })();
  return qualified ? { ...state, completedTrialIds: [...state.completedTrialIds, state.currentChapterId] } : state;
}

export function storyStatus(state: StoryProgress, cp: number) {
  const index = STORY_CHAPTERS.findIndex((chapter) => chapter.id === state.currentChapterId);
  const chapter = STORY_CHAPTERS[index];
  if (!chapter) return { kind: 'invalid' } as const;
  if (state.completedChapterIds.includes(chapter.id)) return { kind: 'finished' } as const;
  if (!state.completedTrialIds.includes(chapter.id)) return { kind: 'trial' } as const;
  const next = STORY_CHAPTERS[index + 1];
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
    completedChapterIds: [...state.completedChapterIds, state.currentChapterId],
  };
}
