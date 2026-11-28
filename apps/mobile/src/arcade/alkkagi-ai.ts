import type { AlkkagiStone } from './arcade-logic';
import { shotToward, type AlkkagiShot } from './alkkagi-physics';

/**
 * 상대 급수별 실력. 정확도(조준 오차)와 힘 조절, 돌 고르는 방식이 다릅니다.
 * 기준(alkkagi-balance.test.ts): 아무렇게나 쳐도 18급은 대체로 이기고, 손이 서툴러도(±15°) 9급은 절반쯤,
 * 명인은 꽤 정확해야(±3°) 절반 넘게 이깁니다.
 */
export interface AlkkagiAiLevel {
  /** 조준이 좌우로 흔들리는 최대 각도 */
  aimErrorDeg: number;
  powerMin: number;
  powerMax: number;
  /** random: 아무 돌이나 · nearest: 가장 가까운 돌 */
  plan: 'random' | 'nearest';
}

/** 화면의 상대 순서(18급 · 9급 · 명인)와 같습니다. */
export const ALKKAGI_AI_LEVELS: readonly AlkkagiAiLevel[] = [
  { aimErrorDeg: 25, powerMin: 0.3, powerMax: 0.6, plan: 'random' },
  { aimErrorDeg: 10, powerMin: 0.5, powerMax: 0.85, plan: 'nearest' },
  { aimErrorDeg: 6, powerMin: 0.65, powerMax: 1, plan: 'nearest' },
];

/** 시드가 같으면 같은 순서를 내는 난수(mulberry32). 테스트와 재현용. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

interface Pair { shooter: AlkkagiStone; target: AlkkagiStone; distance: number }

function pickPair(pairs: readonly Pair[], level: AlkkagiAiLevel, random: () => number): Pair {
  if (level.plan === 'random') return pairs[Math.floor(random() * pairs.length)];
  return pairs.reduce((best, pair) => (pair.distance < best.distance ? pair : best));
}

/** 주어진 실력(level)으로 튕길 돌과 방향·힘을 고릅니다. 튕길 수 없으면 null. */
export function chooseAlkkagiShot(
  stones: readonly AlkkagiStone[],
  level: AlkkagiAiLevel,
  random: () => number,
  side: AlkkagiStone['owner'] = 'ai',
): AlkkagiShot | null {
  const shooters = stones.filter((stone) => stone.alive && stone.owner === side);
  const targets = stones.filter((stone) => stone.alive && stone.owner !== side);
  if (!shooters.length || !targets.length) return null;
  const pairs = shooters.flatMap((shooter) => targets.map((target) => (
    { shooter, target, distance: Math.hypot(target.x - shooter.x, target.y - shooter.y) }
  )));
  const { shooter, target } = pickPair(pairs, level, random);
  const power = level.powerMin + random() * (level.powerMax - level.powerMin);
  const straight = shotToward(shooter, target, power);
  const error = ((random() * 2 - 1) * level.aimErrorDeg * Math.PI) / 180;
  const cos = Math.cos(error);
  const sin = Math.sin(error);
  return { stoneId: shooter.id, vx: straight.vx * cos - straight.vy * sin, vy: straight.vx * sin + straight.vy * cos };
}

/** 상대(18급 0 · 9급 1 · 명인 2)가 튕길 돌과 방향·힘을 고릅니다. */
export function chooseAlkkagiAiShot(stones: readonly AlkkagiStone[], levelIdx: number, random: () => number): AlkkagiShot | null {
  return chooseAlkkagiShot(stones, ALKKAGI_AI_LEVELS[levelIdx] ?? ALKKAGI_AI_LEVELS[0], random);
}
