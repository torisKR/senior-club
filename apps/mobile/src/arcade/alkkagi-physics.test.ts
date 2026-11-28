import { describe, expect, it } from 'vitest';

import { createInitialAlkkagiStones, type AlkkagiStone } from './arcade-logic';
import {
  ALKKAGI_ASSIST_DEG, ALKKAGI_MAX_PULL, ALKKAGI_MAX_SPEED, ALKKAGI_MIN_PULL, ALKKAGI_RADIUS, assistAim, predictFirstHit, pullPower,
  shotFromPull, shotToward, simulateAlkkagiShot,
} from './alkkagi-physics';

const stone = (id: string, x: number, y: number, alive = true): AlkkagiStone =>
  ({ id, owner: id.startsWith('p') ? 'player' : 'ai', x, y, alive });
const byId = (stones: readonly AlkkagiStone[], id: string) => stones.find((item) => item.id === id)!;

describe('alkkagi physics', () => {
  it('slows a lone stone down with friction until it stops on the board', () => {
    const stones = [stone('p1', 50, 80)];
    const sim = simulateAlkkagiShot(stones, { stoneId: 'p1', vx: 0, vy: -60 });
    const moved = byId(sim.stones, 'p1');
    expect(moved.alive).toBe(true);
    expect(moved.x).toBeCloseTo(50, 1);
    expect(moved.y).toBeLessThan(80);
    expect(moved.y).toBeGreaterThan(20);
    expect(sim.knockedOut).toEqual([]);
    expect(sim.frames.length).toBeGreaterThan(5);
    expect(sim.frames.at(-1)).toEqual(sim.stones);
    expect(stones[0]).toEqual(stone('p1', 50, 80)); // 입력은 바꾸지 않습니다
  });

  it('knocks the shooter itself off the board when flicked too hard at nothing', () => {
    const sim = simulateAlkkagiShot([stone('p1', 50, 80)], { stoneId: 'p1', vx: 0, vy: -ALKKAGI_MAX_SPEED });
    expect(byId(sim.stones, 'p1').alive).toBe(false);
    expect(sim.knockedOut).toEqual(['p1']);
  });

  it('transfers momentum in a head-on hit: the target flies out and the shooter stays', () => {
    const sim = simulateAlkkagiShot([stone('p1', 50, 60), stone('a1', 50, 20)], { stoneId: 'p1', vx: 0, vy: -ALKKAGI_MAX_SPEED });
    expect(byId(sim.stones, 'a1').alive).toBe(false);
    expect(byId(sim.stones, 'p1').alive).toBe(true);
    expect(byId(sim.stones, 'p1').y).toBeGreaterThan(20);
    expect(sim.knockedOut).toEqual(['a1']);
    expect(sim.hits.length).toBeGreaterThan(0);
    expect(sim.hits[0].y).toBeCloseTo(20 + ALKKAGI_RADIUS, 0);
  });

  it('chains collisions so one flick can knock out two stones', () => {
    const stones = [stone('p1', 50, 70), stone('a1', 50, 30), stone('a2', 50, 14)];
    const sim = simulateAlkkagiShot(stones, { stoneId: 'p1', vx: 0, vy: -ALKKAGI_MAX_SPEED });
    expect(sim.knockedOut).toContain('a2');
    expect(sim.hits.length).toBeGreaterThanOrEqual(2);
    expect(byId(sim.stones, 'a2').alive).toBe(false);
  });

  it('deflects both stones sideways on a glancing hit', () => {
    const sim = simulateAlkkagiShot([stone('p1', 50, 70), stone('a1', 58, 40)], { stoneId: 'p1', vx: 0, vy: -90 });
    expect(byId(sim.stones, 'a1').x).toBeGreaterThan(58);
    expect(byId(sim.stones, 'p1').x).toBeLessThan(50);
  });

  it('ignores stones that already left the board and unknown shooters', () => {
    const stones = [stone('p1', 50, 70), stone('a1', 50, 40, false)];
    const sim = simulateAlkkagiShot(stones, { stoneId: 'p1', vx: 0, vy: -70 });
    expect(sim.hits).toEqual([]);
    expect(byId(sim.stones, 'a1')).toEqual(stones[1]);
    const none = simulateAlkkagiShot(stones, { stoneId: 'p9', vx: 0, vy: -70 });
    expect(none.stones).toEqual(stones);
    expect(none.frames).toHaveLength(1);
  });

  it('is deterministic and always comes to rest from the opening position', () => {
    const shot = { stoneId: 'p2', vx: 12, vy: -ALKKAGI_MAX_SPEED };
    const first = simulateAlkkagiShot(createInitialAlkkagiStones(), shot);
    const second = simulateAlkkagiShot(createInitialAlkkagiStones(), shot);
    expect(first).toEqual(second);
    expect(first.frames.length).toBeLessThan(400);
  });

  it('turns a pull-back into a shot in the opposite direction, scaled by pull length', () => {
    const p1 = stone('p1', 50, 80);
    expect(shotFromPull([p1], p1, 0, ALKKAGI_MIN_PULL - 0.1)).toBeNull(); // 짧게 당기거나 되돌려 놓으면 취소
    expect(shotFromPull([p1], p1, 0, ALKKAGI_MIN_PULL)).not.toBeNull();
    const half = shotFromPull([p1], p1, 0, ALKKAGI_MAX_PULL / 2)!;
    expect(half.vx).toBeCloseTo(0);
    expect(half.vy).toBeCloseTo(-ALKKAGI_MAX_SPEED / 2);
    const capped = shotFromPull([p1], p1, ALKKAGI_MAX_PULL * 3, 0)!;
    expect(capped.vx).toBeCloseTo(-ALKKAGI_MAX_SPEED);
    expect(pullPower(0, ALKKAGI_MAX_PULL / 2)).toBeCloseTo(0.5);
    expect(pullPower(ALKKAGI_MAX_PULL * 3, 0)).toBe(1);
  });

  it('keeps the flicked stone rolling after a hit so it can reach a second stone', () => {
    const sim = simulateAlkkagiShot([stone('p1', 50, 70), stone('a1', 50, 50)], { stoneId: 'p1', vx: 0, vy: -80 });
    expect(byId(sim.stones, 'p1').y).toBeLessThan(50 + ALKKAGI_RADIUS * 2 - 3); // 맞힌 자리에서 더 나아갑니다
    expect(byId(sim.stones, 'a1').y).toBeLessThan(byId(sim.stones, 'p1').y);
  });

  it('pulls a slightly-off aim toward the opponent stone but leaves deliberate angles alone', () => {
    const p1 = stone('p1', 50, 80);
    const stones = [p1, stone('a1', 50, 30), stone('p2', 80, 80)];
    const off = (deg: number) => {
      const rad = (deg * Math.PI) / 180;
      const dir = assistAim(stones, p1, Math.sin(rad), -Math.cos(rad));
      return (Math.atan2(dir.dirX, -dir.dirY) * 180) / Math.PI;
    };
    expect(off(0)).toBeCloseTo(0);
    expect(off(3)).toBeCloseTo(0.75); // 3° 어긋남 → 0.75°
    expect(off(-6)).toBeCloseTo(-3);
    expect(off(8)).toBeLessThan(8);
    expect(off(8)).toBeGreaterThan(off(6)); // 더 틀면 더 비껴 갑니다(비껴 치기 가능)
    expect(off(ALKKAGI_ASSIST_DEG + 1)).toBeCloseTo(ALKKAGI_ASSIST_DEG + 1);
    expect(off(90)).toBeCloseTo(90); // 내 돌 쪽으로는 끌어당기지 않습니다
    const shot = shotFromPull(stones, p1, Math.tan((3 * Math.PI) / 180) * -20, 20)!;
    expect((Math.atan2(shot.vx, -shot.vy) * 180) / Math.PI).toBeCloseTo(0.75);
  });

  it('previews the first stone on the aim line and where it will be pushed', () => {
    const p1 = stone('p1', 50, 80);
    const stones = [p1, stone('a1', 50, 30), stone('a2', 50, 10), stone('a3', 90, 80, false)];
    const straight = predictFirstHit(stones, p1, 0, -1)!;
    expect(straight).toMatchObject({ targetId: 'a1', x: 50, y: 30 + ALKKAGI_RADIUS * 2 });
    expect(straight.targetDirX).toBeCloseTo(0);
    expect(straight.targetDirY).toBeCloseTo(-1);
    const glancing = predictFirstHit([p1, stone('a1', 57, 30)], p1, 0, -1)!;
    expect(glancing.targetDirX).toBeCloseTo(0.5); // 왼쪽을 스치면 오른쪽 위로 밀립니다
    expect(glancing.targetDirY).toBeLessThan(0);
    expect(predictFirstHit(stones, p1, 1, 0)).toBeNull(); // 판 밖으로 나간 돌은 맞지 않습니다
    expect(predictFirstHit(stones, p1, 0, 1)).toBeNull();
  });

  it('aims a button shot straight at the target stone', () => {
    const shot = shotToward(stone('p1', 20, 80), stone('a1', 50, 40), 1);
    expect(Math.hypot(shot.vx, shot.vy)).toBeCloseTo(ALKKAGI_MAX_SPEED);
    expect(shot.vx / shot.vy).toBeCloseTo(30 / -40);
    expect(shot.stoneId).toBe('p1');
  });
});
