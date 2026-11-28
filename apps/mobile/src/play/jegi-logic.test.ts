import { describe, expect, it } from 'vitest';

import {
  JEGI, createJegi, inKickWindow, jegiCue, jegiSpeed, jegiWindow, judgeKick, kickJegi, moveFoot, msUntilHeight, msUntilKickWindow, stepJegi, unsettledJegiScore, whiffCooldown,
  type JegiCue, type JegiState,
} from './jegi-logic';
import { playJegiByRhythm } from './sim-players';

const NORMAL = { slow: false, assist: false };
const SLOW = { slow: true, assist: true };
const STEP_MS = 8;

function fallUntil(state: JegiState, done: (s: JegiState) => boolean): JegiState {
  let current = state;
  for (let i = 0; i < 5000 && !done(current) && current.phase === 'playing'; i += 1) current = stepJegi(current, STEP_MS);
  return current;
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
    expect(playJegiByRhythm(7, 150, 20)).toBe(playJegiByRhythm(7, 150, 20));
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
    expect(whiffed.count).toBe(0);
    expect(whiffed.cooldownMs).toBe(JEGI.whiffCooldownMs);
    const rested = stepJegi(stepJegi(whiffed, JEGI.whiffCooldownMs / 2), JEGI.whiffCooldownMs / 2 + 1);
    expect(rested.cooldownMs).toBe(0);
    expect(rested.phase).toBe('playing');
  });

  it('pressing again while resting restarts the rest, so mashing never connects', () => {
    const whiffed = kickJegi(stepJegi(kickJegi(createJegi(3, NORMAL)), 16));
    const impatient = kickJegi(stepJegi(whiffed, JEGI.whiffCooldownMs - 20));
    expect(impatient.cooldownMs).toBe(JEGI.whiffCooldownMs);
    expect(impatient.whiffSeq).toBe(whiffed.whiffSeq);
  });

  it('repeated whiffs in one flight rest longer each time, and a clean kick clears it', () => {
    expect(whiffCooldown(1)).toBe(JEGI.whiffCooldownMs * 2);
    expect(whiffCooldown(99)).toBe(whiffCooldown(4));
    let state = kickJegi(stepJegi(kickJegi(createJegi(3, NORMAL)), 16));
    state = kickJegi(stepJegi(state, JEGI.whiffCooldownMs + 1));
    expect(state.cooldownMs).toBe(JEGI.whiffCooldownMs * 2);
    const atFoot = fallUntil({ ...state, cooldownMs: 0 }, (s) => s.vh < 0 && s.h <= 2);
    expect(kickJegi(atFoot).flightWhiffs).toBe(0);
  });

  it('an early kick high above the foot still stays inside the yard', () => {
    const high = fallUntil(kickJegi(createJegi(3, SLOW)), (s) => s.vh < 0 && s.h <= jegiWindow(true).early - 1);
    const peak = fallUntil(kickJegi(high), (s) => s.vh <= 0);
    expect(peak.count).toBe(1);
    expect(peak.h).toBeLessThan(JEGI.top);
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

  it('slow mode opens the kick window earlier than normal mode', () => {
    expect(jegiWindow(true).early).toBeGreaterThan(jegiWindow(false).early);
    expect(judgeKick(jegiWindow(false).early + 5, 0, false)).toBeNull();
    expect(judgeKick(jegiWindow(false).early + 5, 0, true)).not.toBeNull();
  });
});

describe('jegi cues', () => {
  /** 한 번 떠서 떨어지는 동안 울린 신호와 그 시각, 판정 창이 열리고 닫힌 시각 */
  function flight(options: JegiState['options']) {
    let state = kickJegi(createJegi(9, options));
    const cues: { cue: JegiCue; at: number }[] = [];
    let opened = -1;
    let closed = -1;
    for (let clock = 0; state.phase === 'playing'; clock += 4) {
      const previous = state;
      state = stepJegi(state, 4);
      const cue = jegiCue(previous, state);
      if (cue) cues.push({ cue, at: clock });
      if (opened < 0 && inKickWindow(state)) opened = clock;
      if (opened >= 0 && closed < 0 && !inKickWindow(state)) closed = clock;
    }
    return { cues, opened, closed };
  }

  it('predicts when the jegi reaches a height', () => {
    const served = stepJegi(kickJegi(createJegi(9, SLOW)), 4);
    const predicted = msUntilHeight(served, 0);
    let state = served;
    let clock = 0;
    while (state.h > 0 || state.vh > 0) { state = stepJegi(state, 4); clock += 4; }
    expect(Math.abs(clock - predicted)).toBeLessThan(30);
    expect(msUntilKickWindow(state)).toBe(0);
  });

  it('sounds "soon" ahead of the window and "now" as it opens, once each', () => {
    const { cues, opened } = flight(SLOW);
    expect(cues.map((entry) => entry.cue)).toEqual(['soon', 'now']);
    expect(opened - cues[0].at).toBeGreaterThanOrEqual(JEGI.cueLeadMs - 20);
    expect(Math.abs(opened - cues[1].at)).toBeLessThanOrEqual(8);
  });

  it('leaves a slow-mode player at least 600ms after "now" and 950ms after "soon"', () => {
    const { cues, closed } = flight(SLOW);
    expect(closed - cues[1].at).toBeGreaterThanOrEqual(600);
    expect(closed - cues[0].at).toBeGreaterThanOrEqual(950);
  });
});

describe('jegi goal and leaving', () => {
  const atFoot = (state: JegiState) => fallUntil(state, (s) => s.vh < 0 && s.h <= 2);

  it('finishes the round as a master at the goal instead of going on forever', () => {
    const almost = atFoot({ ...kickJegi(createJegi(3, SLOW)), count: JEGI.goal - 1 });
    const done = kickJegi(almost);
    expect(done.count).toBe(JEGI.goal);
    expect(done.phase).toBe('over');
    expect(done.mastered).toBe(true);
    expect(stepJegi(done, 16)).toBe(done);
  });

  it('a dropped jegi is not a master finish', () => {
    expect(fallUntil(kickJegi(createJegi(3, NORMAL)), () => false).mastered).toBe(false);
  });

  it('settles the kicks so far when leaving mid-round, and nothing otherwise', () => {
    const ready = createJegi(3, NORMAL);
    const served = kickJegi(ready);
    const one = kickJegi(atFoot(served));
    expect(unsettledJegiScore(ready)).toBeNull();
    expect(unsettledJegiScore(served)).toBeNull();
    expect(unsettledJegiScore(one)).toBe(1);
    expect(unsettledJegiScore(fallUntil(one, () => false))).toBeNull();
  });
});
