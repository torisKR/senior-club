import { describe, expect, it } from 'vitest';

import { nextRandom } from './rng';
import {
  STONES, STONE_KINDS, STONE_SHAPES, createStones, dropStone, hoverPeriodMs, hoverX, isWindyFloor, stepStones, towerHeight, towerLean,
  type PlacedStone, type StonesState,
} from './stones-logic';

const STEP_MS = 8;
const CENTRE = STONES.width / 2;

function run(state: StonesState, done: (s: StonesState) => boolean, limit = 20000): StonesState {
  let current = state;
  for (let i = 0; i < limit && !done(current); i += 1) current = stepStones(current, STEP_MS);
  return current;
}

/** 돌을 원하는 자리(x)에서 놓고 내려앉을 때까지 진행합니다. */
function placeAt(state: StonesState, x: number): StonesState {
  const aimed = run(state, (s) => Math.abs(hoverX(s) - x) < 1.2);
  return run(dropStone(aimed), (s) => s.phase !== 'falling');
}

/** 박자 오차(ms)를 두고 탑 꼭대기 위에서 놓는 봇 */
function botRun(seed: number, timingErrMs: number, maxFloors = 30): number {
  let state = createStones(seed, { slow: false });
  let botSeed = seed ^ 0x51ed270b;
  while (state.phase !== 'over' && state.score < maxFloors) {
    const roll = nextRandom(botSeed);
    botSeed = roll.seed;
    const target = state.tower[state.tower.length - 1].x;
    const before = state;
    state = run(state, (s) => s.phase !== 'aiming' || Math.abs(hoverX(s) - target) < 1.2);
    const delayed = run(state, () => false, Math.round((roll.value * timingErrMs) / STEP_MS));
    state = run(dropStone(delayed), (s) => s.phase === 'aiming' || s.phase === 'over');
    if (state === before) break;
  }
  return state.score;
}

describe('stone tower basics', () => {
  it('starts with a base stone and a stone swinging slowly from side to side', () => {
    const state = createStones(1, { slow: false });
    expect(state.tower).toHaveLength(1);
    expect(state.score).toBe(0);
    const xs = Array.from({ length: 600 }, (_, i) => hoverX(run(state, () => false, i)));
    expect(Math.min(...xs)).toBeLessThan(CENTRE - 30);
    expect(Math.max(...xs)).toBeGreaterThan(CENTRE + 30);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(STONE_SHAPES[state.current].width / 2);
    expect(Math.max(...xs)).toBeLessThanOrEqual(STONES.width - STONE_SHAPES[state.current].width / 2);
  });

  it('has five stones of different widths', () => {
    expect(new Set(STONE_KINDS.map((kind) => STONE_SHAPES[kind].width)).size).toBe(5);
  });

  it('a dropped stone falls, lands on the tower and scores one floor', () => {
    const state = createStones(1, { slow: false });
    const falling = dropStone(run(state, (s) => Math.abs(hoverX(s) - CENTRE) < 1.2));
    expect(falling.phase).toBe('falling');
    expect(dropStone(falling)).toBe(falling);
    const landed = run(falling, (s) => s.phase !== 'falling');
    expect(landed.phase).toBe('aiming');
    expect(landed.score).toBe(1);
    expect(landed.tower).toHaveLength(2);
    expect(towerHeight(landed.tower)).toBeGreaterThan(towerHeight(state.tower));
  });

  it('snaps a nearly centred stone into place and calls it perfect', () => {
    const landed = placeAt(createStones(1, { slow: false }), CENTRE);
    expect(landed.lastGrade).toBe('perfect');
    expect(landed.tower[1].x).toBe(landed.tower[0].x);
    const off = placeAt(createStones(1, { slow: false }), CENTRE + 10);
    expect(off.lastGrade).toBe('good');
  });

  it('is deterministic for a seed', () => {
    expect(botRun(4, 60, 8)).toBe(botRun(4, 60, 8));
    const kinds = (seed: number) => { const s = createStones(seed, { slow: false }); return `${s.current}${s.next}${placeAt(s, CENTRE).next}`; };
    expect(new Set([1, 2, 3, 4, 5, 6].map(kinds)).size).toBeGreaterThan(1);
  });
});

describe('stone tower balance', () => {
  const stone = (kind: PlacedStone['kind'], x: number): PlacedStone => ({ kind, x });

  it('a straight tower does not lean', () => {
    expect(towerLean([stone('a', 90), stone('b', 90), stone('c', 90)]).lean).toBe(0);
  });

  it('leans toward the side the weight hangs over, more with more overhang', () => {
    const slight = towerLean([stone('a', 90), stone('b', 96)]).lean;
    const more = towerLean([stone('a', 90), stone('b', 104)]).lean;
    expect(slight).toBeGreaterThan(0);
    expect(more).toBeGreaterThan(slight);
    expect(towerLean([stone('a', 90), stone('b', 80)]).lean).toBeLessThan(0);
  });

  it('small offsets that each hold can still add up and tip a lower stone', () => {
    const stairs = [stone('a', 90), stone('c', 102), stone('c', 114), stone('c', 126), stone('c', 138)];
    const top = towerLean(stairs.slice(0, 2));
    expect(Math.abs(top.lean)).toBeLessThan(1);
    const whole = towerLean(stairs);
    expect(whole.lean).toBeGreaterThanOrEqual(1);
    expect(whole.pivot).toBeLessThan(stairs.length - 2);
  });

  it('a stone with more than half hanging off topples the tower and ends the round', () => {
    const state = createStones(1, { slow: false });
    const overhang = STONE_SHAPES.a.width / 2 + 4;
    const tipped = placeAt(state, CENTRE + overhang);
    expect(tipped.phase).toBe('collapsing');
    expect(tipped.score).toBe(0);
    expect(tipped.collapse?.dir).toBe(1);
    expect(dropStone(tipped)).toBe(tipped);
    const over = run(tipped, (s) => s.phase === 'over');
    expect(over.phase).toBe('over');
    expect(stepStones(over, 16)).toBe(over);
  });

  it('a stone that misses the tower entirely falls off', () => {
    const missed = placeAt(createStones(1, { slow: false }), CENTRE - 50);
    expect(missed.phase).toBe('collapsing');
    expect(missed.collapse).toEqual({ from: 1, dir: -1, ms: 0 });
  });
});

describe('stone tower pacing', () => {
  it('speeds up gently with height and stops at a cap', () => {
    expect(hoverPeriodMs(0, false)).toBeGreaterThan(hoverPeriodMs(8, false));
    expect(hoverPeriodMs(1000, false)).toBe(STONES.minPeriodMs);
    expect(hoverPeriodMs(0, true)).toBeGreaterThan(hoverPeriodMs(0, false));
  });

  it('wind blows on every fifth stone and never in slow mode', () => {
    expect([0, 1, 2, 3, 4, 5, 9, 14].map((score) => isWindyFloor(score, false))).toEqual([false, false, false, false, true, false, true, true]);
    expect(isWindyFloor(4, true)).toBe(false);
  });

  it('a careful player can reach three stars, sloppy timing topples early', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    expect(median(seeds.map((seed) => botRun(seed, 90)))).toBeGreaterThanOrEqual(10);
    expect(median(seeds.map((seed) => botRun(seed, 420)))).toBeLessThan(10);
  });
});
