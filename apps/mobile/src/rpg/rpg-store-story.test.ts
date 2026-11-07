// @vitest-environment jsdom
import { act, createElement, useEffect, useLayoutEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialBonds, getBond } from './bond-logic';
import { RpgProvider, useRpg } from './rpg-store';

const backing = vi.hoisted(() => ({ values: new Map<string, string>(), mode: 'ok', sourceWrites: 0 }));
vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }) } }));
vi.mock('./rpg-db', () => ({ getRpgStorage: () => ({
  supportsGuardedWrites: true,
  getString: (key: string) => backing.values.get(key) ?? null,
  readStringStrict: (key: string) => {
    if (backing.mode === 'read_error') throw new Error('read failed');
    return backing.values.get(key) ?? null;
  },
  setString: (key: string, value: string) => { backing.values.set(key, value); if (key === 'senior_club_rpg_state_v1') backing.sourceWrites++; },
  guardedWrite: (key: string, expected: string | null, value: string, backup?: { key: string; value: string }) => {
    if ((backing.values.get(key) ?? null) !== expected) return 'conflict';
    if (backup) {
      const previous = backing.values.get(backup.key) ?? null;
      if (previous !== null && previous !== backup.value) return 'backup_failed';
      if (previous === null && backing.mode !== 'backup_drop') backing.values.set(backup.key, backup.value);
      if ((backing.values.get(backup.key) ?? null) !== backup.value) return 'backup_failed';
      if (backing.mode === 'race') backing.values.set(key, '{"otherWriter":true}');
    }
    if ((backing.values.get(key) ?? null) !== expected) return 'conflict';
    backing.sourceWrites++;
    backing.values.set(key, value);
    return 'written';
  },
}) }));

const key = 'senior_club_rpg_state_v1';
let root: Root | null;
let container: HTMLDivElement;
let current: ReturnType<typeof useRpg>;
let earlyAction = false;

function Probe() {
  const value = useRpg();
  const attempted = useRef(false);
  useEffect(() => { current = value; }, [value]);
  useLayoutEffect(() => {
    if (earlyAction && !attempted.current) { attempted.current = true; value.movePlayer(1, 0); }
  }, [value]);
  return null;
}
async function mount() {
  root = createRoot(container);
  await act(async () => root!.render(createElement(RpgProvider, null, createElement(Probe))));
}
async function unmount() {
  await act(async () => root?.unmount());
  root = null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  backing.values.clear(); backing.mode = 'ok'; backing.sourceWrites = 0; earlyAction = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = null;
});
afterEach(async () => {
  if (root) await unmount();
  container.parentNode?.removeChild(container);
  vi.unstubAllGlobals();
});

describe('RpgProvider save protection', () => {
  it('does not overwrite the original when backup writing is silently lost, even before the migration effect', async () => {
    const raw = JSON.stringify({ currentChapterId: 'chapter_4', playerPos: { x: 3, y: 3 }, completedChapterIds: ['chapter_1'], stats: { acorns: 77 } });
    backing.values.set(key, raw); backing.mode = 'backup_drop'; earlyAction = true;
    await mount();
    expect(backing.values.get(key)).toBe(raw);
    expect(backing.sourceWrites).toBe(0);
    expect(current.saveProtection).toBe('backup_failed');
    await act(async () => { current.resolveLegacyStory('replay'); current.movePlayer(1, 0); });
    expect(backing.values.get(key)).toBe(raw);
    expect(backing.sourceWrites).toBe(0);
    expect(current.state.storyLegacyChoice).toBe('pending');
    backing.mode = 'ok';
    await act(async () => current.retrySaveProtection());
    expect(current.saveProtection).toBe('ready');
    expect(backing.values.get('senior_club_rpg_state_before_story_v3')).toBe(raw);
    expect(JSON.parse(backing.values.get(key)!).storyLegacyChoice).toBe('pending');
  });

  it('rejects a mismatched backup and preserves a concurrent writer', async () => {
    const raw = JSON.stringify({ currentChapterId: 'chapter_4', completedChapterIds: ['chapter_1'] });
    backing.values.set(key, raw);
    backing.values.set('senior_club_rpg_state_before_story_v3', 'different backup');
    await mount();
    expect(current.saveProtection).toBe('backup_failed');
    await act(async () => current.doMorningGym());
    expect(backing.values.get(key)).toBe(raw);
    expect(backing.values.get('senior_club_rpg_state_before_story_v3')).toBe('different backup');
    await unmount();
    backing.values.delete('senior_club_rpg_state_before_story_v3');
    backing.mode = 'race';
    await mount();
    expect(current.saveProtection).toBe('conflict');
    await act(async () => current.resolveLegacyStory('keep'));
    expect(backing.values.get(key)).toBe('{"otherWriter":true}');
    expect(backing.sourceWrites).toBe(0);
  });

  it('does not rewrite a future save version it cannot interpret', async () => {
    const raw = JSON.stringify({ storyVersion: 99, currentChapterId: 'chapter_4', purchased: ['owned'] });
    backing.values.set(key, raw);
    await mount();
    expect(current.saveProtection).toBe('read_failed');
    await act(async () => current.movePlayer(1, 0));
    expect(backing.values.get(key)).toBe(raw);
    expect(backing.sourceWrites).toBe(0);
  });

  it('treats a swallowed or throwing read error as protected, not as a new save', async () => {
    const raw = JSON.stringify({ currentChapterId: 'chapter_4', stats: { acorns: 77 } });
    backing.values.set(key, raw); backing.mode = 'read_error';
    await mount();
    expect(current.saveProtection).toBe('read_failed');
    await act(async () => { current.movePlayer(1, 0); current.doMorningGym(); current.retrySaveProtection(); });
    expect(backing.values.get(key)).toBe(raw);
    expect(backing.sourceWrites).toBe(0);
  });
});

describe('RpgProvider story attempt scope', () => {
  it('leaves old completed trials untouched when free-play results arrive without attempt IDs', async () => {
    const old = { currentChapterId: 'chapter_1', completedChapterIds: [], completedTrialIds: ['chapter_2'], lastSavedTimestampMs: Date.now() };
    backing.values.set(key, JSON.stringify(old));
    await mount();
    const writes = backing.sourceWrites;
    await act(async () => {
      current.recordStoryResult({ type: 'parkgolf', hole: 1, strokesFromPar: 0 });
      current.recordStoryResult({ type: 'parkgolf', hole: 1, strokesFromPar: 5 });
    });
    expect(current.state.completedTrialIds).toEqual(['chapter_2']);
    expect(current.state.storyTrialFailures).toEqual({});
    expect(backing.sourceWrites).toBe(writes);
    await unmount(); await mount();
    expect(current.state.completedTrialIds).toEqual(['chapter_2']);
  });
});

describe('RpgProvider story persistence', () => {
  it('migrates the old save and restores actual action and episode selections after remount', async () => {
    const old = {
      currentChapterId: 'chapter_3', completedChapterIds: ['chapter_1', 'chapter_2'],
      completedTrialIds: ['chapter_1', 'chapter_2'], lastSavedTimestampMs: Date.now(),
      stats: { acorns: 987 }, inventory: [{ id: 'water_bottle', name: '보온병', description: '', icon: '🍵', count: 0 }],
      bonds: createInitialBonds().map((bond) => bond.npcId === 'chief' ? { ...bond, points: 50 } : bond),
      unknownPurchaseMetadata: { owned: ['paid_skin'] },
    };
    backing.values.set(key, JSON.stringify(old));
    backing.values.set('billing', 'paid_skin');
    await mount();
    expect(JSON.parse(backing.values.get(key)!).storyVersion).toBe(3);
    expect(backing.values.get('senior_club_rpg_state_before_story_v3')).toBe(JSON.stringify(old));
    await act(async () => {
      current.performStoryAction('invite_exchange');
      current.chooseBondEpisode('chief', 'chief_50', 'prepare');
    });
    await unmount();
    await mount();
    expect(current.state.storyActionFlags.invite_exchange).toBe('performed');
    expect(getBond(current.bonds, 'chief').sceneChoices?.chief_50).toBe('prepare');
    expect(current.state.stats.acorns).toBe(987);
    expect(current.state.inventory[0].count).toBe(0);
    expect(JSON.parse(backing.values.get(key)!).unknownPurchaseMetadata).toEqual({ owned: ['paid_skin'] });
    expect(backing.values.get('billing')).toBe('paid_skin');
  });

  it('persists voluntary continuation without crediting a win or modifying CP', async () => {
    backing.values.set(key, JSON.stringify({
      storyVersion: 3, currentChapterId: 'chapter_6', completedChapterIds: ['chapter_1', 'chapter_2', 'chapter_3', 'chapter_4', 'chapter_5'],
      completedTrialIds: ['chapter_1', 'chapter_2', 'chapter_3', 'chapter_4', 'chapter_5'], lastSavedTimestampMs: Date.now(),
    }));
    backing.values.set('arcade', JSON.stringify({ cp: 3500, parkGolfClears: 4 }));
    await mount();
    await act(async () => {
      for (const attemptId of ['one', 'two', 'three']) {
        current.recordStoryResult({ type: 'parkgolf', hole: 3, outcome: 'failure', chapterId: 'chapter_6', attemptId });
      }
    });
    expect(current.state.storyTrialFailures.chapter_6).toBe(3);
    await act(async () => current.continueStoryAfterFailures());
    await act(async () => current.advanceChapter(2000));
    expect(current.state.completedChapterIds).not.toContain('chapter_6');
    await act(async () => current.advanceChapter(3500));
    await unmount();
    await mount();
    expect(current.state.completedChapterIds).toContain('chapter_6');
    expect(current.state.completedTrialIds).not.toContain('chapter_6');
    expect(current.state.storySkippedTrialIds).toContain('chapter_6');
    expect(backing.values.get('arcade')).toBe(JSON.stringify({ cp: 3500, parkGolfClears: 4 }));
  });

  it.each(['keep', 'replay'] as const)('retains history and purchases through a restart after %s', async (choice) => {
    const previous = {
      currentChapterId: 'chapter_5', completedChapterIds: ['chapter_1', 'chapter_2', 'chapter_3', 'chapter_4'],
      completedTrialIds: ['chapter_1', 'chapter_2', 'chapter_3', 'chapter_4'], lastSavedTimestampMs: Date.now(),
      stats: { acorns: 987, wisdomExp: 1500, reputation: 55 },
      inventory: [{ id: 'water_bottle', name: '보온병', description: '', icon: '🍵', count: 0 }],
      bonds: createInitialBonds().map((bond) => bond.npcId === 'chief' ? { ...bond, points: 140, scenesSeen: ['chief_50'], sceneChoices: { chief_50: 'prepare' } } : bond),
      unknownPurchaseMetadata: { owned: ['paid_skin'] },
    };
    backing.values.set(key, JSON.stringify(previous));
    backing.values.set('arcade', JSON.stringify({ cp: 1400, wins: 7 }));
    backing.values.set('billing', 'paid_skin');
    await mount();
    expect(current.state.storyLegacyChoice).toBe('pending');
    expect(current.state.storyActionFlags).not.toHaveProperty('reopen_tea_room');
    await act(async () => current.resolveLegacyStory(choice));
    await unmount();
    await mount();
    expect(current.state.storyLegacyChoice).toBe(choice);
    expect(current.state.storyLegacyArchive?.completedChapterIds).toEqual(previous.completedChapterIds);
    expect(current.state.storyLegacyArchive?.completedTrialIds).toEqual(previous.completedTrialIds);
    expect(current.state.completedTrialIds).toEqual(previous.completedTrialIds);
    expect(current.state.currentChapterId).toBe(choice === 'keep' ? 'chapter_5' : 'chapter_4');
    expect(current.state.stats).toMatchObject(previous.stats);
    expect(current.state.inventory).toEqual(previous.inventory);
    expect(getBond(current.bonds, 'chief').sceneChoices?.chief_50).toBe('prepare');
    const writesBeforeReplay = backing.sourceWrites;
    await act(async () => current.chooseBondEpisode('chief', 'chief_50', 'invite'));
    expect(getBond(current.bonds, 'chief').sceneChoices?.chief_50).toBe('prepare');
    expect(backing.sourceWrites).toBe(writesBeforeReplay);
    expect(JSON.parse(backing.values.get(key)!).unknownPurchaseMetadata).toEqual(previous.unknownPurchaseMetadata);
    expect(backing.values.get('arcade')).toBe(JSON.stringify({ cp: 1400, wins: 7 }));
    expect(backing.values.get('billing')).toBe('paid_skin');
    if (choice === 'replay') {
      await act(async () => {
        current.performStoryAction('collect_supplies');
        current.performStoryAction('deliver_supplies');
        current.recordStoryResult({ type: 'parkgolf', hole: 1, strokesFromPar: 0, chapterId: current.state.currentChapterId, attemptId: 'story-round' });
        current.performStoryAction('reopen_tea_room');
        current.advanceChapter(1400);
      });
      expect(current.state.currentChapterId).toBe('chapter_5');
      expect(current.state.completedTrialIds).toEqual(previous.completedTrialIds);
      expect(current.state.storyFreshTrialCompletedIds).toContain('chapter_4');
      expect(current.state.stats).toMatchObject(previous.stats);
      expect(current.state.storyRewardedChapterIds.filter((id) => id === 'chapter_4')).toHaveLength(1);
      await unmount(); await mount();
      expect(current.state.storyLegacyArchive?.completedChapterIds).toEqual(previous.completedChapterIds);
      expect(current.state.stats).toMatchObject(previous.stats);
    }
  });

});
