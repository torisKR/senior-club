import { describe, expect, it } from 'vitest';
import { completeStoryChapter, recordStoryTrial, storyStatus, type StoryGameResult, type StoryProgress } from './story-progress';

const start = (): StoryProgress => ({ currentChapterId: 'chapter_1', completedChapterIds: [], completedTrialIds: [] });

describe('six-act story progression', () => {
  it('requires the correct trial and the next rank, in either order', () => {
    const initial = start();
    const wrong = recordStoryTrial(initial, { type: 'parkgolf', hole: 2, strokesFromPar: 0 });
    expect(wrong).toBe(initial);
    expect(completeStoryChapter(initial, 500)).toBe(initial);
    const trial = recordStoryTrial(initial, { type: 'parkgolf', hole: 1, strokesFromPar: 0 });
    expect(storyStatus(trial, 180)).toEqual({ kind: 'rank', requiredCp: 200 });
    expect(completeStoryChapter(trial, 180)).toBe(trial);
    expect(completeStoryChapter(trial, 200).currentChapterId).toBe('chapter_2');
  });

  it('records each chapter trial, finishes the last chapter once and survives JSON restore', () => {
    const rounds: { result: StoryGameResult; cp: number }[] = [
      { result: { type: 'parkgolf', hole: 1, strokesFromPar: -1 }, cp: 200 },
      { result: { type: 'alkkagi', doubleKnockouts: 0 }, cp: 500 },
      { result: { type: 'sacheonseong', maxCombo: 3 }, cp: 900 },
      { result: { type: 'parkgolf', hole: 1, strokesFromPar: 0 }, cp: 1400 },
      { result: { type: 'alkkagi', doubleKnockouts: 1 }, cp: 2000 },
      { result: { type: 'parkgolf', hole: 3, strokesFromPar: 2 }, cp: 3500 },
    ];
    let progress = start();
    for (const { result, cp } of rounds) {
      progress = recordStoryTrial(progress, result);
      progress = JSON.parse(JSON.stringify(progress));
      expect(storyStatus(progress, cp).kind).toBe('ready');
      progress = completeStoryChapter(progress, cp);
    }
    expect(progress.completedChapterIds).toHaveLength(6);
    expect(storyStatus(progress, 3500).kind).toBe('finished');
    expect(completeStoryChapter(progress, 3500)).toBe(progress);
  });

  it('does not credit a weaker result or a trial from a previous chapter', () => {
    const fifth = { ...start(), currentChapterId: 'chapter_5' };
    expect(recordStoryTrial(fifth, { type: 'alkkagi', doubleKnockouts: 0 })).toBe(fifth);
    const third = { ...start(), currentChapterId: 'chapter_3' };
    expect(recordStoryTrial(third, { type: 'sacheonseong', maxCombo: 2 })).toBe(third);
    const last = { ...start(), currentChapterId: 'chapter_6' };
    expect(recordStoryTrial(last, { type: 'parkgolf', hole: 1, strokesFromPar: 0 })).toBe(last);
  });
});
