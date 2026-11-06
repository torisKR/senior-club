import { describe, expect, it } from 'vitest';
import {
  completeStoryChapter, continueStoryAfterFailures, performStoryAction, recordStoryTrial,
  storyStatus, type StoryGameResult, type StoryProgress,
} from './story-progress';

const start = (): StoryProgress => ({ currentChapterId: 'chapter_1', completedChapterIds: [], completedTrialIds: [] });

describe('six-act story progression', () => {
  it('ignores free play and requires the active chapter plus a nonempty attempt ID', () => {
    const initial = start();
    expect(recordStoryTrial(initial, { type: 'parkgolf', hole: 1, strokesFromPar: 0 })).toBe(initial);
    expect(recordStoryTrial(initial, { type: 'parkgolf', hole: 1, strokesFromPar: 4 })).toBe(initial);
    expect(recordStoryTrial(initial, { type: 'parkgolf', hole: 1, strokesFromPar: 0, chapterId: 'chapter_1' })).toBe(initial);
    expect(recordStoryTrial(initial, { type: 'parkgolf', hole: 1, strokesFromPar: 0, attemptId: 'round' })).toBe(initial);
    expect(recordStoryTrial(initial, { type: 'parkgolf', hole: 1, strokesFromPar: 0, chapterId: 'chapter_1', attemptId: '  ' })).toBe(initial);
    expect(recordStoryTrial(initial, { type: 'parkgolf', hole: 1, strokesFromPar: 0, chapterId: 'chapter_4', attemptId: 'stale' })).toBe(initial);
    expect(initial.completedTrialIds).toEqual([]);
    expect(initial.storyTrialFailures).toBeUndefined();
  });

  it('remembers terminal attempts even after the failure counter reaches three', () => {
    let progress = start();
    for (const attemptId of ['1', '2', '3', '4']) {
      progress = recordStoryTrial(progress, { type: 'parkgolf', hole: 1, strokesFromPar: 2, chapterId: 'chapter_1', attemptId });
    }
    expect(progress.storyTrialFailures?.chapter_1).toBe(3);
    expect(recordStoryTrial(progress, { type: 'parkgolf', hole: 1, strokesFromPar: 0, chapterId: 'chapter_1', attemptId: '4' })).toBe(progress);
  });

  it('requires the correct trial and the next rank, in either order', () => {
    const initial = start();
    expect(recordStoryTrial(initial, { type: 'parkgolf', hole: 2, strokesFromPar: 0, chapterId: 'chapter_1', attemptId: 'wrong-hole' })).toBe(initial);
    expect(completeStoryChapter(initial, 500)).toBe(initial);
    const trial = recordStoryTrial(initial, { type: 'parkgolf', hole: 1, strokesFromPar: 0, chapterId: 'chapter_1', attemptId: 'correct' });
    expect(storyStatus(trial, 180)).toEqual({ kind: 'rank', requiredCp: 200 });
    expect(completeStoryChapter(trial, 180)).toBe(trial);
    expect(completeStoryChapter(trial, 200).currentChapterId).toBe('chapter_2');
  });

  it('records all six real trials and activities while retaining the original CP gates', () => {
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
      progress = recordStoryTrial(progress, { ...result, chapterId: progress.currentChapterId, attemptId: `${progress.currentChapterId}-win` });
      if (progress.currentChapterId === 'chapter_3') {
        progress = performStoryAction(progress, 'invite_exchange');
        progress = performStoryAction(progress, 'welcome_exchange');
      }
      if (progress.currentChapterId === 'chapter_4') {
        progress = performStoryAction(progress, 'collect_supplies');
        progress = performStoryAction(progress, 'deliver_supplies');
        progress = performStoryAction(progress, 'reopen_tea_room');
      }
      progress = JSON.parse(JSON.stringify(progress));
      expect(storyStatus(progress, cp).kind).toBe('ready');
      progress = completeStoryChapter(progress, cp);
    }
    expect(progress.completedChapterIds).toHaveLength(6);
    expect(storyStatus(progress, 3500).kind).toBe('finished');
    expect(completeStoryChapter(progress, 3500)).toBe(progress);
  });

  it('keeps the final 3500 CP gate separate from recording a real trial win', () => {
    const final = { ...start(), currentChapterId: 'chapter_6', cp: 2000 };
    const won = recordStoryTrial(final, { type: 'parkgolf', hole: 3, strokesFromPar: 2, chapterId: 'chapter_6', attemptId: 'final-win' });
    expect(won.completedTrialIds).toEqual(['chapter_6']);
    expect(storyStatus(won, won.cp)).toEqual({ kind: 'rank', requiredCp: 3500 });
    expect(completeStoryChapter(won, won.cp)).toBe(won);
    expect(won.cp).toBe(2000);
    expect(storyStatus(won, 3500).kind).toBe('ready');
  });

  it('offers voluntary continuation after three distinct failures without inventing a win or CP', () => {
    const initial = { ...start(), cp: 237, purchases: ['paid_skin'] };
    let progress = recordStoryTrial(initial, { type: 'parkgolf', hole: 1, strokesFromPar: 2, chapterId: 'chapter_1', attemptId: 'round-1' });
    expect(recordStoryTrial(progress, { type: 'parkgolf', hole: 1, outcome: 'failure', chapterId: 'chapter_1', attemptId: 'round-1' })).toBe(progress);
    expect(continueStoryAfterFailures(progress)).toBe(progress);
    progress = recordStoryTrial(progress, { type: 'parkgolf', hole: 1, outcome: 'failure', chapterId: 'chapter_1', attemptId: 'round-2' });
    progress = recordStoryTrial(progress, { type: 'parkgolf', hole: 1, strokesFromPar: 1, chapterId: 'chapter_1', attemptId: 'round-3' });
    expect(progress.storyTrialFailures?.chapter_1).toBe(3);
    expect(storyStatus(progress, 237).kind).toBe('trial');
    progress = continueStoryAfterFailures(progress);
    expect(progress.completedTrialIds).toEqual([]);
    expect(progress.storySkippedTrialIds).toEqual(['chapter_1']);
    expect(progress.cp).toBe(237);
    expect(progress.purchases).toEqual(['paid_skin']);
    progress = completeStoryChapter(progress, 237);
    expect(progress.completedChapterIds).toEqual(['chapter_1']);
    expect(progress.completedTrialIds).toEqual([]);
    expect(progress.cp).toBe(237);
  });

  it('ignores wrong, stale, malformed and repeated results', () => {
    const fifth = { ...start(), currentChapterId: 'chapter_5' };
    expect(recordStoryTrial(fifth, { type: 'parkgolf', hole: 1, strokesFromPar: 0, chapterId: 'chapter_5', attemptId: 'wrong-game' })).toBe(fifth);
    expect(recordStoryTrial(fifth, { type: 'alkkagi', outcome: 'failure', chapterId: 'chapter_2', attemptId: 'old' })).toBe(fifth);
    expect(recordStoryTrial(fifth, { type: 'alkkagi', doubleKnockouts: Number.NaN, chapterId: 'chapter_5', attemptId: 'nan' })).toBe(fifth);
    expect(recordStoryTrial(fifth, { type: 'alkkagi', outcome: 'failure', chapterId: 'chapter_5', attemptId: '' })).toBe(fifth);
    const last = { ...start(), currentChapterId: 'chapter_6' };
    expect(recordStoryTrial(last, { type: 'parkgolf', hole: 1, strokesFromPar: 0, chapterId: 'chapter_6', attemptId: 'wrong-hole' })).toBe(last);
  });

  it('records weaker outcomes as trial failures and allows a later real success', () => {
    let fifth = { ...start(), currentChapterId: 'chapter_5' };
    fifth = recordStoryTrial(fifth, { type: 'alkkagi', doubleKnockouts: 0, chapterId: 'chapter_5', attemptId: 'weak' });
    expect(fifth.storyTrialFailures?.chapter_5).toBe(1);
    fifth = recordStoryTrial(fifth, { type: 'alkkagi', doubleKnockouts: 1, chapterId: 'chapter_5', attemptId: 'strong' });
    expect(fifth.completedTrialIds).toEqual(['chapter_5']);
    expect(recordStoryTrial(fifth, { type: 'alkkagi', doubleKnockouts: 1, chapterId: 'chapter_5', attemptId: 'strong' })).toBe(fifth);
  });

  it('requires ordered exchange and delivery actions and reopens only after the trial', () => {
    let third = { ...start(), currentChapterId: 'chapter_3' };
    expect(performStoryAction(third, 'welcome_exchange')).toBe(third);
    third = recordStoryTrial(third, { type: 'sacheonseong', maxCombo: 3, chapterId: 'chapter_3', attemptId: 'third' });
    expect(storyStatus(third, 900)).toEqual({ kind: 'actions', nextActionId: 'invite_exchange' });
    third = performStoryAction(third, 'invite_exchange');
    third = performStoryAction(third, 'welcome_exchange');
    expect(third.storyActionFlags).toEqual({ invite_exchange: 'performed', welcome_exchange: 'performed' });
    let fourth = completeStoryChapter(third, 900);
    expect(performStoryAction(fourth, 'deliver_supplies')).toBe(fourth);
    fourth = performStoryAction(fourth, 'collect_supplies');
    fourth = performStoryAction(fourth, 'deliver_supplies');
    expect(performStoryAction(fourth, 'reopen_tea_room')).toBe(fourth);
    fourth = recordStoryTrial(fourth, { type: 'parkgolf', hole: 1, strokesFromPar: 0, chapterId: 'chapter_4', attemptId: 'fourth' });
    fourth = performStoryAction(fourth, 'reopen_tea_room');
    expect(fourth.storyActionFlags?.reopen_tea_room).toBe('performed');
    expect(storyStatus(fourth, 1400).kind).toBe('ready');
  });
});
