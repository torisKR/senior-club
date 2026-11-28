import { PARK_GOLF_BOUNDS, type ParkGolfHoleSpec, type ParkGolfShotResult } from './arcade-logic';

/**
 * 파크골프 구르기 물리 (순수 함수). 좌표는 보드 % (0~100), 속도는 %/초입니다.
 * 화면은 `stepParkGolfBall`을 고정 간격으로 돌리고, 동작 줄이기·미리보기는
 * 같은 스텝을 한 번에 돌리는 `rollParkGolfShot`을 써서 결과가 항상 같습니다.
 */
export type Point = { x: number; y: number };
/** angleDeg: 0 = 화면 위쪽, 오른쪽이 +. power: 0~1. */
export interface ParkGolfShot { angleDeg: number; power: number }
export interface ParkGolfBall extends Point { vx: number; vy: number; moving: boolean; holed: boolean; lipped: boolean }
export interface ParkGolfStepEvents { bouncedWall: boolean; bouncedBumper: boolean; inBunker: boolean; lippedOut: boolean; holed: boolean }
export interface ParkGolfRoll extends ParkGolfShotResult { lippedOut: boolean }

export const PARK_GOLF_STEP_SECONDS = 1 / 60;
export const PARK_GOLF_BUTTON_ANGLES = [-15, -5, 0, 5, 15] as const;
/** 끌기 길이(보드 %) — 이보다 짧으면 취소, 이 이상은 최대 힘. */
export const PARK_GOLF_MIN_DRAG = 5;
export const PARK_GOLF_MAX_DRAG = 38;
/** 파보다 이만큼 더 치면 그 홀은 처음부터 다시 시작합니다(끝나지 않는 홀 방지). */
export const PARK_GOLF_MAX_OVER_PAR = 7;
export const isParkGolfStrokeLimit = (strokes: number, par: number) => strokes >= par + PARK_GOLF_MAX_OVER_PAR;

const MAX_SPEED = 95;
const GRASS_DECEL = 40;
const BUNKER_DECEL = 170;
const SLOPE_ACCEL = 2.2;
const WALL_RESTITUTION = 0.72;
const BUMPER_RESTITUTION = 0.8;
/** 컵에 들어서는 순간 이 속도 이하여야 떨어집니다. */
const CUP_CAPTURE_SPEED = 32;
const LIP_SLOWDOWN = 0.8;
const LIP_DEFLECT_RAD = (25 * Math.PI) / 180;
const MAX_STEPS = 600;
const BUTTON_POWER = { 1: 0.4, 2: 0.65, 3: 0.88 } as const;
const PREVIEW_STEPS = 24;
const PREVIEW_EVERY = 4;

const rest = (ball: ParkGolfBall, patch: Partial<ParkGolfBall> = {}): ParkGolfBall =>
  ({ ...ball, vx: 0, vy: 0, moving: false, ...patch });
const inCupArea = (hole: ParkGolfHoleSpec, p: Point) => Math.hypot(p.x - hole.cup.x, p.y - hole.cup.y) <= hole.cup.radius;
const inBunkerArea = (hole: ParkGolfHoleSpec, p: Point) =>
  ((p.x - hole.bunker.x) / hole.bunker.rx) ** 2 + ((p.y - hole.bunker.y) / hole.bunker.ry) ** 2 <= 1;

export function shotFromDrag(drag: Point): ParkGolfShot | null {
  const length = Math.hypot(drag.x, drag.y);
  if (length < PARK_GOLF_MIN_DRAG) return null;
  // 당긴 반대 방향으로 칩니다.
  const angleDeg = (Math.atan2(-drag.x, drag.y) * 180) / Math.PI;
  return { angleDeg: Object.is(angleDeg, -0) ? 0 : angleDeg, power: Math.min(1, length / PARK_GOLF_MAX_DRAG) };
}

/**
 * 버튼 모드: '정면'은 홀컵 방향입니다. 어디서든 버튼만으로 홀컵을 노릴 수 있습니다.
 * 1단은 가까운 거리에서 홀컵 중심까지만 굴러갈 힘으로 줄여 '톡 치기'가 됩니다(멀면 1단 그대로).
 */
export function buttonShot(hole: ParkGolfHoleSpec, from: Point, aimOffsetDeg: number, powerStep: 1 | 2 | 3): ParkGolfShot {
  const toCup = (Math.atan2(hole.cup.x - from.x, from.y - hole.cup.y) * 180) / Math.PI;
  const distance = Math.hypot(hole.cup.x - from.x, hole.cup.y - from.y);
  const tapIn = Math.sqrt(2 * GRASS_DECEL * distance) / MAX_SPEED;
  const power = powerStep === 1 ? Math.min(BUTTON_POWER[1], tapIn) : BUTTON_POWER[powerStep];
  return { angleDeg: toCup + aimOffsetDeg, power };
}

export function launchParkGolfBall(hole: ParkGolfHoleSpec, from: Point, shot: ParkGolfShot): ParkGolfBall {
  const still = { x: from.x, y: from.y, vx: 0, vy: 0, moving: false, holed: false, lipped: false };
  if (inCupArea(hole, from)) return { ...still, x: hole.cup.x, y: hole.cup.y, holed: true };
  const rad = ((shot.angleDeg - 90) * Math.PI) / 180;
  const speed = Math.max(0, Math.min(1, shot.power)) * MAX_SPEED;
  return { ...still, vx: Math.cos(rad) * speed, vy: Math.sin(rad) * speed, moving: speed > 0 };
}

function bumperHit(start: Point, end: Point, bumper: NonNullable<ParkGolfHoleSpec['bumper']>) {
  const d = { x: end.x - start.x, y: end.y - start.y };
  const b = { x: bumper.x2 - bumper.x1, y: bumper.y2 - bumper.y1 };
  const cross = d.x * b.y - d.y * b.x;
  const length = Math.hypot(b.x, b.y);
  if (Math.abs(cross) < 1e-9 || length === 0) return null;
  const a = { x: bumper.x1 - start.x, y: bumper.y1 - start.y };
  const t = (a.x * b.y - a.y * b.x) / cross;
  const u = (a.x * d.y - a.y * d.x) / cross;
  if (t <= 1e-9 || t > 1 || u < 0 || u > 1) return null;
  return { point: { x: start.x + d.x * t, y: start.y + d.y * t }, normal: { x: -b.y / length, y: b.x / length } };
}

function bounce(hole: ParkGolfHoleSpec, from: Point, ball: ParkGolfBall) {
  let { x, y, vx, vy } = ball;
  let bouncedBumper = false;
  let bouncedWall = false;
  const hit = hole.bumper && bumperHit(from, { x, y }, hole.bumper);
  if (hit) {
    const along = vx * hit.normal.x + vy * hit.normal.y;
    vx = (vx - 2 * along * hit.normal.x) * BUMPER_RESTITUTION;
    vy = (vy - 2 * along * hit.normal.y) * BUMPER_RESTITUTION;
    // 맞은 자리에서 튕겨 나간 쪽으로 살짝 띄워 같은 범퍼에 다시 걸리지 않게 합니다.
    x = hit.point.x + vx * PARK_GOLF_STEP_SECONDS * 0.5;
    y = hit.point.y + vy * PARK_GOLF_STEP_SECONDS * 0.5;
    bouncedBumper = true;
  }
  const { left, right, top, bottom } = PARK_GOLF_BOUNDS;
  if (x < left || x > right) {
    x = x < left ? left + (left - x) : right - (x - right);
    vx = -vx * WALL_RESTITUTION;
    bouncedWall = true;
  }
  if (y < top || y > bottom) {
    y = y < top ? top + (top - y) : bottom - (y - bottom);
    vy = -vy * WALL_RESTITUTION;
    bouncedWall = true;
  }
  const clampedX = Math.min(right, Math.max(left, x));
  const clampedY = Math.min(bottom, Math.max(top, y));
  return { ball: { ...ball, x: clampedX, y: clampedY, vx, vy }, bouncedBumper, bouncedWall };
}

/** 너무 빠르게 컵에 들어오면 테두리를 맞고 느려지며 중심 바깥쪽으로 꺾입니다. */
function lipOut(hole: ParkGolfHoleSpec, ball: ParkGolfBall): ParkGolfBall {
  const speed = Math.hypot(ball.vx, ball.vy);
  const offset = ((hole.cup.x - ball.x) * ball.vy - (hole.cup.y - ball.y) * ball.vx) / (speed * hole.cup.radius);
  const turn = LIP_DEFLECT_RAD * Math.max(-1, Math.min(1, offset));
  const cos = Math.cos(turn) * LIP_SLOWDOWN;
  const sin = Math.sin(turn) * LIP_SLOWDOWN;
  return { ...ball, vx: ball.vx * cos - ball.vy * sin, vy: ball.vx * sin + ball.vy * cos, lipped: true };
}

/** 공을 한 프레임(PARK_GOLF_STEP_SECONDS) 굴립니다. */
export function stepParkGolfBall(hole: ParkGolfHoleSpec, ball: ParkGolfBall): { ball: ParkGolfBall; events: ParkGolfStepEvents } {
  const events = { bouncedWall: false, bouncedBumper: false, inBunker: false, lippedOut: false, holed: false };
  if (!ball.moving) return { ball, events };
  const dt = PARK_GOLF_STEP_SECONDS;
  const inBunker = inBunkerArea(hole, ball);
  const vx = ball.vx + hole.slope.dx * SLOPE_ACCEL * dt;
  const vy = ball.vy + hole.slope.dy * SLOPE_ACCEL * dt;
  const speed = Math.hypot(vx, vy);
  const slowed = speed - (inBunker ? BUNKER_DECEL : GRASS_DECEL) * dt;
  if (slowed <= 0) {
    // 테두리를 맞고 튕긴 공이 컵 위에 멈추면 '걸친 공'입니다. 다음 타에 톡 치면 들어갑니다.
    const holed = !ball.lipped && inCupArea(hole, ball);
    return { ball: rest(ball, holed ? { x: hole.cup.x, y: hole.cup.y, holed } : {}), events: { ...events, inBunker, holed } };
  }
  const scale = slowed / speed;
  const moved = { ...ball, x: ball.x + vx * scale * dt, y: ball.y + vy * scale * dt, vx: vx * scale, vy: vy * scale };
  const bounced = bounce(hole, ball, moved);
  const next = bounced.ball;
  const stepEvents = { ...events, inBunker, bouncedWall: bounced.bouncedWall, bouncedBumper: bounced.bouncedBumper };
  // 한 번 테두리를 맞고 튕긴 공은 이번 샷에서 다시 떨어지지 않습니다(뒷벽 맞고 들어가는 요행 방지).
  if (next.lipped || !inCupArea(hole, next)) return { ball: next, events: stepEvents };
  if (Math.hypot(next.vx, next.vy) <= CUP_CAPTURE_SPEED) {
    return { ball: rest(next, { x: hole.cup.x, y: hole.cup.y, holed: true }), events: { ...stepEvents, holed: true } };
  }
  return { ball: lipOut(hole, next), events: { ...stepEvents, lippedOut: true } };
}

const round1 = (p: Point): Point => ({ x: Number(p.x.toFixed(1)), y: Number(p.y.toFixed(1)) });

/** 공이 멈출 때까지 한 번에 굴린 결과. path에는 프레임마다의 위치가 들어 있습니다. */
export function rollParkGolfShot(hole: ParkGolfHoleSpec, from: Point, shot: ParkGolfShot): ParkGolfRoll {
  let ball = launchParkGolfBall(hole, from, shot);
  const path: Point[] = [round1(from)];
  const flags = { hitBunker: false, bouncedWall: false, bouncedBumper: false, lippedOut: false };
  for (let i = 0; i < MAX_STEPS && ball.moving; i += 1) {
    const step = stepParkGolfBall(hole, ball);
    ball = step.ball;
    flags.hitBunker ||= step.events.inBunker;
    flags.bouncedWall ||= step.events.bouncedWall;
    flags.bouncedBumper ||= step.events.bouncedBumper;
    flags.lippedOut ||= step.events.lippedOut;
    path.push(round1(ball));
  }
  const finalPos = ball.holed ? { x: hole.cup.x, y: hole.cup.y } : round1(ball);
  const distanceToCup = ball.holed ? 0 : Number(Math.hypot(finalPos.x - hole.cup.x, finalPos.y - hole.cup.y).toFixed(1));
  return { path, finalPos, holed: ball.holed, distanceToCup, ...flags };
}

/** 조준 중 보여 줄 짧은 예상 경로(처음 일부만). */
export function previewParkGolfPath(hole: ParkGolfHoleSpec, from: Point, shot: ParkGolfShot): Point[] {
  let ball = launchParkGolfBall(hole, from, shot);
  const dots: Point[] = [];
  for (let i = 1; i <= PREVIEW_STEPS && ball.moving; i += 1) {
    ball = stepParkGolfBall(hole, ball).ball;
    if (i % PREVIEW_EVERY === 0) dots.push(round1(ball));
  }
  return dots;
}
