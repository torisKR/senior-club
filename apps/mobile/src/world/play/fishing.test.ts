import { describe, expect, it } from 'vitest';

import { FISH, FISH_CATCH_WINDOW_MS } from '../life';
import {
  biteDelayMs,
  canFishAt,
  castLine,
  createFishing,
  type FishingState,
  reelProfile,
  reelSignal,
  setHook,
  shadowPositions,
  SLACK_LIMIT_MS,
  tickFishing,
} from './fishing';

const STEP_MS = 50;

/** 정해진 시간 동안 같은 입력(누름/뗌)으로 흘려보냅니다. */
function run(state: FishingState, ms: number, holding: boolean): FishingState {
  let next = state;
  for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) next = tickFishing(next, STEP_MS, holding);
  return next;
}

/** 버틸 때는 떼고, 평소에는 누르는 '잘하는' 낚시꾼. */
function playWell(state: FishingState, limitMs = 60_000): FishingState {
  let next = state;
  for (let elapsed = 0; elapsed < limitMs && next.phase === 'reel'; elapsed += STEP_MS) {
    next = tickFishing(next, STEP_MS, reelSignal(next) !== 'struggle' && reelSignal(next) !== 'tight');
  }
  return next;
}

function hooked(fishId: (typeof FISH)[number]['id']): FishingState {
  const waiting = castLine(createFishing(), { x: 0.5, y: 0.5 }, 0);
  const biting = run(waiting, 6000, false);
  expect(biting.phase).toBe('bite');
  return setHook(biting, fishId);
}

describe('던지기와 입질', () => {
  it('bites sooner when the bobber lands near a fish shadow', () => {
    const [shadow] = shadowPositions(0);
    const near = biteDelayMs({ x: shadow.x, y: shadow.y }, shadowPositions(0), 0.5);
    const far = biteDelayMs({ x: shadow.x > 0.5 ? 0 : 1, y: shadow.y > 0.5 ? 0 : 1 }, [shadow], 0.5);
    expect(near).toBeLessThan(far);
    expect(near).toBeGreaterThanOrEqual(500);
  });

  it('keeps every shadow inside the water while it swims', () => {
    for (let clock = 0; clock < 30_000; clock += 700) {
      for (const shadow of shadowPositions(clock)) {
        expect(shadow.x).toBeGreaterThanOrEqual(0.05);
        expect(shadow.x).toBeLessThanOrEqual(0.95);
        expect(shadow.y).toBeGreaterThanOrEqual(0.05);
        expect(shadow.y).toBeLessThanOrEqual(0.95);
      }
    }
  });

  it('only casts while aiming and clamps the spot to the water', () => {
    const waiting = castLine(createFishing(), { x: 4, y: -2 }, 0);
    expect(waiting.phase).toBe('wait');
    if (waiting.phase !== 'wait') return;
    expect(waiting.cast).toEqual({ x: 1, y: 0 });
    expect(castLine(waiting, { x: 0.2, y: 0.2 }, 0)).toBe(waiting);
  });

  it('ignores an early hook, then gives a generous window before the fish leaves', () => {
    const waiting = castLine(createFishing(), { x: 0.5, y: 0.5 }, 1);
    expect(setHook(waiting, 'minnow')).toBe(waiting);
    let biting = waiting;
    while (biting.phase === 'wait') biting = tickFishing(biting, STEP_MS, false);
    expect(biting.phase).toBe('bite');
    expect(run(biting, FISH_CATCH_WINDOW_MS - 500, false).phase).toBe('bite');
    const gone = run(biting, FISH_CATCH_WINDOW_MS + 500, false);
    expect(gone).toMatchObject({ phase: 'done', outcome: 'missed', fishId: null });
  });

  it('lands the fish straight away in the simple mode', () => {
    const biting = run(castLine(createFishing(), { x: 0.5, y: 0.5 }, 0), 6000, false);
    expect(setHook(biting, 'carp', true)).toMatchObject({ phase: 'done', outcome: 'landed', fishId: 'carp' });
  });
});

describe('릴 감기', () => {
  it('gives rarer fish a longer fight with more struggles', () => {
    const profiles = FISH.map((fish) => reelProfile(fish.id));
    expect(profiles[0].struggles).toHaveLength(0);
    for (let i = 1; i < profiles.length; i += 1) {
      expect(profiles[i].reelMs).toBeGreaterThan(profiles[i - 1].reelMs);
      expect(profiles[i].struggles.length).toBeGreaterThanOrEqual(profiles[i - 1].struggles.length);
    }
    expect(profiles.at(-1)!.struggles.length).toBeGreaterThan(profiles[1].struggles.length);
  });

  it('falls back to the easiest fight for a fish it does not know', () => {
    expect(reelProfile('unknown-fish' as never)).toEqual(reelProfile('minnow'));
  });

  it('lands the commonest fish by simply holding', () => {
    const done = run(hooked('minnow'), 10_000, true);
    expect(done).toMatchObject({ phase: 'done', outcome: 'landed', fishId: 'minnow' });
  });

  it('lands every fish when the player eases off during struggles', () => {
    for (const fish of FISH) {
      expect(playWell(hooked(fish.id)), fish.name).toMatchObject({ phase: 'done', outcome: 'landed', fishId: fish.id });
    }
  });

  it('snaps the line when the player keeps reeling through a struggle', () => {
    const done = run(hooked('golden'), 30_000, true);
    expect(done).toMatchObject({ phase: 'done', outcome: 'snapped', fishId: null });
  });

  it('leaves well over a second to react once a struggle begins', () => {
    let state = hooked('golden');
    while (state.phase === 'reel' && reelSignal(state) !== 'struggle') state = tickFishing(state, STEP_MS, true);
    expect(run(state, 1200, true).phase).toBe('reel');
  });

  it('does not reel in while the fish struggles', () => {
    let state = hooked('golden');
    while (state.phase === 'reel' && reelSignal(state) !== 'struggle') state = tickFishing(state, STEP_MS, true);
    const after = run(state, 500, true);
    expect(state.phase === 'reel' && after.phase === 'reel' && after.progress === state.progress).toBe(true);
  });

  it('loses the fish only after the line stays slack for a while', () => {
    const start = hooked('crucian');
    const slack = run(start, 2000, false);
    expect(slack.phase).toBe('reel');
    expect(reelSignal(slack)).toBe('slack');
    expect(run(slack, 800, true).phase).toBe('reel');
    expect(run(start, 2000 + SLACK_LIMIT_MS + 500, false)).toMatchObject({ phase: 'done', outcome: 'escaped', fishId: null });
  });

  it('never changes the state it was given', () => {
    const start = hooked('carp');
    const frozen = JSON.stringify(start);
    run(start, 3000, true);
    expect(JSON.stringify(start)).toBe(frozen);
  });
});

describe('물가 판정', () => {
  it('allows fishing from a dock or beside any water tile, whatever the map', () => {
    expect(canFishAt('dock', [])).toBe(true);
    expect(canFishAt('grass', ['grass', 'water'])).toBe(true);
    expect(canFishAt('bridge', ['path', 'water'])).toBe(true);
    expect(canFishAt('grass', ['grass', 'path'])).toBe(false);
  });
});
