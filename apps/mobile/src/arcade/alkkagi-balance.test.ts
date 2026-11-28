import { describe, expect, it } from 'vitest';

import { createInitialAlkkagiStones, type AlkkagiStone } from './arcade-logic';
import { ALKKAGI_AI_LEVELS, chooseAlkkagiAiShot, chooseAlkkagiShot, createSeededRandom, type AlkkagiAiLevel } from './alkkagi-ai';
import {
  ALKKAGI_BUTTON_POWERS, ALKKAGI_DEFAULT_POWER_MODE, ALKKAGI_TRIAL_AI_LEVEL, createTrialAlkkagiStones, isDoubleKnockoutAim, isDoubleKnockoutTrial,
} from './alkkagi-tuning';
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
function playMatch(
  levelIdx: number, seed: number, myShot: (stones: readonly AlkkagiStone[], random: () => number) => AlkkagiSimulation,
  setup: { stones: AlkkagiStone[]; level?: AlkkagiAiLevel } = { stones: createInitialAlkkagiStones() },
) {
  const random = createSeededRandom(seed);
  let { stones } = setup;
  let doubles = 0;
  for (let turn = 0; turn < 80; turn += 1) {
    const mine = myShot(stones, random);
    if (enemiesOut(mine) >= 2) doubles += 1;
    stones = mine.stones;
    const reply = !alive(stones, 'ai').length || !alive(stones, 'player').length ? null
      : setup.level ? chooseAlkkagiShot(stones, setup.level, random) : chooseAlkkagiAiShot(stones, levelIdx, random);
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

/**
 * 5막 시련의 보통(±8°) 끌기 사용자 모형. "일석이조 각" 안내가 뜨는 각이 있으면 가장 넓은 각의 가운데를 노려
 * 길게(85~100%) 당기고, 손은 그대로 ±err 만큼 흔들립니다(조준 보조 적용). 각이 없거나 이미 이뤘으면 평소처럼 가까운 돌을 칩니다.
 */
const HINT_SWEEP_DEG = 1.5;
const HINT_POWER = 0.92;
function hintedAim(stones: readonly AlkkagiStone[]): { shooter: AlkkagiStone; deg: number } | null {
  let best: { shooter: AlkkagiStone; deg: number; width: number } | null = null;
  for (const shooter of alive(stones, 'player')) {
    let run = 0;
    for (let deg = 0; deg < 360; deg += HINT_SWEEP_DEG) {
      const rad = (deg * Math.PI) / 180;
      run = isDoubleKnockoutAim(stones, shooter.id, Math.cos(rad), Math.sin(rad), HINT_POWER) ? run + HINT_SWEEP_DEG : 0;
      if (run > (best?.width ?? 0)) best = { shooter, deg: deg - (run - HINT_SWEEP_DEG) / 2, width: run };
    }
  }
  return best;
}
function trialShot(stones: readonly AlkkagiStone[], random: () => number, player: Player, seekDoubleNow: boolean): AlkkagiSimulation {
  const hint = seekDoubleNow ? hintedAim(stones) : null;
  if (!hint) return simulateAlkkagiShot(stones, playerShot(stones, player, random));
  const angle = ((hint.deg + (random() * 2 - 1) * player.err) * Math.PI) / 180;
  const dir = assistAim(stones, hint.shooter, Math.cos(angle), Math.sin(angle));
  const speed = (0.85 + random() * 0.15) * ALKKAGI_MAX_SPEED;
  return simulateAlkkagiShot(stones, { stoneId: hint.shooter.id, vx: dir.dirX * speed, vy: dir.dirY * speed });
}
const buttonRate = (power: number, levelIdx: number) => winRate({ ...PLAYERS.button, powerMin: power, powerMax: power }, levelIdx);

/** 버튼 사용자: 내 돌·목표 돌을 바꿔 가며 "일석이조 각" 안내가 뜨는 짝을 찾아 튕깁니다(±3° 흔들림). 없으면 가장 가까운 돌. */
function buttonTrialShot(stones: readonly AlkkagiStone[], random: () => number, power: number, seekDoubleNow: boolean): AlkkagiSimulation {
  const player: Player = { ...PLAYERS.button, powerMin: power, powerMax: power };
  const pairs = alive(stones, 'player').flatMap((shooter) => alive(stones, 'ai').map((target) => ({ shooter, target })));
  const hinted = seekDoubleNow ? pairs.find(({ shooter, target }) => {
    const distance = Math.hypot(target.x - shooter.x, target.y - shooter.y);
    return isDoubleKnockoutAim(stones, shooter.id, (target.x - shooter.x) / distance, (target.y - shooter.y) / distance, power);
  }) : undefined;
  if (!hinted) return simulateAlkkagiShot(stones, playerShot(stones, player, random));
  const deg = (Math.atan2(hinted.target.y - hinted.shooter.y, hinted.target.x - hinted.shooter.x) * 180) / Math.PI + (random() * 2 - 1) * player.err;
  return fire(stones, hinted.shooter.id, deg, power);
}
function trialRateWith(games: number, level: AlkkagiAiLevel, shoot: (stones: readonly AlkkagiStone[], random: () => number, seek: boolean) => AlkkagiSimulation) {
  const results = Array.from({ length: games }, (_, seed) => {
    let got = false;
    const match = playMatch(2, seed + 1, (stones, random) => {
      const sim = shoot(stones, random, !got);
      got = got || enemiesOut(sim) >= 2;
      return sim;
    }, { stones: createTrialAlkkagiStones(), level });
    return { won: match.won, both: match.won && match.doubles > 0 };
  });
  return { win: results.filter((r) => r.won).length / games, both: results.filter((r) => r.both).length / games };
}
const TRIAL_GAMES = 60;
const withinThree = (perTry: number) => 1 - (1 - perTry) ** 3;

describe('alkkagi 5막 시련 돕기 (simulation)', () => {
  it('only helps trials that need 일석이조 and leaves free play untouched', () => {
    expect(isDoubleKnockoutTrial(undefined)).toBe(false);
    expect(isDoubleKnockoutTrial('chapter_2')).toBe(false);
    expect(isDoubleKnockoutTrial('chapter_5')).toBe(true);
    expect(ALKKAGI_AI_LEVELS[2]).toEqual({ aimErrorDeg: 6, powerMin: 0.65, powerMax: 1, plan: 'nearest' });
    expect(ALKKAGI_TRIAL_AI_LEVEL.aimErrorDeg).toBeGreaterThan(ALKKAGI_AI_LEVELS[2].aimErrorDeg);
    expect(ALKKAGI_TRIAL_AI_LEVEL.aimErrorDeg).toBeLessThan(ALKKAGI_AI_LEVELS[1].aimErrorDeg);
  });

  it('starts the trial with two touching pairs of opponent stones on the board', () => {
    const stones = createTrialAlkkagiStones();
    expect(stones.map((stone) => stone.id)).toEqual(createInitialAlkkagiStones().map((stone) => stone.id));
    expect(alive(stones, 'player')).toEqual(alive(createInitialAlkkagiStones(), 'player'));
    const gap = (a: string, b: string) => {
      const [first, second] = [a, b].map((id) => stones.find((stone) => stone.id === id)!);
      return Math.hypot(first.x - second.x, first.y - second.y);
    };
    for (const [a, b] of [['a1', 'a2'], ['a4', 'a5']]) {
      expect(gap(a, b)).toBeGreaterThanOrEqual(14); // 겹치지 않고
      expect(gap(a, b)).toBeLessThanOrEqual(15); // 붙어 있습니다
    }
  });

  it('shows the "일석이조 각" hint only where a slightly shaky shot still knocks out two', () => {
    const trial = createTrialAlkkagiStones();
    const toward = (deg: number) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)] as const;
    expect(isDoubleKnockoutAim(trial, 'p2', ...toward(226), 0.92)).toBe(true);
    expect(isDoubleKnockoutAim(trial, 'p2', ...toward(226), 0.5)).toBe(false); // 살살 당기면 각이 아닙니다
    expect(isDoubleKnockoutAim(trial, 'p3', ...toward(270), 1)).toBe(false); // 혼자 있는 돌
    const widest = Math.max(...['p2', 'p4'].map((id) => {
      let run = 0;
      let best = 0;
      for (let deg = 180; deg < 360; deg += 0.5) { run = isDoubleKnockoutAim(trial, id, ...toward(deg), 0.92) ? run + 0.5 : 0; best = Math.max(best, run); }
      return best;
    }));
    expect(widest).toBeGreaterThanOrEqual(12); // ±8° 손떨림에도 대부분 들어오는 넓이
  }, SIM_TIMEOUT_MS);

  it('lets a ±8° drag player win with 일석이조 within three tries at least half the time', () => {
    const guided = trialRateWith(TRIAL_GAMES, ALKKAGI_TRIAL_AI_LEVEL, (stones, random, seek) => trialShot(stones, random, PLAYERS.average, seek));
    expect(guided.both).toBeGreaterThanOrEqual(0.7); // 측정 0.88
    expect(withinThree(guided.both)).toBeGreaterThanOrEqual(0.5);
    // 안내를 전혀 보지 않고 가까운 돌만 쳐도 예전(1~4%)보다 훨씬 자주 나옵니다
    const unguided = trialRateWith(TRIAL_GAMES, ALKKAGI_TRIAL_AI_LEVEL, (stones, random) => trialShot(stones, random, PLAYERS.average, false));
    expect(unguided.both).toBeGreaterThanOrEqual(0.15); // 측정 0.22
    expect(withinThree(unguided.both)).toBeGreaterThanOrEqual(0.45);
    // 손이 서툰(±15°) 사용자도 세 번 안에는 대체로 됩니다
    const clumsy = trialRateWith(TRIAL_GAMES, ALKKAGI_TRIAL_AI_LEVEL, (stones, random, seek) => trialShot(stones, random, PLAYERS.clumsy, seek));
    expect(withinThree(clumsy.both)).toBeGreaterThanOrEqual(0.8); // 측정: 한 번에 0.55
  }, SIM_TIMEOUT_MS);

  it('keeps the trial reachable in button mode at the default power', () => {
    const defaultPower = ALKKAGI_BUTTON_POWERS.find((mode) => mode.id === ALKKAGI_DEFAULT_POWER_MODE)!.power;
    const rate = trialRateWith(TRIAL_GAMES, ALKKAGI_TRIAL_AI_LEVEL, (stones, random, seek) => buttonTrialShot(stones, random, defaultPower, seek));
    expect(rate.both).toBeGreaterThanOrEqual(0.8); // 측정 0.97
  }, SIM_TIMEOUT_MS);
});

describe('alkkagi button powers (simulation)', () => {
  it('never starts on a power that cannot win', () => {
    const selected = ALKKAGI_BUTTON_POWERS.find((mode) => mode.id === ALKKAGI_DEFAULT_POWER_MODE)!;
    expect(selected.label).toBe('보통');
    expect(selected.canKnockOut).toBe(true);
    expect(buttonRate(selected.power, 1)).toBeGreaterThanOrEqual(0.9); // 9급: 측정 1.0
    expect(buttonRate(selected.power, 2)).toBeGreaterThanOrEqual(0.6); // 명인: 측정 0.7
  }, SIM_TIMEOUT_MS);

  it('says in words when a power is too weak to push stones out, and only then', () => {
    for (const mode of ALKKAGI_BUTTON_POWERS) {
      const beatsNineKyu = buttonRate(mode.power, 1) >= 0.5;
      expect(mode.canKnockOut).toBe(beatsNineKyu);
      expect(mode.sub.includes('상대 돌을 밀어내기엔 약해요')).toBe(!beatsNineKyu);
    }
    expect(ALKKAGI_BUTTON_POWERS.map((mode) => mode.id)).toEqual(['precision', 'strong', 'double']); // 저장 형식 유지
  }, SIM_TIMEOUT_MS);
});
