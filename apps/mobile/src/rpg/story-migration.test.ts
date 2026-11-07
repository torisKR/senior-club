import { describe, expect, it } from 'vitest';
import { hasAmbiguousLegacyChapter, migrateRpgStorySave, parseRpgSave, STORY_SAVE_VERSION } from './story-migration';
import { completeStoryChapter, recordStoryTrial, resolveLegacyStoryChoice, storyStatus, type StoryProgress } from './story-progress';

const old = {
  currentChapterId: 'chapter_5', completedChapterIds: ['chapter_1', 'chapter_2', 'chapter_3', 'chapter_4'],
  completedTrialIds: ['chapter_1', 'chapter_2', 'chapter_3', 'chapter_4'],
  stats: { acorns: 987 }, inventory: [{ id: 'water_bottle', count: 0 }],
  bonds: [{ npcId: 'chief', points: 140, scenesSeen: ['old_scene'] }],
  purchasedCosmetics: ['paid_skin'], futureField: { keep: true },
};

describe('story save migration', () => {
  it('detects every versionless chapter_4 reference without guessing what it means', () => {
    expect(hasAmbiguousLegacyChapter({ currentChapterId: 'chapter_4' })).toBe(true);
    expect(hasAmbiguousLegacyChapter({ completedChapterIds: ['chapter_4'] })).toBe(true);
    expect(hasAmbiguousLegacyChapter({ completedTrialIds: ['chapter_4'] })).toBe(true);
    expect(hasAmbiguousLegacyChapter({ currentChapterId: 'chapter_6', completedChapterIds: ['chapter_1', 'chapter_2', 'chapter_3'] })).toBe(true);
    expect(hasAmbiguousLegacyChapter({ currentChapterId: 'chapter_3' })).toBe(false);
    expect(hasAmbiguousLegacyChapter({ storyVersion: 3, currentChapterId: 'chapter_4' })).toBe(false);
  });

  it('preserves original records, resources, purchases and unknown fields pending a choice', () => {
    const upgraded = migrateRpgStorySave(old);
    expect(upgraded).toMatchObject(old);
    expect(upgraded.storyVersion).toBe(STORY_SAVE_VERSION);
    expect(upgraded.storyLegacyChoice).toBe('pending');
    expect(upgraded.storyRewardedChapterIds).toEqual(old.completedChapterIds);
    expect(upgraded.storyActionFlags).toEqual({ invite_exchange: 'legacy', welcome_exchange: 'legacy' });
    expect(Object.values(upgraded.storyActionFlags)).not.toContain('performed');
    expect(upgraded.storyTrialFailures).toEqual({});
    expect(migrateRpgStorySave(JSON.parse(JSON.stringify(upgraded)))).toEqual(upgraded);
  });

  it('keeps all saved progress when requested and holds gameplay until chosen', () => {
    const upgraded = migrateRpgStorySave(old) as typeof old & StoryProgress;
    expect(storyStatus(upgraded, 3500).kind).toBe('legacy_choice');
    expect(recordStoryTrial(upgraded, { type: 'alkkagi', doubleKnockouts: 1 })).toBe(upgraded);
    expect(completeStoryChapter(upgraded, 3500)).toBe(upgraded);
    const kept = resolveLegacyStoryChoice(upgraded, 'keep');
    expect(kept).toMatchObject(old);
    expect(kept.storyLegacyArchive).toMatchObject({ currentChapterId: old.currentChapterId, completedChapterIds: old.completedChapterIds, completedTrialIds: old.completedTrialIds });
    expect(kept.storyLegacyChoice).toBe('keep');
    expect(resolveLegacyStoryChoice(kept, 'replay')).toBe(kept);
    expect(migrateRpgStorySave(JSON.parse(JSON.stringify(kept)))).toEqual(kept);
  });

  it('replays from new chapter 4 while retaining the old history and rewarded chapters', () => {
    const upgraded = migrateRpgStorySave(old) as typeof old & StoryProgress;
    const replay = resolveLegacyStoryChoice(upgraded, 'replay');
    expect(replay.currentChapterId).toBe('chapter_4');
    expect(replay.completedChapterIds).toEqual(['chapter_1', 'chapter_2', 'chapter_3']);
    expect(replay.completedTrialIds).toEqual(old.completedTrialIds);
    expect(replay.storyFreshTrialChapterIds).toEqual(['chapter_4', 'chapter_5', 'chapter_6']);
    expect(replay.storyLegacyArchive?.completedChapterIds).toEqual(old.completedChapterIds);
    expect(replay.storyLegacyArchive?.completedTrialIds).toEqual(old.completedTrialIds);
    expect(replay.storyRewardedChapterIds).toEqual(old.completedChapterIds);
    expect(storyStatus(replay, 1400).kind).toBe('trial');
    const won = recordStoryTrial(replay, { type: 'parkgolf', hole: 1, strokesFromPar: 0, chapterId: 'chapter_4', attemptId: 'new-four' });
    expect(won.completedTrialIds).toEqual(old.completedTrialIds);
    expect(won.storyFreshTrialCompletedIds).toEqual(['chapter_4']);
    expect(replay.storyActionFlags).not.toHaveProperty('reopen_tea_room');
    expect(replay.stats).toEqual(old.stats);
    expect(replay.inventory).toEqual(old.inventory);
    expect(replay.purchasedCosmetics).toEqual(old.purchasedCosmetics);
    expect(replay.bonds).toEqual(old.bonds);
    expect(migrateRpgStorySave(JSON.parse(JSON.stringify(replay)))).toEqual(replay);
  });

  it('continues the known old four-act finale at chapter 6 only if the player keeps it', () => {
    const previous = { currentChapterId: 'chapter_4', completedChapterIds: ['chapter_1', 'chapter_2', 'chapter_3'] };
    const loaded = migrateRpgStorySave(previous) as typeof previous & StoryProgress;
    expect(loaded.storyLegacyChoice).toBe('pending');
    expect(loaded.storyLegacyKeepChapterId).toBe('chapter_6');
    const kept = resolveLegacyStoryChoice(loaded, 'keep');
    const replay = resolveLegacyStoryChoice(loaded, 'replay');
    expect(kept.currentChapterId).toBe('chapter_6');
    expect(kept.storyLegacyArchive?.currentChapterId).toBe('chapter_4');
    expect(replay.currentChapterId).toBe('chapter_4');
    expect(kept.completedChapterIds).toEqual(previous.completedChapterIds);
    expect(kept.completedTrialIds).toEqual([]);
  });

  it('offers replay when an earlier main already moved an old 4-act finale to chapter 6', () => {
    const previous = { currentChapterId: 'chapter_6', completedChapterIds: ['chapter_1', 'chapter_2', 'chapter_3'], completedTrialIds: [], onboarding: { step: 'done', prologueSeen: true } };
    const loaded = migrateRpgStorySave(previous) as typeof previous & StoryProgress;
    expect(loaded.storyLegacyChoice).toBe('pending');
    expect(resolveLegacyStoryChoice(loaded, 'keep').currentChapterId).toBe('chapter_6');
    const replay = resolveLegacyStoryChoice(loaded, 'replay');
    expect(replay.currentChapterId).toBe('chapter_4');
    expect(replay.storyLegacyArchive?.currentChapterId).toBe('chapter_6');
  });

  it('keeps an ambiguous current chapter 4 record without treating its old trial as the new one', () => {
    const previous = { currentChapterId: 'chapter_4', completedChapterIds: ['chapter_1', 'chapter_2', 'chapter_3', 'chapter_4'], completedTrialIds: ['chapter_4'] };
    const loaded = migrateRpgStorySave(previous) as typeof previous & StoryProgress;
    const kept = resolveLegacyStoryChoice(loaded, 'keep');
    expect(kept.storyLegacyArchive?.completedTrialIds).toEqual(['chapter_4']);
    expect(kept.completedTrialIds).toContain('chapter_4');
    expect(kept.storyFreshTrialChapterIds).toContain('chapter_4');
    expect(kept.storyActionFlags).not.toHaveProperty('reopen_tea_room');
    expect(storyStatus(kept, 1400)).toEqual({ kind: 'ready', isFinal: false, alreadyRecorded: true });
    const next = completeStoryChapter(kept, 1400);
    expect(next.currentChapterId).toBe('chapter_5');
    expect(next.completedChapterIds.filter((id) => id === 'chapter_4')).toHaveLength(1);
  });

  it('repairs the former v2 inference using its original backup and preserves performed actions', () => {
    const v2 = { ...old, storyVersion: 2, storyActionFlags: { collect_supplies: 'performed', deliver_supplies: 'legacy', reopen_tea_room: 'legacy' } };
    const upgraded = migrateRpgStorySave(v2, old);
    expect(upgraded.storyLegacyChoice).toBe('pending');
    expect(upgraded.storyActionFlags).toEqual({ collect_supplies: 'performed' });
    expect(migrateRpgStorySave(v2).storyLegacyChoice).toBe('pending');
  });

  it('conservatively prevents rewards already represented by completed chapters from being granted again', () => {
    const current = migrateRpgStorySave({ storyVersion: 3, completedChapterIds: ['chapter_1', 'chapter_4'], storyRewardedChapterIds: ['chapter_1'] });
    expect(current.storyRewardedChapterIds).toEqual(['chapter_1', 'chapter_4']);
  });

  it('accepts double-encoded saves and rejects invalid input', () => {
    expect(parseRpgSave(JSON.stringify(JSON.stringify(old)))).toEqual(old);
    expect(parseRpgSave('{bad')).toBeNull();
    expect(parseRpgSave('[]')).toBeNull();
  });
});
