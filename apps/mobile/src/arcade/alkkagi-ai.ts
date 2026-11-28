import type { AlkkagiStone } from './arcade-logic';
import { shotToward, simulateAlkkagiShot, type AlkkagiShot } from './alkkagi-physics';

/** 상대 급수별 실력. 정확도(조준 오차)와 힘 조절, 수읽기 방식이 다릅니다. */
export interface AlkkagiAiLevel {
  /** 조준이 좌우로 흔들리는 최대 각도 */
  aimErrorDeg: number;
  powerMin: number;
  powerMax: number;
  /** random: 아무 돌이나 · nearest: 가장 가까운 돌 · best: 결과를 미리 따져 봄 */
  plan: 'random' | 'nearest' | 'best';
}

/** 화면의 상대 순서(18급 · 9급 · 명인)와 같습니다. */
export const ALKKAGI_AI_LEVELS: readonly AlkkagiAiLevel[] = [
  { aimErrorDeg: 12, powerMin: 0.45, powerMax: 0.8, plan: 'random' },
  { aimErrorDeg: 7, powerMin: 0.6, powerMax: 0.9, plan: 'nearest' },
  { aimErrorDeg: 4.5, powerMin: 0.75, powerMax: 1, plan: 'best' },
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

const KNOCKOUT_SCORE = 10;
const OWN_LOSS_SCORE = 11;
const DISTANCE_SCORE = 0.02;

function scorePair(stones: readonly AlkkagiStone[], pair: Pair, power: number): number {
  const outcome = simulateAlkkagiShot(stones, shotToward(pair.shooter, pair.target, power));
  const mine = pair.shooter.owner;
  const lost = outcome.knockedOut.filter((id) => stones.find((stone) => stone.id === id)?.owner === mine).length;
  return (outcome.knockedOut.length - lost) * KNOCKOUT_SCORE - lost * OWN_LOSS_SCORE - pair.distance * DISTANCE_SCORE;
}

function pickPair(stones: readonly AlkkagiStone[], pairs: readonly Pair[], level: AlkkagiAiLevel, random: () => number): Pair {
  if (level.plan === 'random') return pairs[Math.floor(random() * pairs.length)];
  if (level.plan === 'nearest') return pairs.reduce((best, pair) => (pair.distance < best.distance ? pair : best));
  const power = (level.powerMin + level.powerMax) / 2;
  return pairs
    .map((pair) => ({ pair, score: scorePair(stones, pair, power) }))
    .reduce((best, item) => (item.score > best.score ? item : best)).pair;
}

/**
 * 상대가 튕길 돌과 방향·힘을 고릅니다. 튕길 수 없으면 null.
 * side 를 'player' 로 주면 내 돌 쪽에서 고릅니다(난이도 검증용 봇).
 */
export function chooseAlkkagiAiShot(
  stones: readonly AlkkagiStone[],
  levelIdx: number,
  random: () => number,
  side: AlkkagiStone['owner'] = 'ai',
): AlkkagiShot | null {
  const level = ALKKAGI_AI_LEVELS[levelIdx] ?? ALKKAGI_AI_LEVELS[0];
  const shooters = stones.filter((stone) => stone.alive && stone.owner === side);
  const targets = stones.filter((stone) => stone.alive && stone.owner !== side);
  if (!shooters.length || !targets.length) return null;
  const pairs = shooters.flatMap((shooter) => targets.map((target) => (
    { shooter, target, distance: Math.hypot(target.x - shooter.x, target.y - shooter.y) }
  )));
  const { shooter, target } = pickPair(stones, pairs, level, random);
  const power = level.powerMin + random() * (level.powerMax - level.powerMin);
  const straight = shotToward(shooter, target, power);
  const error = ((random() * 2 - 1) * level.aimErrorDeg * Math.PI) / 180;
  const cos = Math.cos(error);
  const sin = Math.sin(error);
  return { stoneId: shooter.id, vx: straight.vx * cos - straight.vy * sin, vy: straight.vx * sin + straight.vy * cos };
}
