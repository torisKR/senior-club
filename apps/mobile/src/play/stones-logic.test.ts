import { describe, expect, it } from 'vitest';

import { playStonesByRhythm } from './sim-players';
import {
  STONES, STONE_KINDS, STONE_SHAPES, createStones, dropStone, hoverPeriodMs, hoverX, isWindyFloor, msUntilOverTower, stepStones, stonesCue, towerHeight, towerLean,
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
    expect(playStonesByRhythm(4, 200)).toBe(playStonesByRhythm(4, 200));
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
    const missed = placeAt(createStones(1, { slow: false }), CENTRE - 46);
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

});

describe('stone tower slow mode', () => {
  const slow = () => createStones(3, { slow: true });

  it('predicts when the stone will be over the tower', () => {
    const state = createStones(3, { slow: false });
    const predicted = msUntilOverTower(state);
    const steps = Math.round(predicted / STEP_MS);
    expect(Math.abs(hoverX(run(state, () => false, steps)) - CENTRE)).toBeLessThan(1.5);
  });

  it('pauses over the tower so a drop during the pause lands perfectly', () => {
    const paused = run(slow(), (s) => s.dwellMs > 0);
    expect(hoverX(paused)).toBe(CENTRE);
    expect(hoverX(run(paused, () => false, 50))).toBe(CENTRE);
    const landed = run(dropStone(run(paused, () => false, 100)), (s) => s.phase !== 'falling');
    expect(landed.lastGrade).toBe('perfect');
    const moved = run(paused, (s) => s.dwellMs === 0);
    expect(hoverX(run(moved, () => false, 60))).not.toBe(CENTRE);
  });

  it('does not pause in normal mode', () => {
    const state = run(createStones(3, { slow: false }), () => false, 3000);
    expect(state.dwellMs).toBe(0);
  });

  it('sounds "soon" before the stone arrives and "now" when it stops, leaving 900ms to press', () => {
    let state = slow();
    const cues: { cue: string; at: number }[] = [];
    let left = -1;
    for (let clock = 0; clock < 20000 && left < 0; clock += STEP_MS) {
      const previous = state;
      state = stepStones(state, STEP_MS);
      const cue = stonesCue(previous, state);
      if (cue) cues.push({ cue, at: clock });
      if (previous.dwellMs > 0 && state.dwellMs === 0) left = clock;
    }
    expect(cues.map((entry) => entry.cue)).toEqual(['soon', 'now']);
    expect(cues[1].at - cues[0].at).toBeGreaterThanOrEqual(STONES.cueLeadMs - 20);
    expect(left - cues[1].at).toBeGreaterThanOrEqual(STONES.dwellMs - STEP_MS);
    expect(STONES.dwellMs).toBeGreaterThanOrEqual(900);
  });

  it('accepts a wider "perfect" in slow mode', () => {
    expect(STONES.slowPerfect).toBeGreaterThan(STONES.perfect);
  });
});
