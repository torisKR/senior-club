import { describe, expect, it } from 'vitest';

import { createInitialAlkkagiStones, type AlkkagiStone } from './arcade-logic';
import { ALKKAGI_AI_LEVELS, chooseAlkkagiAiShot, createSeededRandom } from './alkkagi-ai';
import { ALKKAGI_MAX_SPEED, simulateAlkkagiShot } from './alkkagi-physics';
import { resolveAlkkagiTurn } from './alkkagi-turn';

const stone = (id: string, x: number, y: number, alive = true): AlkkagiStone =>
  ({ id, owner: id.startsWith('p') ? 'player' : 'ai', x, y, alive });

describe('alkkagi AI', () => {
  it('produces the same random sequence for the same seed', () => {
    const a = createSeededRandom(7);
    const b = createSeededRandom(7);
    const values = Array.from({ length: 20 }, () => a());
    expect(values).toEqual(Array.from({ length: 20 }, () => b()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(15);
  });

  it('flicks one of its own stones on the board, deterministically for a seed', () => {
    for (let level = 0; level < ALKKAGI_AI_LEVELS.length; level += 1) {
      const shot = chooseAlkkagiAiShot(createInitialAlkkagiStones(), level, createSeededRandom(3))!;
      expect(shot.stoneId).toMatch(/^a[1-5]$/);
      expect(shot.vy).toBeGreaterThan(0); // 아래쪽(내 돌)으로 쏩니다
      expect(Math.hypot(shot.vx, shot.vy)).toBeLessThanOrEqual(ALKKAGI_MAX_SPEED + 1e-9);
      expect(chooseAlkkagiAiShot(createInitialAlkkagiStones(), level, createSeededRandom(3))).toEqual(shot);
    }
  });

  it('has nothing to flick when either side has no stones left', () => {
    expect(chooseAlkkagiAiShot([stone('p1', 50, 80)], 2, createSeededRandom(1))).toBeNull();
    expect(chooseAlkkagiAiShot([stone('a1', 50, 20), stone('p1', 50, 80, false)], 2, createSeededRandom(1))).toBeNull();
  });

  it('aims more accurately at higher ranks', () => {
    const stones = [stone('a1', 50, 20), stone('p1', 50, 80)];
    const meanError = (level: number) => Array.from({ length: 80 }, (_, seed) => {
      const shot = chooseAlkkagiAiShot(stones, level, createSeededRandom(seed + 1))!;
      return Math.abs(Math.atan2(shot.vx, shot.vy));
    }).reduce((sum, value) => sum + value, 0) / 80;
    expect(meanError(0)).toBeGreaterThan(meanError(1));
    expect(meanError(1)).toBeGreaterThan(meanError(2));
  });
});

describe('alkkagi turn', () => {
  it('wins at once when my flick knocks out the last opponent stone', () => {
    const stones = [stone('p1', 50, 60), stone('a1', 50, 20)];
    const turn = resolveAlkkagiTurn(stones, { stoneId: 'p1', vx: 0, vy: -ALKKAGI_MAX_SPEED }, 2, createSeededRandom(1));
    expect(turn.result).toBe('win');
    expect(turn.aiStartFrame).toBeNull();
    expect(turn.knockedOutByMe).toEqual(['a1']);
    expect(turn.doubleKnockout).toBe(false);
    expect(turn.frames.at(-1)).toEqual(turn.stones);
  });

  it('counts two opponent stones knocked out by one flick as 일석이조', () => {
    const stones = [stone('p1', 50, 40), stone('a1', 43, 8), stone('a2', 57, 8), stone('a3', 10, 50)];
    const turn = resolveAlkkagiTurn(stones, { stoneId: 'p1', vx: 0, vy: -ALKKAGI_MAX_SPEED }, 0, createSeededRandom(1));
    expect(turn.knockedOutByMe).toEqual(expect.arrayContaining(['a1', 'a2']));
    expect(turn.doubleKnockout).toBe(true);
  });

  it('lets the opponent really flick back and appends its motion after a pause', () => {
    const initial = createInitialAlkkagiStones();
    const shot = { stoneId: 'p3', vx: 0, vy: -20 };
    const mine = simulateAlkkagiShot(initial, shot);
    const turn = resolveAlkkagiTurn(initial, shot, 1, createSeededRandom(5));
    expect(turn.result).toBe('continue');
    expect(turn.aiShooterId).toMatch(/^a[1-5]$/);
    expect(turn.aiStartFrame).toBeGreaterThan(mine.frames.length - 1);
    expect(turn.frames[turn.aiStartFrame!]).toEqual(mine.stones);
    expect(turn.frames.length).toBeGreaterThan(turn.aiStartFrame! + 5);
    expect(turn.frames.at(-1)).toEqual(turn.stones);
    expect(turn.stones).not.toEqual(mine.stones);
    expect(turn.hits.every((hit) => hit.frame < turn.frames.length)).toBe(true);
    expect(resolveAlkkagiTurn(initial, shot, 1, createSeededRandom(5))).toEqual(turn);
  });

  it('loses when the opponent knocks out my last stone', () => {
    const stones = [stone('p1', 50, 6), stone('a1', 50, 30)];
    const turn = resolveAlkkagiTurn(stones, { stoneId: 'p1', vx: 18, vy: 0 }, 2, createSeededRandom(2));
    expect(turn.result).toBe('lose');
    expect(turn.knockedOutByOpponent).toEqual(['p1']);
    expect(turn.aiStartFrame).not.toBeNull();
  });

  it('loses without an opponent reply when I flick my own last stone off the board', () => {
    const stones = [stone('p1', 50, 80), stone('a1', 20, 20)];
    const turn = resolveAlkkagiTurn(stones, { stoneId: 'p1', vx: 0, vy: ALKKAGI_MAX_SPEED }, 0, createSeededRandom(1));
    expect(turn.result).toBe('lose');
    expect(turn.lostByMe).toEqual(['p1']);
    expect(turn.aiStartFrame).toBeNull();
  });
});
