/**
 * 제기차기 물리·판정. 순수 함수만 둡니다(난수는 상태의 seed로만).
 * 좌표는 배경 원화 픽셀(가로 180): x는 왼쪽부터, h는 발등에서 위로 잰 높이입니다.
 */
import { nextRandom } from './rng';

export type JegiGrade = 'perfect' | 'good' | 'close';
export type JegiPhase = 'ready' | 'playing' | 'over';

export interface JegiOptions {
  /** 느린 모드: 떨어지는 속도를 낮춥니다. */
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
  seed: number;
  options: JegiOptions;
}

export const JEGI = {
  width: 180,
  /** 발등에서 마당 위 끝까지의 높이 */
  top: 200,
  minX: 22,
  maxX: 158,
  /** 발등 아래 이만큼 내려가면 땅에 떨어진 것 */
  ground: -30,
  gravity: 300,
  kickSpeed: { perfect: 310, good: 285, close: 250 },
  /** 발등과의 높이 차 허용 폭. 일찍 차는 쪽(early)을 더 넉넉하게 둡니다. */
  window: { perfect: 14, good: 30, early: 55, late: 22 },
  /** 발과 제기의 좌우 허용 거리 */
  reach: 26,
  offCentre: 0.65,
  whiffCooldownMs: 350,
  speedPerKick: 0.02,
  maxSpeed: 1.4,
  slowFactor: 0.7,
  maxFrameMs: 50,
} as const;

const DRIFT = { base: 12, perKick: 0.8, max: 28, push: 0.8 } as const;
const DRIFT_BY_GRADE: Record<JegiGrade, number> = { perfect: 0.6, good: 1, close: 1.5 };
const WALL_BOUNCE = 0.6;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function createJegi(seed: number, options: JegiOptions): JegiState {
  const centre = JEGI.width / 2;
  return {
    phase: 'ready', x: centre, h: 0, vx: 0, vh: 0, footX: centre, count: 0, lastGrade: null,
    kickSeq: 0, whiffSeq: 0, cooldownMs: 0, seed: seed >>> 0, options,
  };
}

/** 천천히 시작해 찰 때마다 조금씩 빨라지고, 상한에서 멈춥니다. */
export function jegiSpeed(count: number, slow: boolean): number {
  const speed = Math.min(JEGI.maxSpeed, 1 + Math.max(0, count) * JEGI.speedPerKick);
  return slow ? speed * JEGI.slowFactor : speed;
}

/** 발등과의 높이 차(dh, 위가 +)와 좌우 거리(dx)로 판정합니다. 닿지 않으면 null. */
export function judgeKick(dh: number, dx: number): JegiGrade | null {
  const side = Math.abs(dx) / JEGI.reach;
  if (side > 1 || dh > JEGI.window.early || dh < -JEGI.window.late) return null;
  const distance = Math.abs(dh);
  const byHeight: JegiGrade = distance <= JEGI.window.perfect ? 'perfect' : distance <= JEGI.window.good ? 'good' : 'close';
  if (side <= JEGI.offCentre) return byHeight;
  return byHeight === 'perfect' ? 'good' : 'close';
}

/** 지금 누르면 맞는지. 느린 모드의 소리·진동 신호에 씁니다. */
export function inKickWindow(state: JegiState): boolean {
  return state.phase === 'playing' && state.vh < 0 && judgeKick(state.h, state.x - state.footX) !== null;
}

export function moveFoot(state: JegiState, x: number): JegiState {
  if (state.phase === 'over') return state;
  return { ...state, footX: clamp(x, JEGI.minX, JEGI.maxX) };
}

function launch(state: JegiState, grade: JegiGrade, scored: boolean): JegiState {
  const roll = nextRandom(state.seed);
  const drift = Math.min(DRIFT.max, DRIFT.base + state.count * DRIFT.perKick) * DRIFT_BY_GRADE[grade];
  return {
    ...state,
    phase: 'playing',
    h: Math.max(state.h, 0),
    vh: JEGI.kickSpeed[grade],
    vx: (roll.value * 2 - 1) * drift + (state.x - state.footX) * DRIFT.push,
    count: scored ? state.count + 1 : state.count,
    lastGrade: scored ? grade : null,
    kickSeq: scored ? state.kickSeq + 1 : state.kickSeq,
    seed: roll.seed,
  };
}

/** 발차기. 준비 중이면 제기를 띄우고, 놀이 중이면 판정해 차 올리거나 헛발이 됩니다. */
export function kickJegi(state: JegiState): JegiState {
  if (state.phase === 'over' || state.cooldownMs > 0) return state;
  // 첫 제기는 발이 있는 자리에서 곧게 띄웁니다.
  if (state.phase === 'ready') return launch({ ...state, x: state.footX }, 'perfect', false);
  const grade = state.vh < 0 ? judgeKick(state.h, state.x - state.footX) : null;
  if (!grade) return { ...state, whiffSeq: state.whiffSeq + 1, cooldownMs: JEGI.whiffCooldownMs };
  return launch(state, grade, true);
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
