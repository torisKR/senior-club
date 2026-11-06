// @vitest-environment jsdom
import { act, createElement, StrictMode, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { calculateOfflineIdleRewards, DEFAULT_FACILITIES, DEFAULT_PARTNERS } from './idle-system';
import { RpgProvider, useRpg } from './rpg-store';

const fixtures = vi.hoisted(() => ({
  saved: new Map<string, string>(),
  listener: null as ((state: string) => void) | null,
  appState: 'active',
}));

vi.mock('react-native', () => ({
  AppState: {
    get currentState() { return fixtures.appState; },
    addEventListener: (_event: string, listener: (state: string) => void) => {
      fixtures.listener = listener;
      return { remove: () => { fixtures.listener = null; } };
    },
  },
}));

vi.mock('./rpg-db', () => ({
  getRpgStorage: () => ({
    getString: (key: string) => fixtures.saved.get(key) ?? null,
    setString: (key: string, value: string) => { fixtures.saved.set(key, value); },
  }),
}));

const KEY = 'senior_club_rpg_state_v1';
const START = new Date('2026-11-06T12:00:00Z');
let current: ReturnType<typeof useRpg>;
let container: HTMLDivElement;
let root: Root | null;

function Probe() {
  const value = useRpg();
  useLayoutEffect(() => { current = value; }, [value]);
  return null;
}

async function mount() {
  root = createRoot(container);
  await act(async () => { root!.render(createElement(RpgProvider, null, createElement(Probe))); });
}

async function unmount() {
  await act(async () => { root?.unmount(); });
  root = null;
}

async function transition(state: string) {
  fixtures.appState = state;
  await act(async () => { fixtures.listener?.(state); });
}

function seed(overrides: Record<string, unknown> = {}) {
  fixtures.saved.set(KEY, JSON.stringify({
    playerPos: { x: 3, y: 3 },
    stats: { acorns: 777, wisdomExp: 500 },
    currentChapterId: 'chapter_1',
    completedChapterIds: [],
    lastSavedTimestampMs: Date.now(),
    ...overrides,
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  fixtures.saved.clear();
  fixtures.listener = null;
  fixtures.appState = 'active';
  container = document.createElement('div');
  document.body.append(container);
  root = null;
});

afterEach(async () => {
  if (root) await unmount();
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('RPG story save migration', () => {
  it('moves the old final chapter to the new final chapter without changing other progress', async () => {
    seed({
      currentChapterId: 'chapter_4',
      completedChapterIds: ['chapter_1', 'chapter_2', 'chapter_3'],
      inventory: [{ id: 'water_bottle', name: 'saved', description: '', count: 8, icon: '' }],
    });
    await mount();
    expect(current.currentChapter.id).toBe('chapter_6');
    expect(current.state.completedChapterIds).toEqual(['chapter_1', 'chapter_2', 'chapter_3']);
    expect(current.state.completedTrialIds).toEqual([]);
    expect(current.state.stats.acorns).toBe(777);
    expect(current.state.inventory[0].count).toBe(8);
    expect(JSON.parse(fixtures.saved.get(KEY)!).currentChapterId).toBe('chapter_6');

    await unmount();
    await mount();
    expect(current.currentChapter.id).toBe('chapter_6');
  });

  it('does not remap a new chapter four save or an ambiguous partial save', async () => {
    seed({
      currentChapterId: 'chapter_4',
      completedChapterIds: ['chapter_1', 'chapter_2', 'chapter_3'],
      completedTrialIds: [],
    });
    await mount();
    expect(current.currentChapter.id).toBe('chapter_4');
    await unmount();

    seed({ currentChapterId: 'chapter_4', completedChapterIds: [] });
    await mount();
    expect(current.currentChapter.id).toBe('chapter_4');
    await unmount();

    seed({
      currentChapterId: 'chapter_4',
      completedChapterIds: ['chapter_1', 'chapter_2', 'chapter_3'],
      onboarding: { step: 'done', prologueSeen: true },
    });
    await mount();
    expect(current.currentChapter.id).toBe('chapter_4');
  });
});

describe('offline reward lifecycle', () => {
  it('settles only time in the background and preserves an unclaimed reward through actions and restart', async () => {
    seed();
    await mount();
    vi.setSystemTime(START.getTime() + 2 * 3600_000);
    await transition('background');
    vi.setSystemTime(START.getTime() + 3 * 3600_000);
    await transition('active');

    const reward = calculateOfflineIdleRewards(0, 3600_000, DEFAULT_FACILITIES, DEFAULT_PARTNERS)!;
    expect(current.pendingOfflineReward).toEqual(reward);
    expect(current.state.stats.acorns).toBe(777);
    await transition('active');
    expect(current.pendingOfflineReward).toEqual(reward);

    await act(async () => { current.movePlayer(1, 0); });
    await unmount();
    vi.setSystemTime(START.getTime() + 3 * 3600_000 + 1000);
    await mount();
    expect(current.pendingOfflineReward).toEqual(reward);
    await act(async () => { current.claimOfflineReward(); current.claimOfflineReward(); });
    expect(current.state.stats.acorns).toBe(777 + reward.earnedAcorns);
    expect(current.pendingOfflineReward).toBeNull();
    await unmount();
    await mount();
    expect(current.state.stats.acorns).toBe(777 + reward.earnedAcorns);
    expect(current.pendingOfflineReward).toBeNull();
  });

  it('adds repeated offline periods to an unclaimed reward without capping their combined total', async () => {
    seed();
    await mount();
    await transition('background');
    vi.setSystemTime(START.getTime() + 6 * 3600_000);
    await transition('active');
    const first = current.pendingOfflineReward!;
    await transition('background');
    vi.setSystemTime(START.getTime() + 10 * 3600_000);
    await transition('active');
    const second = calculateOfflineIdleRewards(0, 4 * 3600_000, DEFAULT_FACILITIES, DEFAULT_PARTNERS)!;
    expect(current.pendingOfflineReward).toMatchObject({
      cappedElapsedSec: first.cappedElapsedSec + second.cappedElapsedSec,
      earnedAcorns: first.earnedAcorns + second.earnedAcorns,
      earnedExp: first.earnedExp + second.earnedExp,
    });
  });

  it('settles a saved background interval after process restart without granting it twice', async () => {
    seed();
    await mount();
    await transition('background');
    await unmount();
    vi.setSystemTime(START.getTime() + 3600_000);
    fixtures.appState = 'active';
    await mount();
    const reward = calculateOfflineIdleRewards(0, 3600_000, DEFAULT_FACILITIES, DEFAULT_PARTNERS)!;
    expect(current.pendingOfflineReward).toEqual(reward);
    await unmount();
    await mount();
    expect(current.pendingOfflineReward).toEqual(reward);
  });

  it('keeps an existing reward when the process restarts during a later background period', async () => {
    seed();
    await mount();
    await transition('background');
    vi.setSystemTime(START.getTime() + 6 * 3600_000);
    await transition('active');
    const first = current.pendingOfflineReward!;
    await transition('background');
    await unmount();
    vi.setSystemTime(START.getTime() + 16 * 3600_000);
    fixtures.appState = 'active';
    await mount();
    const second = calculateOfflineIdleRewards(0, 10 * 3600_000, DEFAULT_FACILITIES, DEFAULT_PARTNERS)!;
    expect(current.pendingOfflineReward).toMatchObject({
      cappedElapsedSec: first.cappedElapsedSec + second.cappedElapsedSec,
      earnedAcorns: first.earnedAcorns + second.earnedAcorns,
      earnedExp: first.earnedExp + second.earnedExp,
    });
    await unmount();
    await mount();
    expect(current.pendingOfflineReward?.earnedAcorns).toBe(first.earnedAcorns + second.earnedAcorns);
  });

  it('retains a legacy cold-start reward when later gameplay saves before it is claimed', async () => {
    seed({ lastSavedTimestampMs: START.getTime() - 3600_000 });
    await mount();
    const reward = current.pendingOfflineReward;
    expect(reward?.cappedElapsedSec).toBe(3600);
    await act(async () => { current.movePlayer(1, 0); });
    await unmount();
    await mount();
    expect(current.pendingOfflineReward).toEqual(reward);
  });

  it('does not double count a cold-start reward under StrictMode', async () => {
    seed({ lastSavedTimestampMs: START.getTime() - 3600_000 });
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(StrictMode, null, createElement(RpgProvider, null, createElement(Probe))));
    });
    const reward = calculateOfflineIdleRewards(0, 3600_000, DEFAULT_FACILITIES, DEFAULT_PARTNERS)!;
    expect(current.pendingOfflineReward).toEqual(reward);
  });

  it('persists multiple shared game-result updates in the same event', async () => {
    seed();
    await mount();
    await act(async () => {
      current.completeQuestStep('parkgolf');
      current.recordStoryResult({ type: 'parkgolf', hole: 1, strokesFromPar: 0 });
      current.recordGameWithNpc('golf_captain');
    });
    const saved = JSON.parse(fixtures.saved.get(KEY)!);
    expect(saved.quests.find((quest: { targetType: string }) => quest.targetType === 'parkgolf').completed).toBe(true);
    expect(saved.completedTrialIds).toEqual(['chapter_1']);
    expect(saved.bonds.find((bond: { npcId: string }) => bond.npcId === 'golf_captain').points).toBeGreaterThan(0);
  });
});
