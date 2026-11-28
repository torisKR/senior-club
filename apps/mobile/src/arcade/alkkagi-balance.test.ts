import { describe, expect, it } from 'vitest';

import { createInitialAlkkagiStones, type AlkkagiStone } from './arcade-logic';
import { ALKKAGI_AI_LEVELS, chooseAlkkagiAiShot, chooseAlkkagiShot, createSeededRandom } from './alkkagi-ai';
import { ALKKAGI_MAX_SPEED, assistAim, simulateAlkkagiShot, type AlkkagiShot, type AlkkagiSimulation } from './alkkagi-physics';

/**
 * 난이도·일석이조 목표를 시뮬레이션으로 고정합니다(시드 고정이라 결과는 항상 같습니다).
 * 물리 상수나 AI 수치를 바꾸면 여기 기준을 다시 확인하세요.
 */
const SIM_TIMEOUT_MS = 120_000;
const alive = (stones: readonly AlkkagiStone[], owner: AlkkagiStone['owner']) => stones.filter((stone) => stone.owner === owner && stone.alive);
const fire = (stones: readonly AlkkagiStone[], stoneId: string, deg: number, power: number): AlkkagiSimulation => {
  const rad = (deg * Math.PI) / 180;
  const speed = power * ALKKAGI_MAX_SPEED;
  return simulateAlkkagiShot(stones, { stoneId, vx: Math.cos(rad) * speed, vy: Math.sin(rad) * speed });
};
const enemiesOut = (sim: AlkkagiSimulation) => sim.knockedOut.filter((id) => id.startsWith('a')).length;

/** 한 국면에서 일석이조가 나오는 가장 넓은 각도 창(도)과 나온 횟수. */
function doubleWindow(stones: readonly AlkkagiStone[], powers: readonly number[], stepDeg: number) {
  let widest = 0;
  let count = 0;
  for (const shooter of alive(stones, 'player')) {
    for (const power of powers) {
      let run = 0;
      for (let deg = 0; deg < 360; deg += stepDeg) {
        if (enemiesOut(fire(stones, shooter.id, deg, power)) >= 2) { run += stepDeg; count += 1; widest = Math.max(widest, run); } else run = 0;
      }
    }
  }
  return { widest, count };
}

/** 9급끼리 몇 수 주고받은 중반 국면. */
function midgame(seed: number): AlkkagiStone[] {
  const random = createSeededRandom(seed);
  let stones = createInitialAlkkagiStones();
  for (let turn = 0; turn < 2; turn += 1) {
    for (const side of ['player', 'ai'] as const) {
      const shot = chooseAlkkagiShot(stones, ALKKAGI_AI_LEVELS[1], random, side);
      if (shot) stones = simulateAlkkagiShot(stones, shot).stones;
    }
  }
  return stones;
}

/** 사람 조작 모형. err: 손이 흔들리는 각도(±), assist: 끌기의 조준 보조 적용 여부. */
interface Player { err: number; powerMin: number; powerMax: number; pick: 'nearest' | 'random'; assist: boolean }
const PLAYERS = {
  /** 버튼으로 튕기기: 목표를 정확히 향하고 ±3° 흔들림, 힘 100% */
  button: { err: 3, powerMin: 1, powerMax: 1, pick: 'nearest', assist: false },
  /** 끌기에 익숙한 사용자 */
  steady: { err: 3, powerMin: 0.7, powerMax: 1, pick: 'nearest', assist: true },
  /** 보통 사용자 */
  average: { err: 8, powerMin: 0.6, powerMax: 1, pick: 'nearest', assist: true },
  /** 손이 서툰 사용자 */
  clumsy: { err: 15, powerMin: 0.5, powerMax: 1, pick: 'nearest', assist: true },
  /** 아무 돌이나 대충 치는 사용자 */
  careless: { err: 30, powerMin: 0.4, powerMax: 1, pick: 'random', assist: true },
} as const satisfies Record<string, Player>;

function playerShot(stones: readonly AlkkagiStone[], player: Player, random: () => number): AlkkagiShot {
  const mine = alive(stones, 'player');
  const theirs = alive(stones, 'ai');
  const pairs = mine.flatMap((shooter) => theirs.map((target) => ({ shooter, target, distance: Math.hypot(target.x - shooter.x, target.y - shooter.y) })));
  const { shooter, target } = player.pick === 'random'
    ? pairs[Math.floor(random() * pairs.length)]
    : pairs.reduce((best, pair) => (pair.distance < best.distance ? pair : best));
  const angle = Math.atan2(target.y - shooter.y, target.x - shooter.x) + ((random() * 2 - 1) * player.err * Math.PI) / 180;
  const raw = { dirX: Math.cos(angle), dirY: Math.sin(angle) };
  const dir = player.assist ? assistAim(stones, shooter, raw.dirX, raw.dirY) : raw;
  const speed = (player.powerMin + random() * (player.powerMax - player.powerMin)) * ALKKAGI_MAX_SPEED;
  return { stoneId: shooter.id, vx: dir.dirX * speed, vy: dir.dirY * speed };
}

/** 한 판을 끝까지 둡니다. myShot 이 내 튕기기를 정합니다. */
function playMatch(levelIdx: number, seed: number, myShot: (stones: readonly AlkkagiStone[], random: () => number) => AlkkagiSimulation) {
  const random = createSeededRandom(seed);
  let stones = createInitialAlkkagiStones();
  let doubles = 0;
  for (let turn = 0; turn < 80; turn += 1) {
    const mine = myShot(stones, random);
    if (enemiesOut(mine) >= 2) doubles += 1;
    stones = mine.stones;
    const reply = alive(stones, 'ai').length && alive(stones, 'player').length ? chooseAlkkagiAiShot(stones, levelIdx, random) : null;
    if (reply) stones = simulateAlkkagiShot(stones, reply).stones;
    if (!alive(stones, 'ai').length) return { won: true, doubles };
    if (!alive(stones, 'player').length) return { won: false, doubles };
  }
  return { won: false, doubles };
}

const GAMES = 60;
const winRate = (player: Player, levelIdx: number) => Array.from({ length: GAMES }, (_, seed) =>
  playMatch(levelIdx, seed + 1, (stones, random) => simulateAlkkagiShot(stones, playerShot(stones, player, random))).won).filter(Boolean).length / GAMES;

/** 일석이조를 노리는 정확한 사용자: 옆 각도로 빗나가도 나오는 각도만 고릅니다. */
function seekDouble(stones: readonly AlkkagiStone[], random: () => number, wantDouble: boolean, errDeg: number): AlkkagiSimulation {
  const STEP = 1.5;
  const score = (sim: AlkkagiSimulation) => (sim.knockedOut.some((id) => id.startsWith('p')) ? -1 : enemiesOut(sim));
  let best = { id: '', deg: 0, power: 1, value: -Infinity };
  for (const shooter of alive(stones, 'player')) {
    for (const power of [0.8, 1]) {
      const scores = Array.from({ length: 360 / STEP }, (_, index) => score(fire(stones, shooter.id, index * STEP, power)));
      scores.forEach((own, index) => {
        const safe = Math.min(scores[(index + scores.length - 1) % scores.length], own, scores[(index + 1) % scores.length]);
        const value = Math.min(safe, wantDouble ? 2 : 1) * 10 + own;
        if (value > best.value) best = { id: shooter.id, deg: index * STEP, power, value };
      });
    }
  }
  return fire(stones, best.id, best.deg + (random() * 2 - 1) * errDeg, best.power);
}

describe('alkkagi balance (simulation)', () => {
  it('lets 일석이조 happen from the opening position when aimed for', () => {
    const opening = doubleWindow(createInitialAlkkagiStones(), [0.6, 0.8, 1], 0.5);
    expect(opening.count).toBeGreaterThanOrEqual(50); // 10,800샷 중 (예전 물리: 0)
    expect(opening.widest).toBeGreaterThanOrEqual(3);
  }, SIM_TIMEOUT_MS);

  it('offers a 3°-wide 일석이조 angle in most mid-game positions', () => {
    const positions = Array.from({ length: 12 }, (_, index) => midgame(index + 1))
      .filter((stones) => alive(stones, 'ai').length >= 2 && alive(stones, 'player').length >= 1);
    const windows = positions.map((stones) => doubleWindow(stones, [0.8, 1], 0.5).widest);
    expect(positions.length).toBeGreaterThanOrEqual(10);
    expect(windows.filter((widest) => widest >= 3).length / positions.length).toBeGreaterThanOrEqual(0.7);
  }, SIM_TIMEOUT_MS);

  it('keeps every rank winnable for the control style it is meant for', () => {
    expect(winRate(PLAYERS.careless, 0)).toBeGreaterThanOrEqual(0.8); // 아무렇게나 쳐도 18급은 대체로 이깁니다
    const clumsyVsNine = winRate(PLAYERS.clumsy, 1); // 손이 서툴러도 9급(2막)은 절반 가까이
    expect(clumsyVsNine).toBeGreaterThanOrEqual(0.45);
    expect(clumsyVsNine).toBeLessThanOrEqual(0.8);
    expect(winRate(PLAYERS.average, 1)).toBeGreaterThanOrEqual(0.8);
    expect(winRate(PLAYERS.steady, 2)).toBeGreaterThanOrEqual(0.5); // 명인은 정확해야 이깁니다
    expect(winRate(PLAYERS.average, 2)).toBeLessThan(winRate(PLAYERS.average, 1));
  }, SIM_TIMEOUT_MS);

  it('keeps button mode an easy alternative without being a guaranteed win', () => {
    const versusMaster = winRate(PLAYERS.button, 2);
    expect(versusMaster).toBeGreaterThanOrEqual(0.8); // 접근성 대안이므로 어렵지 않게
    expect(winRate(PLAYERS.button, 1)).toBeGreaterThanOrEqual(versusMaster);
  }, SIM_TIMEOUT_MS);

  it('lets an accurate player win with 일석이조 against 명인 within three tries (5막 시련)', () => {
    const tries = Array.from({ length: 12 }, (_, seed) => {
      let got = false;
      const match = playMatch(2, seed + 1, (stones, random) => {
        const sim = seekDouble(stones, random, !got, 3);
        got = got || enemiesOut(sim) >= 2;
        return sim;
      });
      return match.won && match.doubles > 0;
    });
    const perTry = tries.filter(Boolean).length / tries.length;
    expect(perTry).toBeGreaterThanOrEqual(0.6);
    expect(1 - (1 - perTry) ** 3).toBeGreaterThanOrEqual(0.9);
  }, SIM_TIMEOUT_MS);
});
