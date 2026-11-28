import { describe, expect, it } from 'vitest';

import { JEGI, createJegi, inKickWindow, jegiSpeed, judgeKick, kickJegi, moveFoot, stepJegi, type JegiState } from './jegi-logic';
import { nextRandom } from './rng';

const NORMAL = { slow: false, assist: false };
const STEP_MS = 8;

function fallUntil(state: JegiState, done: (s: JegiState) => boolean): JegiState {
  let current = state;
  for (let i = 0; i < 5000 && !done(current) && current.phase === 'playing'; i += 1) current = stepJegi(current, STEP_MS);
  return current;
}

/** 사람처럼 치는 봇: 박자 오차(ms)와 위치 오차를 두고 제기 밑을 눌러 찹니다. */
function botRun(seed: number, timingErrMs: number, posErr: number, maxKicks = 40): number {
  let state = kickJegi(createJegi(seed, NORMAL));
  let botSeed = seed ^ 0x9e3779b9;
  let targetH = 0;
  let aimOffset = 0;
  let armed = false;
  for (let i = 0; i < 200000 && state.phase === 'playing' && state.count < maxKicks; i += 1) {
    state = stepJegi(state, STEP_MS);
    if (state.vh >= 0) { armed = false; continue; }
    if (!armed) {
      const a = nextRandom(botSeed);
      const b = nextRandom(a.seed);
      botSeed = b.seed;
      targetH = (a.value * 2 - 1) * (timingErrMs / 1000) * JEGI.kickSpeed.perfect * jegiSpeed(state.count, false);
      aimOffset = (b.value * 2 - 1) * posErr;
      armed = true;
    }
    if (state.h <= targetH) {
      // 화면을 누른 자리로 발이 옮겨 가며 찹니다.
      state = kickJegi(moveFoot(state, state.x + aimOffset));
    }
  }
  return state.count;
}

describe('jegi physics', () => {
  it('waits in ready until the first kick serves the jegi upward without scoring', () => {
    const ready = createJegi(1, NORMAL);
    expect(stepJegi(ready, 16)).toEqual(ready);
    const served = kickJegi(ready);
    expect(served.phase).toBe('playing');
    expect(served.vh).toBeGreaterThan(0);
    expect(served.count).toBe(0);
  });

  it('follows a parabola: rises, peaks below the top of the field, then falls', () => {
    const served = kickJegi(createJegi(1, NORMAL));
    const peak = fallUntil(served, (s) => s.vh <= 0);
    expect(peak.h).toBeGreaterThan(100);
    expect(peak.h).toBeLessThan(JEGI.top);
    const later = stepJegi(peak, 200);
    expect(later.h).toBeLessThan(peak.h);
  });

  it('ends the round when the jegi reaches the ground', () => {
    const dropped = fallUntil(kickJegi(createJegi(1, NORMAL)), () => false);
    expect(dropped.phase).toBe('over');
    expect(kickJegi(dropped)).toBe(dropped);
  });

  it('is deterministic for a seed and differs across seeds', () => {
    expect(botRun(7, 30, 4, 12)).toBe(botRun(7, 30, 4, 12));
    const kick = (seed: number) => kickJegi(fallUntil(kickJegi(createJegi(seed, NORMAL)), (s) => s.vh < 0 && s.h <= 5)).vx;
    expect(kick(1)).not.toBe(kick(2));
  });
});

describe('jegi judgement', () => {
  it('grades by how close the jegi is to the foot', () => {
    expect(judgeKick(0, 0)).toBe('perfect');
    expect(judgeKick(JEGI.window.perfect + 1, 0)).toBe('good');
    expect(judgeKick(JEGI.window.good + 1, 0)).toBe('close');
    expect(judgeKick(JEGI.window.early + 1, 0)).toBeNull();
    expect(judgeKick(-JEGI.window.late - 1, 0)).toBeNull();
  });

  it('needs the foot under the jegi, and an off-centre hit drops one grade', () => {
    expect(judgeKick(0, JEGI.reach + 1)).toBeNull();
    expect(judgeKick(0, JEGI.reach * 0.9)).toBe('good');
    expect(judgeKick(JEGI.window.good + 1, JEGI.reach * 0.9)).toBe('close');
  });

  it('counts a kick only while the jegi is falling inside the window', () => {
    const served = kickJegi(createJegi(3, NORMAL));
    const rising = kickJegi(stepJegi(served, 16));
    expect(rising.count).toBe(0);
    expect(rising.whiffSeq).toBe(1);
    const atFoot = fallUntil(served, (s) => s.vh < 0 && s.h <= 2);
    expect(inKickWindow(atFoot)).toBe(true);
    const kicked = kickJegi(atFoot);
    expect(kicked.count).toBe(1);
    expect(kicked.lastGrade).toBe('perfect');
    expect(kicked.vh).toBe(JEGI.kickSpeed.perfect);
  });

  it('a better kick sends the jegi higher', () => {
    expect(JEGI.kickSpeed.perfect).toBeGreaterThan(JEGI.kickSpeed.good);
    expect(JEGI.kickSpeed.good).toBeGreaterThan(JEGI.kickSpeed.close);
  });

  it('a whiff costs nothing but a short pause before the next swing', () => {
    const served = kickJegi(createJegi(3, NORMAL));
    const whiffed = kickJegi(stepJegi(served, 16));
    expect(kickJegi(whiffed)).toBe(whiffed);
    const rested = stepJegi(whiffed, JEGI.whiffCooldownMs + 1);
    expect(rested.cooldownMs).toBe(0);
    expect(rested.phase).toBe('playing');
  });

  it('keeps the foot inside the yard', () => {
    const state = createJegi(1, NORMAL);
    expect(moveFoot(state, -50).footX).toBe(JEGI.minX);
    expect(moveFoot(state, 999).footX).toBe(JEGI.maxX);
  });
});

describe('jegi pacing', () => {
  it('starts slow, speeds up gradually and stops at a cap', () => {
    expect(jegiSpeed(0, false)).toBe(1);
    expect(jegiSpeed(5, false)).toBeGreaterThan(1);
    expect(jegiSpeed(1000, false)).toBe(JEGI.maxSpeed);
    expect(jegiSpeed(0, true)).toBeLessThan(1);
    expect(jegiSpeed(1000, true)).toBeLessThan(JEGI.maxSpeed);
  });

  it('assist mode keeps the foot under the jegi', () => {
    let state = kickJegi(createJegi(5, { slow: true, assist: true }));
    state = { ...state, vx: 30 };
    state = stepJegi(stepJegi(state, 16), 16);
    expect(state.footX).toBeCloseTo(state.x, 5);
  });

  it('a careful player can reach three stars, sloppy timing drops it early', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    expect(median(seeds.map((seed) => botRun(seed, 60, 8)))).toBeGreaterThanOrEqual(15);
    expect(median(seeds.map((seed) => botRun(seed, 260, 8)))).toBeLessThan(15);
  });

  it('standing still and mashing does not keep the jegi up', () => {
    let state = kickJegi(createJegi(11, NORMAL));
    for (let i = 0; i < 20000 && state.phase === 'playing'; i += 1) {
      state = stepJegi(state, STEP_MS);
      if (i % 12 === 0) state = kickJegi(state);
    }
    expect(state.phase).toBe('over');
    expect(state.count).toBeLessThan(15);
  });
});
