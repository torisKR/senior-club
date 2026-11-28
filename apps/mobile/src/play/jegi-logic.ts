/**
 * 제기차기 물리·판정. 순수 함수만 둡니다(난수는 상태의 seed로만).
 * 좌표는 배경 원화 픽셀(가로 180): x는 왼쪽부터, h는 발등에서 위로 잰 높이입니다.
 */
import { nextRandom } from './rng';

export type JegiGrade = 'perfect' | 'good' | 'close';
export type JegiPhase = 'ready' | 'playing' | 'over';
/** 느린 모드 신호: soon은 "준비", now는 "지금 차세요" */
export type JegiCue = 'soon' | 'now';

export interface JegiOptions {
  /** 느린 모드: 떨어지는 속도를 낮추고 판정 폭을 넓힙니다. */
  slow: boolean;
  /** 발이 제기 밑을 저절로 따라가 박자만 맞추면 됩니다. */
  assist: boolean;
}

export interface JegiState {
  phase: JegiPhase;
  x: number;
  h: number;
  vx: number;
  vh: number;
  footX: number;
  /** 연속으로 찬 횟수(점수) */
  count: number;
  lastGrade: JegiGrade | null;
  /** 맞힌 횟수·헛발 횟수. 화면이 새 발차기를 알아채는 데 씁니다. */
  kickSeq: number;
  whiffSeq: number;
  /** 헛발 뒤 다시 찰 수 있을 때까지 남은 시간 */
  cooldownMs: number;
  /** 이번에 떠 있는 동안 헛발한 횟수. 거듭할수록 쉬는 시간이 길어집니다. */
  flightWhiffs: number;
  /** 목표 횟수를 다 채워 '명인'으로 마무리함 */
  mastered: boolean;
  seed: number;
  options: JegiOptions;
}

/** 발등과의 높이 차 허용 폭. 일찍 차는 쪽(early)을 더 넉넉하게 둡니다. */
export interface JegiWindow {
  perfect: number;
  good: number;
  early: number;
  late: number;
}

export const JEGI = {
  width: 180,
  /** 이만큼 차면 '명인'으로 판을 마무리합니다(끝없이 이어지지 않게). */
  goal: 50,
  /** 발등에서 마당 위 끝까지의 높이 */
  top: 200,
  minX: 22,
  maxX: 158,
  /** 발등 아래 이만큼 내려가면 땅에 떨어진 것 */
  ground: -38,
  gravity: 170,
  kickSpeed: { perfect: 232, good: 220, close: 205 },
  window: { perfect: 16, good: 34, early: 60, late: 34 },
  /** 느린 모드는 신호를 듣고 눌러도 맞도록 일찍부터 열립니다. */
  slowWindow: { perfect: 24, good: 50, early: 110, late: 34 },
  /** 발과 제기의 좌우 허용 거리 */
  reach: 32,
  offCentre: 0.7,
  whiffCooldownMs: 350,
  speedPerKick: 0.015,
  maxSpeed: 1.3,
  slowFactor: 0.62,
  /** 느린 모드는 빨라지는 폭도 작습니다. */
  slowMaxSpeed: 1.1,
  /** "준비" 신호는 판정 창이 열리기 이만큼 전에 울립니다. */
  cueLeadMs: 350,
  maxFrameMs: 50,
} as const;

const DRIFT = { base: 10, perKick: 0.6, max: 24, push: 0.6 } as const;
const DRIFT_BY_GRADE: Record<JegiGrade, number> = { perfect: 0.6, good: 1, close: 1.4 };
const WALL_BOUNCE = 0.6;
const APEX_MARGIN = 14;
const MAX_COOLDOWN_DOUBLINGS = 4;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function createJegi(seed: number, options: JegiOptions): JegiState {
  const centre = JEGI.width / 2;
  return {
    phase: 'ready', x: centre, h: 0, vx: 0, vh: 0, footX: centre, count: 0, lastGrade: null,
    kickSeq: 0, whiffSeq: 0, cooldownMs: 0, flightWhiffs: 0, mastered: false, seed: seed >>> 0, options,
  };
}

/** 천천히 시작해 찰 때마다 조금씩 빨라지고, 상한에서 멈춥니다. */
export function jegiSpeed(count: number, slow: boolean): number {
  const speed = Math.min(slow ? JEGI.slowMaxSpeed : JEGI.maxSpeed, 1 + Math.max(0, count) * JEGI.speedPerKick);
  return slow ? speed * JEGI.slowFactor : speed;
}

export function jegiWindow(slow: boolean): JegiWindow {
  return slow ? JEGI.slowWindow : JEGI.window;
}

/** 발등과의 높이 차(dh, 위가 +)와 좌우 거리(dx)로 판정합니다. 닿지 않으면 null. */
export function judgeKick(dh: number, dx: number, slow = false): JegiGrade | null {
  const window = jegiWindow(slow);
  const side = Math.abs(dx) / JEGI.reach;
  if (side > 1 || dh > window.early || dh < -window.late) return null;
  const distance = Math.abs(dh);
  const byHeight: JegiGrade = distance <= window.perfect ? 'perfect' : distance <= window.good ? 'good' : 'close';
  if (side <= JEGI.offCentre) return byHeight;
  return byHeight === 'perfect' ? 'good' : 'close';
}

/** 지금 누르면 맞는지 */
export function inKickWindow(state: JegiState): boolean {
  return state.phase === 'playing' && state.vh < 0 && judgeKick(state.h, state.x - state.footX, state.options.slow) !== null;
}

/** 제기가 높이 target까지 내려오는 데 걸리는 실제 시간(ms). 이미 지났으면 0. */
export function msUntilHeight(state: JegiState, target: number): number {
  if (state.phase !== 'playing' || (state.h <= target && state.vh <= 0)) return 0;
  const seconds = (state.vh + Math.sqrt(state.vh * state.vh + 2 * JEGI.gravity * Math.max(0, state.h - target))) / JEGI.gravity;
  return (seconds * 1000) / jegiSpeed(state.count, state.options.slow);
}

/** 판정 창이 열리기까지 남은 시간(ms) */
export function msUntilKickWindow(state: JegiState): number {
  return msUntilHeight(state, jegiWindow(state.options.slow).early);
}

/** 한 프레임 사이에 울려야 할 신호: 창이 열리기 조금 전 "준비", 열리는 순간 "지금". */
export function jegiCue(previous: JegiState, next: JegiState): JegiCue | null {
  if (next.phase !== 'playing' || next.kickSeq !== previous.kickSeq || previous.phase !== 'playing') return null;
  const before = msUntilKickWindow(previous);
  const after = msUntilKickWindow(next);
  if (before > 0 && after === 0) return 'now';
  return before > JEGI.cueLeadMs && after <= JEGI.cueLeadMs ? 'soon' : null;
}

export function moveFoot(state: JegiState, x: number): JegiState {
  if (state.phase === 'over') return state;
  return { ...state, footX: clamp(x, JEGI.minX, JEGI.maxX) };
}

function launch(state: JegiState, grade: JegiGrade, scored: boolean): JegiState {
  const roll = nextRandom(state.seed);
  const h = Math.max(state.h, 0);
  const drift = Math.min(DRIFT.max, DRIFT.base + state.count * DRIFT.perKick) * DRIFT_BY_GRADE[grade];
  const count = scored ? state.count + 1 : state.count;
  const mastered = count >= JEGI.goal;
  return {
    ...state,
    phase: mastered ? 'over' : 'playing',
    mastered,
    h,
    // 높은 데서 일찍 맞혀도 마당 위로 넘치지 않을 만큼만 뜹니다.
    vh: Math.min(JEGI.kickSpeed[grade], Math.sqrt(2 * JEGI.gravity * (JEGI.top - APEX_MARGIN - h))),
    vx: (roll.value * 2 - 1) * drift + (state.x - state.footX) * DRIFT.push,
    count,
    lastGrade: scored ? grade : null,
    kickSeq: scored ? state.kickSeq + 1 : state.kickSeq,
    cooldownMs: 0,
    flightWhiffs: 0,
    seed: roll.seed,
  };
}

/** n번째(0부터) 헛발 뒤 쉬는 시간 */
export function whiffCooldown(whiffs: number): number {
  return JEGI.whiffCooldownMs * 2 ** Math.min(MAX_COOLDOWN_DOUBLINGS, Math.max(0, whiffs));
}

/**
 * 발차기. 준비 중이면 제기를 띄우고, 놀이 중이면 판정해 차 올리거나 헛발이 됩니다.
 * 헛발 뒤 쉬는 동안 또 누르면 쉬는 시간이 처음부터 다시 시작하고, 떠 있는 동안 헛발을 거듭하면
 * 쉬는 시간이 두 배씩 늘어, 마구 누르거나 일정 간격으로 눌러서는 맞힐 수 없습니다.
 */
export function kickJegi(state: JegiState): JegiState {
  if (state.phase === 'over') return state;
  if (state.cooldownMs > 0) return { ...state, cooldownMs: whiffCooldown(state.flightWhiffs - 1) };
  // 첫 제기는 발이 있는 자리에서 곧게 띄웁니다.
  if (state.phase === 'ready') return launch({ ...state, x: state.footX }, 'perfect', false);
  const grade = state.vh < 0 ? judgeKick(state.h, state.x - state.footX, state.options.slow) : null;
  if (!grade) return { ...state, whiffSeq: state.whiffSeq + 1, flightWhiffs: state.flightWhiffs + 1, cooldownMs: whiffCooldown(state.flightWhiffs) };
  return launch(state, grade, true);
}

/** 놀이 도중 화면을 떠날 때 정산해야 할 횟수. 정산할 것이 없으면 null. */
export function unsettledJegiScore(state: JegiState): number | null {
  return state.phase === 'playing' && state.count > 0 ? state.count : null;
}

/** 한 프레임 진행: 중력, 좌우 벽, 땅에 닿으면 끝. */
export function stepJegi(state: JegiState, dtMs: number): JegiState {
  if (state.phase !== 'playing') return state;
  const frameMs = clamp(dtMs, 0, JEGI.maxFrameMs);
  const cooldownMs = Math.max(0, state.cooldownMs - dtMs);
  const dt = (frameMs / 1000) * jegiSpeed(state.count, state.options.slow);
  const vh = state.vh - JEGI.gravity * dt;
  const h = state.h + vh * dt;
  const rawX = state.x + state.vx * dt;
  const hitWall = rawX < JEGI.minX || rawX > JEGI.maxX;
  const x = clamp(rawX, JEGI.minX, JEGI.maxX);
  const vx = hitWall ? -state.vx * WALL_BOUNCE : state.vx;
  const footX = state.options.assist ? x : state.footX;
  if (h <= JEGI.ground) return { ...state, phase: 'over', x, h: JEGI.ground, vx: 0, vh: 0, footX, cooldownMs: 0 };
  return { ...state, x, h, vx, vh, footX, cooldownMs };
}
