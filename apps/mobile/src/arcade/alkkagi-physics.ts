import type { AlkkagiStone } from './arcade-logic';

/**
 * 알까기 2D 물리 (순수 함수).
 * 판은 가로·세로 0~100 정사각형, 돌은 같은 질량의 원입니다.
 * 돌 중심이 판 밖으로 나가면 탈락합니다.
 */
export const ALKKAGI_BOARD_SIZE = 100;
export const ALKKAGI_RADIUS = 7;
/** 가장 세게 튕겼을 때의 속도 (판 단위/초) */
export const ALKKAGI_MAX_SPEED = 105;
/** 이만큼(판 단위) 뒤로 당기면 힘 100% */
export const ALKKAGI_MAX_PULL = 36;
/** 이보다 짧게(판 단위) 당기면 튕기지 않고 취소합니다 — 스치듯 닿은 손가락으로 돌이 나가지 않게. */
export const ALKKAGI_MIN_PULL = 8;
/** 조준 보조가 듣는 각도. 상대 돌 중심에서 이 안쪽으로 조준하면 중심 쪽으로 끌어당깁니다. */
export const ALKKAGI_ASSIST_DEG = 12;
/** 화면 재생용 프레임 간격 */
export const ALKKAGI_FRAME_MS = 1000 / 30;

const FRICTION = 60; // 감속 (판 단위/초²)
const RESTITUTION = 0.92;
/**
 * 튕긴 돌은 손가락 힘이 실려 다른 돌보다 무겁게 칩니다.
 * 맞은 돌은 더 멀리 나가고 내 돌은 속도가 남아 두 번째 돌까지 칠 수 있어 일석이조를 노릴 수 있습니다.
 */
const SHOOTER_MASS = 2;
const STEP = 1 / 120;
const STEPS_PER_FRAME = 4;
const MAX_STEPS = 120 * 10;
const HIT_MIN_SPEED = 4;

export interface AlkkagiShot { stoneId: string; vx: number; vy: number }
export interface AlkkagiHit { frame: number; x: number; y: number }
export interface AlkkagiSimulation {
  /** 모든 돌이 멈춘 뒤의 상태 */
  stones: AlkkagiStone[];
  /** 30fps 재생 프레임. 첫 프레임은 시작 상태, 마지막 프레임은 stones 와 같습니다. */
  frames: AlkkagiStone[][];
  hits: AlkkagiHit[];
  /** 이번 튕기기로 판 밖에 나간 돌 id (나간 순서) */
  knockedOut: string[];
}

// 계산 중에만 쓰는 지역 상태입니다. 밖으로는 새 객체(snapshot)만 내보냅니다.
interface Body { stone: AlkkagiStone; mass: number; x: number; y: number; vx: number; vy: number; onBoard: boolean; moving: boolean }

const round1 = (value: number) => Math.round(value * 10) / 10;
const clampSaved = (value: number) => Math.max(-100, Math.min(200, value));
const snapshot = (bodies: readonly Body[]): AlkkagiStone[] => bodies.map((body) =>
  body.moving ? { ...body.stone, x: clampSaved(round1(body.x)), y: clampSaved(round1(body.y)), alive: body.onBoard } : body.stone);

function advance(body: Body) {
  const speed = Math.hypot(body.vx, body.vy);
  if (speed === 0) return;
  const next = Math.max(0, speed - FRICTION * STEP);
  body.vx *= next / speed;
  body.vy *= next / speed;
  body.x += body.vx * STEP;
  body.y += body.vy * STEP;
  body.moving = true;
}

function collide(a: Body, b: Body, frame: number, hits: AlkkagiHit[]) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist >= ALKKAGI_RADIUS * 2 || dist === 0) return;
  const still = a.vx === 0 && a.vy === 0 && b.vx === 0 && b.vy === 0;
  if (still) return; // 예전 저장본처럼 겹친 채 멈춘 돌은 그대로 둡니다
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = (ALKKAGI_RADIUS * 2 - dist) / 2;
  const approach = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  a.x -= nx * overlap; a.y -= ny * overlap;
  b.x += nx * overlap; b.y += ny * overlap;
  a.moving = true; b.moving = true;
  if (approach >= 0) return;
  const impulse = (-(1 + RESTITUTION) * approach) / (1 / a.mass + 1 / b.mass);
  a.vx -= (impulse / a.mass) * nx; a.vy -= (impulse / a.mass) * ny;
  b.vx += (impulse / b.mass) * nx; b.vy += (impulse / b.mass) * ny;
  if (-approach >= HIT_MIN_SPEED) hits.push({ frame, x: round1(a.x + nx * ALKKAGI_RADIUS), y: round1(a.y + ny * ALKKAGI_RADIUS) });
}

function stepWorld(bodies: Body[], frame: number, hits: AlkkagiHit[], knockedOut: string[]) {
  for (const body of bodies) advance(body);
  const live = bodies.filter((body) => body.onBoard);
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) collide(live[i], live[j], frame, hits);
  }
  for (const body of live) {
    if (body.x >= 0 && body.x <= ALKKAGI_BOARD_SIZE && body.y >= 0 && body.y <= ALKKAGI_BOARD_SIZE) continue;
    body.onBoard = false; // 판 밖에서는 부딪히지 않고 미끄러지다 멈춥니다
    knockedOut.push(body.stone.id);
  }
}

/** 돌 하나를 튕긴 뒤 모든 돌이 멈출 때까지 계산합니다. 입력 배열은 바꾸지 않습니다. */
export function simulateAlkkagiShot(stones: readonly AlkkagiStone[], shot: AlkkagiShot): AlkkagiSimulation {
  const bodies: Body[] = stones.map((stone) => ({ stone, mass: stone.id === shot.stoneId ? SHOOTER_MASS : 1, x: stone.x, y: stone.y, vx: 0, vy: 0, onBoard: stone.alive, moving: false }));
  const frames = [snapshot(bodies)];
  const hits: AlkkagiHit[] = [];
  const knockedOut: string[] = [];
  const shooter = bodies.find((body) => body.stone.id === shot.stoneId && body.onBoard);
  if (!shooter) return { stones: frames[0], frames, hits, knockedOut };
  shooter.vx = shot.vx;
  shooter.vy = shot.vy;
  for (let step = 1; step <= MAX_STEPS; step += 1) {
    stepWorld(bodies, frames.length, hits, knockedOut);
    const resting = bodies.every((body) => body.vx === 0 && body.vy === 0);
    if (step % STEPS_PER_FRAME === 0 || resting) frames.push(snapshot(bodies));
    if (resting) break;
  }
  return { stones: frames[frames.length - 1], frames, hits, knockedOut };
}

/** 당긴 길이(판 단위)를 힘 0~1 로 바꿉니다. */
export function pullPower(pullX: number, pullY: number): number {
  return Math.min(1, Math.hypot(pullX, pullY) / ALKKAGI_MAX_PULL);
}

/**
 * 조준 보조(약한 자석): 조준이 상대 돌 중심 방향에 가까울수록 중심 쪽으로 더 당겨 줍니다.
 * 어긋남이 작으면 거의 사라지고, ALKKAGI_ASSIST_DEG 를 넘으면 그대로라 비껴 치기도 할 수 있습니다.
 */
export function assistAim(stones: readonly AlkkagiStone[], shooter: AlkkagiStone, dirX: number, dirY: number): { dirX: number; dirY: number } {
  const aim = Math.atan2(dirY, dirX);
  const limit = (ALKKAGI_ASSIST_DEG * Math.PI) / 180;
  let nearest = limit;
  for (const stone of stones) {
    if (!stone.alive || stone.owner === shooter.owner) continue;
    const raw = aim - Math.atan2(stone.y - shooter.y, stone.x - shooter.x);
    const diff = Math.atan2(Math.sin(raw), Math.cos(raw));
    if (Math.abs(diff) < Math.abs(nearest)) nearest = diff;
  }
  if (Math.abs(nearest) >= limit) return { dirX, dirY };
  const assisted = aim - nearest + (nearest * Math.abs(nearest)) / limit;
  return { dirX: Math.cos(assisted), dirY: Math.sin(assisted) };
}

/** 새총처럼: 당긴 방향의 반대로 날아갑니다(조준 보조 적용). 너무 짧게 당기면 null(취소). */
export function shotFromPull(stones: readonly AlkkagiStone[], shooter: AlkkagiStone, pullX: number, pullY: number): AlkkagiShot | null {
  const length = Math.hypot(pullX, pullY);
  if (length < ALKKAGI_MIN_PULL) return null;
  const { dirX, dirY } = assistAim(stones, shooter, -pullX / length, -pullY / length);
  const speed = pullPower(pullX, pullY) * ALKKAGI_MAX_SPEED;
  return { stoneId: shooter.id, vx: dirX * speed, vy: dirY * speed };
}

export interface AlkkagiFirstHit {
  /** 처음 부딪히는 순간 내 돌의 중심 */
  x: number;
  y: number;
  targetId: string;
  /** 맞은 돌이 밀려 나가는 방향 */
  targetDirX: number;
  targetDirY: number;
}

/** 조준선 미리 보기: 이 방향으로 튕기면 처음 부딪히는 돌과 그 돌이 밀려 나갈 방향. 없으면 null. */
export function predictFirstHit(stones: readonly AlkkagiStone[], shooter: AlkkagiStone, dirX: number, dirY: number): AlkkagiFirstHit | null {
  let best: (AlkkagiFirstHit & { along: number }) | null = null;
  for (const stone of stones) {
    if (!stone.alive || stone.id === shooter.id) continue;
    const relX = stone.x - shooter.x;
    const relY = stone.y - shooter.y;
    const along = relX * dirX + relY * dirY;
    const offSq = relX * relX + relY * relY - along * along;
    const reachSq = (ALKKAGI_RADIUS * 2) ** 2;
    if (along <= 0 || offSq >= reachSq) continue;
    const travel = along - Math.sqrt(reachSq - offSq);
    if (travel < 0 || (best && travel >= best.along)) continue;
    const x = shooter.x + dirX * travel;
    const y = shooter.y + dirY * travel;
    best = { along: travel, x, y, targetId: stone.id, targetDirX: (stone.x - x) / (ALKKAGI_RADIUS * 2), targetDirY: (stone.y - y) / (ALKKAGI_RADIUS * 2) };
  }
  if (!best) return null;
  const { along: _along, ...hit } = best;
  return hit;
}

/** 버튼 조작: 목표 돌을 향해 힘(0~1)만큼 튕깁니다. */
export function shotToward(shooter: AlkkagiStone, target: { x: number; y: number }, power: number): AlkkagiShot {
  const dx = target.x - shooter.x;
  const dy = target.y - shooter.y;
  const dist = Math.hypot(dx, dy) || 1;
  const speed = Math.max(0, Math.min(1, power)) * ALKKAGI_MAX_SPEED;
  return { stoneId: shooter.id, vx: (dx / dist) * speed, vy: (dy / dist) * speed };
}
