/**
 * 난이도 검증용 가상 사용자. 테스트에서만 씁니다(앱 코드는 가져다 쓰지 않음).
 * 박자 오차·위치 오차·신호 반응 시간을 두고 사람처럼 누르게 해, 조정한 수치가 목표를 지키는지 확인합니다.
 */
import { createJegi, jegiCue, kickJegi, moveFoot, msUntilHeight, stepJegi, type JegiCue, type JegiState } from './jegi-logic';
import { MIN_REWARD_SCORE, playStars, type PlayGameId } from './play-rewards';
import { nextRandom } from './rng';
import { createStones, dropStone, msUntilOverTower, stepStones, stonesCue, type StonesCue, type StonesState } from './stones-logic';

const STEP_MS = 4;
const RETRY_MS = 400;
const MAX_STEPS = 400000;

/** -1~1 고른 난수를 차례로 내는 주사위 */
function dice(seed: number) {
  let current = seed >>> 0;
  return () => {
    const roll = nextRandom(current);
    current = roll.seed;
    return roll.value * 2 - 1;
  };
}

interface Tapper<S> {
  /** 새 제기·새 돌이 시작될 때 언제 누를지 정합니다(없으면 아직 모름). */
  plan: (state: S, previous: S, clock: number) => number | null;
}

function runJegi(seed: number, options: JegiState['options'], maxKicks: number, tapper: Tapper<JegiState>, aim: () => number): number {
  let state = kickJegi(createJegi(seed, options));
  let tapAt: number | null = null;
  let flight = -1;
  for (let step = 0; step < MAX_STEPS && state.phase === 'playing' && state.count < maxKicks; step += 1) {
    const clock = step * STEP_MS;
    const previous = state;
    state = stepJegi(state, STEP_MS);
    if (flight !== state.kickSeq) {
      flight = state.kickSeq;
      tapAt = null;
    }
    tapAt = tapAt ?? tapper.plan(state, previous, clock);
    if (tapAt !== null && clock >= tapAt) {
      const whiffs = state.whiffSeq;
      state = kickJegi(moveFoot(state, state.x + aim()));
      // 헛발이면 사람은 잠깐 뒤 한 번 더 눌러 봅니다.
      tapAt = state.whiffSeq !== whiffs ? clock + RETRY_MS : Number.POSITIVE_INFINITY;
    }
  }
  return state.count;
}

/** 보통 모드: 제기가 발등에 닿을 때를 노려 누르되 박자·위치가 고르게 ±오차만큼 어긋납니다. */
export function playJegiByRhythm(seed: number, timingErrMs: number, posErr: number, maxKicks = 60): number {
  const roll = dice(seed ^ 0x9e3779b9);
  return runJegi(seed, { slow: false, assist: false }, maxKicks, {
    plan: (state, _previous, clock) => (state.vh < 0 ? clock + msUntilHeight(state, 0) + roll() * timingErrMs : null),
  }, () => roll() * posErr);
}

/** 느린 모드: 신호를 듣고 반응 시간 뒤에 누릅니다. */
export function playJegiByCue(seed: number, cue: JegiCue, reactionMs: number, jitterMs: number, maxKicks = 30): number {
  const roll = dice(seed ^ 0x51ed270b);
  return runJegi(seed, { slow: true, assist: true }, maxKicks, {
    plan: (state, previous, clock) => (jegiCue(previous, state) === cue ? clock + reactionMs + roll() * jitterMs : null),
  }, () => 0);
}

/** 생각 없이 일정 간격으로 버튼만 연타합니다. */
export function playJegiByMashing(seed: number, intervalMs: number, slow: boolean, maxKicks = 30): number {
  let state = kickJegi(createJegi(seed, { slow, assist: slow }));
  for (let step = 0; step < MAX_STEPS && state.phase === 'playing' && state.count < maxKicks; step += 1) {
    state = stepJegi(state, STEP_MS);
    if ((step * STEP_MS) % intervalMs < STEP_MS) state = kickJegi(state);
  }
  return state.count;
}

function runStones(seed: number, slow: boolean, maxFloors: number, tapper: Tapper<StonesState>): number {
  let state = createStones(seed, { slow });
  let tapAt: number | null = null;
  let stone = -1;
  for (let step = 0; step < MAX_STEPS && state.phase !== 'over' && state.score < maxFloors; step += 1) {
    const clock = step * STEP_MS;
    const previous = state;
    state = stepStones(state, STEP_MS);
    if (state.phase !== 'aiming') continue;
    if (stone !== state.landSeq) {
      stone = state.landSeq;
      tapAt = null;
    }
    tapAt = tapAt ?? tapper.plan(state, previous, clock);
    if (tapAt !== null && clock >= tapAt) state = dropStone(state);
  }
  return state.score;
}

/** 보통 모드: 돌이 탑 위에 올 때를 노려 누르되 박자가 고르게 ±오차만큼 어긋납니다. */
export function playStonesByRhythm(seed: number, timingErrMs: number, maxFloors = 40): number {
  const roll = dice(seed ^ 0x2545f491);
  return runStones(seed, false, maxFloors, {
    plan: (state, _previous, clock) => clock + msUntilOverTower(state) + roll() * timingErrMs,
  });
}

/** 느린 모드: 신호를 듣고 반응 시간 뒤에 놓습니다. */
export function playStonesByCue(seed: number, cue: StonesCue, reactionMs: number, jitterMs: number, maxFloors = 20): number {
  const roll = dice(seed ^ 0x7f4a7c15);
  return runStones(seed, true, maxFloors, {
    plan: (state, previous, clock) => (stonesCue(previous, state) === cue ? clock + reactionMs + roll() * jitterMs : null),
  });
}

export interface SimSummary {
  median: number;
  /** 보상 기준 점수에 못 미친 판의 비율 */
  noReward: number;
  /** 별 1·2·3개를 받은 판의 비율 */
  stars: [number, number, number];
}

export function summarize(game: PlayGameId, scores: readonly number[]): SimSummary {
  const sorted = [...scores].sort((a, b) => a - b);
  const share = (hit: (score: number) => boolean) => scores.filter(hit).length / scores.length;
  return {
    median: sorted[Math.floor(sorted.length / 2)],
    noReward: share((score) => score < MIN_REWARD_SCORE),
    stars: [1, 2, 3].map((stars) => share((score) => playStars(game, score) === stars)) as [number, number, number],
  };
}

export const SIM_SEEDS = Array.from({ length: 300 }, (_, index) => index * 7919 + 13);
