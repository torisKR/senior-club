/**
 * 돌탑 쌓기 물리·판정. 순수 함수만 둡니다(난수는 상태의 seed로만).
 * 좌표는 배경 원화 픽셀(가로 180), x는 돌의 가운데입니다.
 */
import { nextRandom } from './rng';

export type StoneKind = 'a' | 'b' | 'c' | 'd' | 'e';
export type StonesPhase = 'aiming' | 'falling' | 'collapsing' | 'over';
export type StoneGrade = 'perfect' | 'good';
/** 느린 모드 신호: soon은 "준비", now는 "지금 놓으세요" */
export type StonesCue = 'soon' | 'now';

/** 돌 몸통 크기(원화 픽셀). 무게는 너비×높이에 비례합니다. */
export const STONE_SHAPES: Record<StoneKind, { name: string; width: number; height: number }> = {
  a: { name: '넓은 돌', width: 44, height: 16 },
  b: { name: '둥근 돌', width: 38, height: 15 },
  c: { name: '좁은 돌', width: 32, height: 12 },
  d: { name: '납작한 돌', width: 42, height: 13 },
  e: { name: '작은 돌', width: 26, height: 11 },
};
export const STONE_KINDS = Object.keys(STONE_SHAPES) as StoneKind[];

export interface PlacedStone {
  kind: StoneKind;
  x: number;
}

export interface StonesState {
  phase: StonesPhase;
  /** tower[0]은 처음부터 놓여 있는 받침돌(점수에 넣지 않음) */
  tower: PlacedStone[];
  current: StoneKind;
  next: StoneKind;
  /** 좌우로 오가는 위상과 바람 흔들림 위상(라디안) */
  swingRad: number;
  windRad: number;
  /** 느린 모드: 탑 바로 위에서 멈춰 기다리는 남은 시간 */
  dwellMs: number;
  dropX: number;
  /** 떨어지는 돌과 탑 꼭대기 사이에 남은 거리 */
  dropGap: number;
  /** 쌓은 층수(점수) */
  score: number;
  lastGrade: StoneGrade | null;
  landSeq: number;
  /** 기운 정도(-1~1 사이면 버팀, 부호는 방향) */
  lean: number;
  collapse: { from: number; dir: -1 | 1; ms: number } | null;
  /** 목표 층수를 다 쌓아 '명인'으로 마무리함 */
  mastered: boolean;
  seed: number;
  slow: boolean;
}

export const STONES = {
  width: 180,
  /** 이만큼 쌓으면 '명인'으로 판을 마무리합니다(끝없이 이어지지 않게). */
  goal: 30,
  /** 둥근 모서리는 받치지 못하므로 닿는 폭을 조금 줄입니다. */
  edge: 2,
  /** 위 돌이 아래 돌에 살짝 내려앉는 깊이 */
  sink: 2,
  hoverGap: 34,
  fallSpeed: 260,
  swingRange: 48,
  basePeriodMs: 4200,
  periodPerFloorMs: 100,
  minPeriodMs: 2600,
  slowFactor: 1.5,
  /** 아래 돌과 이만큼 안으로 맞으면 반듯하게 놓입니다(느린 모드는 더 넓게). */
  perfect: 4,
  slowPerfect: 8,
  /** 느린 모드: 돌이 탑 바로 위에서 이만큼 멈췄다 갑니다. */
  dwellMs: 900,
  /** "준비" 신호는 돌이 탑 위에 오기 이만큼 전에 울립니다. */
  cueLeadMs: 350,
  windEvery: 5,
  windPeriodMs: 1100,
  windBase: 4,
  windPerFloor: 0.25,
  windMax: 9,
  collapseMs: 900,
  maxFrameMs: 50,
} as const;

const TAU = Math.PI * 2;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const contactHalf = (kind: StoneKind) => (STONE_SHAPES[kind].width - STONES.edge) / 2;
const weight = (kind: StoneKind) => STONE_SHAPES[kind].width * STONE_SHAPES[kind].height;

function pickStone(seed: number): { kind: StoneKind; seed: number } {
  const roll = nextRandom(seed);
  return { kind: STONE_KINDS[Math.floor(roll.value * STONE_KINDS.length)], seed: roll.seed };
}

export function createStones(seed: number, options: { slow: boolean }): StonesState {
  const first = pickStone(seed >>> 0);
  const second = pickStone(first.seed);
  return {
    phase: 'aiming', tower: [{ kind: 'a', x: STONES.width / 2 }], current: first.kind, next: second.kind,
    swingRad: -Math.PI / 2, windRad: 0, dwellMs: 0, dropX: STONES.width / 2, dropGap: STONES.hoverGap,
    score: 0, lastGrade: null, landSeq: 0, lean: 0, collapse: null, mastered: false, seed: second.seed, slow: options.slow,
  };
}

/** 받침돌 바닥부터 탑 꼭대기까지의 높이 */
export function towerHeight(tower: readonly PlacedStone[]): number {
  return tower.reduce<number>((sum, stone) => sum + STONE_SHAPES[stone.kind].height - STONES.sink, STONES.sink);
}

/** 높이 쌓을수록 조금씩 빨라지되 상한이 있습니다. */
export function hoverPeriodMs(score: number, slow: boolean): number {
  const period = Math.max(STONES.minPeriodMs, STONES.basePeriodMs - Math.max(0, score) * STONES.periodPerFloorMs);
  return slow ? period * STONES.slowFactor : period;
}

/** 다섯 번째 돌마다 바람이 붑니다. 느린 모드에는 바람이 없습니다. */
export function isWindyFloor(score: number, slow: boolean): boolean {
  return !slow && (score + 1) % STONES.windEvery === 0;
}

function windAmplitude(score: number, slow: boolean): number {
  return isWindyFloor(score, slow) ? Math.min(STONES.windMax, STONES.windBase + score * STONES.windPerFloor) : 0;
}

const topX = (state: StonesState) => state.tower[state.tower.length - 1].x;

/** 지금 손에 든 돌의 가운데 x */
export function hoverX(state: StonesState): number {
  if (state.phase !== 'aiming') return state.dropX;
  if (state.dwellMs > 0) return topX(state);
  const half = STONE_SHAPES[state.current].width / 2;
  const x = STONES.width / 2 + STONES.swingRange * Math.sin(state.swingRad) + windAmplitude(state.score, state.slow) * Math.sin(state.windRad);
  return clamp(x, half, STONES.width - half);
}

/**
 * 균형: 각 층에서 그 위에 얹힌 돌 전부의 무게중심이 받치는 면 안에 있어야 합니다.
 * lean은 가장 위태로운 층의 (무게중심 - 받침 가운데) / 받침 반폭. |lean| >= 1이면 pivot 위가 무너집니다.
 */
export function towerLean(tower: readonly PlacedStone[]): { lean: number; pivot: number } {
  let worst = { lean: 0, pivot: 0 };
  let mass = 0;
  let moment = 0;
  for (let index = tower.length - 1; index >= 1; index -= 1) {
    const upper = tower[index];
    const lower = tower[index - 1];
    mass += weight(upper.kind);
    moment += weight(upper.kind) * upper.x;
    const left = Math.max(upper.x - contactHalf(upper.kind), lower.x - contactHalf(lower.kind));
    const right = Math.min(upper.x + contactHalf(upper.kind), lower.x + contactHalf(lower.kind));
    const centre = moment / mass;
    const half = (right - left) / 2;
    const lean = half <= 0 ? Math.sign(upper.x - lower.x) || 1 : (centre - (left + right) / 2) / half;
    if (Math.abs(lean) > Math.abs(worst.lean)) worst = { lean, pivot: index - 1 };
  }
  return worst;
}

/** 놓기: 지금 자리에서 돌이 곧게 떨어지기 시작합니다. */
export function dropStone(state: StonesState): StonesState {
  if (state.phase !== 'aiming') return state;
  return { ...state, phase: 'falling', dropX: hoverX(state), dropGap: STONES.hoverGap };
}

function land(state: StonesState): StonesState {
  const below = state.tower[state.tower.length - 1];
  const offset = state.dropX - below.x;
  const isPerfect = Math.abs(offset) <= (state.slow ? STONES.slowPerfect : STONES.perfect);
  const tower = [...state.tower, { kind: state.current, x: isPerfect ? below.x : state.dropX }];
  const balance = towerLean(tower);
  if (Math.abs(balance.lean) >= 1) {
    const dir = balance.lean > 0 ? 1 : -1;
    return { ...state, phase: 'collapsing', tower, dropGap: 0, lean: dir, lastGrade: null, collapse: { from: balance.pivot + 1, dir, ms: 0 } };
  }
  if (state.score + 1 >= STONES.goal) {
    return {
      ...state, phase: 'over', mastered: true, tower, dropGap: 0, score: state.score + 1,
      lastGrade: isPerfect ? 'perfect' : 'good', landSeq: state.landSeq + 1, lean: balance.lean,
    };
  }
  const upcoming = pickStone(state.seed);
  const side = nextRandom(upcoming.seed);
  return {
    ...state, phase: 'aiming', tower, current: state.next, next: upcoming.kind, seed: side.seed,
    swingRad: side.value < 0.5 ? -Math.PI / 2 : Math.PI / 2, windRad: 0, dwellMs: 0, dropGap: STONES.hoverGap,
    score: state.score + 1, lastGrade: isPerfect ? 'perfect' : 'good', landSeq: state.landSeq + 1, lean: balance.lean,
  };
}

/** 놀이 도중 화면을 떠날 때 정산해야 할 층수. 정산할 것이 없으면 null. */
export function unsettledStonesScore(state: StonesState): number | null {
  return state.phase !== 'over' && state.score > 0 ? state.score : null;
}

/** 돌이 탑 바로 위에 오기까지 남은 시간(ms). 바람은 셈에 넣지 않습니다. 멈춰 있는 동안은 0. */
export function msUntilOverTower(state: StonesState): number {
  if (state.phase !== 'aiming' || state.dwellMs > 0) return 0;
  const reach = clamp((topX(state) - STONES.width / 2) / STONES.swingRange, -1, 1);
  const first = Math.asin(reach);
  const turn = (target: number) => (((target - state.swingRad) % TAU) + TAU) % TAU;
  return (Math.min(turn(first), turn(Math.PI - first)) / TAU) * hoverPeriodMs(state.score, state.slow);
}

/** 한 프레임 사이에 울려야 할 신호: 탑 위에 오기 조금 전 "준비", 탑 위에 멈춘 순간 "지금". */
export function stonesCue(previous: StonesState, next: StonesState): StonesCue | null {
  if (next.phase !== 'aiming' || previous.phase !== 'aiming' || next.landSeq !== previous.landSeq) return null;
  if (previous.dwellMs === 0 && next.dwellMs > 0) return 'now';
  const before = msUntilOverTower(previous);
  return before > STONES.cueLeadMs && msUntilOverTower(next) <= STONES.cueLeadMs && next.dwellMs === 0 ? 'soon' : null;
}

/** 좌우로 오가기. 느린 모드에서는 탑 바로 위를 지날 때 잠시 멈춰 기다립니다. */
function swing(state: StonesState, frameMs: number): StonesState {
  if (state.dwellMs > 0) return { ...state, dwellMs: Math.max(0, state.dwellMs - frameMs) };
  const moved = {
    ...state,
    swingRad: state.swingRad + (TAU * frameMs) / hoverPeriodMs(state.score, state.slow),
    windRad: state.windRad + (TAU * frameMs) / STONES.windPeriodMs,
  };
  const top = topX(state);
  const crossed = (hoverX(state) - top) * (hoverX(moved) - top) <= 0 && hoverX(state) !== top;
  return state.slow && crossed ? { ...moved, dwellMs: STONES.dwellMs } : moved;
}

/** 한 프레임 진행: 좌우 오가기 → 떨어지기 → 내려앉기/무너지기. */
export function stepStones(state: StonesState, dtMs: number): StonesState {
  const frameMs = clamp(dtMs, 0, STONES.maxFrameMs);
  if (state.phase === 'aiming') return swing(state, frameMs);
  if (state.phase === 'falling') {
    const dropGap = state.dropGap - (STONES.fallSpeed * frameMs) / 1000;
    return dropGap > 0 ? { ...state, dropGap } : land({ ...state, dropGap: 0 });
  }
  if (state.phase === 'collapsing' && state.collapse) {
    const ms = state.collapse.ms + frameMs;
    return ms >= STONES.collapseMs ? { ...state, phase: 'over', collapse: { ...state.collapse, ms: STONES.collapseMs } } : { ...state, collapse: { ...state.collapse, ms } };
  }
  return state;
}
