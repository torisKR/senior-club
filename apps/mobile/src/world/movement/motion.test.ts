import { describe, expect, it } from 'vitest';

import { buildPassGrid } from '../maps/tiles';
import { FIELD_MAP } from '../maps/field';
import { boxFits, cameraOrigin, chunkBoundsForViewport, chunkRadiiForViewport, facingFor, hitBoundary, isNearVisibleChunks, isRectNearVisibleChunks, MAX_FRAME_SECONDS, nextWalkStrength, PLAYER_RADIUS, stepMotion, visibleChunks, WALK_SPEED, type PassGrid } from './motion';

// 0 = 벽, 1 = 길.  가운데 세로 벽이 있는 5x3 방
const room: PassGrid = {
  width: 5,
  height: 3,
  cells: [
    1, 1, 0, 1, 1,
    1, 1, 0, 1, 1,
    1, 1, 1, 1, 1,
  ],
};

describe('stepMotion', () => {
  it('walks at WALK_SPEED tiles per second in open ground', () => {
    const next = stepMotion(room, 0.5, 2.5, 1, 0, 0.02);
    expect(next.x).toBeCloseTo(0.5 + WALK_SPEED * 0.02);
    expect(next.y).toBe(2.5);
  });

  it('does not go faster diagonally', () => {
    const next = stepMotion(room, 0.5, 0.5, 1, 1, 0.02);
    expect(Math.hypot(next.x - 0.5, next.y - 0.5)).toBeCloseTo(WALK_SPEED * 0.02);
  });

  it('stops at a wall but slides along it when pushing diagonally', () => {
    // 벽(x=2) 바로 왼쪽에서 오른쪽 아래로 밀면 x 는 막히고 y 만 움직입니다.
    const start = { x: 1.69, y: 0.5 };
    const next = stepMotion(room, start.x, start.y, 1, 1, 0.02);
    expect(next.x).toBeGreaterThanOrEqual(start.x);
    expect(next.x).toBeLessThan(1.7);
    expect(next.y).toBeGreaterThan(start.y);
  });

  it('caps a long frame so a hitch cannot tunnel through walls', () => {
    const next = stepMotion(room, 1.5, 0.5, 1, 0, 5);
    expect(next.x).toBeLessThanOrEqual(1.5 + WALK_SPEED * MAX_FRAME_SECONDS);
    expect(next.x).toBeLessThan(2 - 0.3 + 1e-9);
  });

  it('stays still without input', () => {
    expect(stepMotion(room, 1.5, 1.5, 0, 0, 0.02)).toEqual({ x: 1.5, y: 1.5 });
  });

  it('never leaves the map edge', () => {
    const next = stepMotion(room, 0.31, 0.5, -1, 0, 0.05);
    expect(next.x).toBeGreaterThanOrEqual(0.3);
  });
});

describe('walk acceleration', () => {
  it('accelerates smoothly and stays consistent across frame rates', () => {
    const run = (dt: number, steps: number) => {
      let strength = 0;
      for (let i = 0; i < steps; i += 1) strength = nextWalkStrength(strength, 1, dt);
      return strength;
    };
    const first = nextWalkStrength(0, 1, 1 / 60);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(1);
    expect(run(1 / 60, 6)).toBeCloseTo(run(1 / 30, 3), 8);
    expect(run(1 / 60, 30)).toBeLessThanOrEqual(1);
  });

  it('responds immediately to release or a smaller joystick input', () => {
    expect(nextWalkStrength(0.9, 0, 1 / 60)).toBe(0);
    expect(nextWalkStrength(0.9, 0.3, 1 / 60)).toBe(0.3);
    expect(nextWalkStrength(0, 1, 0)).toBe(0);
  });
});

describe('boundary feedback detection', () => {
  it('detects a wall even while the player slides along it', () => {
    const start = { x: 1.69, y: 0.5 };
    const next = stepMotion(room, start.x, start.y, 1, 1, 0.02);
    expect(hitBoundary(start.x, start.y, next.x, next.y, 1, 1, 0.02)).toBe(true);
  });

  it('does not report a collision for open movement, no input, or a zero frame', () => {
    const next = stepMotion(room, 0.5, 2.5, 1, 0.5, 0.02);
    expect(hitBoundary(0.5, 2.5, next.x, next.y, 1, 0.5, 0.02)).toBe(false);
    expect(hitBoundary(0.5, 2.5, 0.5, 2.5, 0, 0, 0.02)).toBe(false);
    expect(hitBoundary(0.5, 2.5, 0.5, 2.5, 1, 0, 0)).toBe(false);
  });
});

describe('corner assist', () => {
  // 위쪽 줄에 기둥 하나(1,0) — 2번째 줄을 위쪽 가장자리로 걸으면 모서리에 걸리던 자리
  const corridor: PassGrid = {
    width: 4,
    height: 3,
    cells: [
      1, 0, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1,
    ],
  };

  it('slides toward the middle of the row instead of snagging on a corner', () => {
    let pos = { x: 0.5, y: 1.25 };
    for (let i = 0; i < 40; i += 1) pos = stepMotion(corridor, pos.x, pos.y, 1, 0, 0.03);
    expect(pos.x).toBeGreaterThan(2.5);
  });

  it('does not slide when the player is steering on the other axis on purpose', () => {
    const before = { x: 0.69, y: 0.5 };
    const next = stepMotion(corridor, before.x, before.y, 1, 0.5, 0.03);
    expect(next.x).toBeLessThan(0.7);
    expect(next.y).toBeGreaterThan(before.y);
  });

  it('limits corner assist to the distance requested by a gentle input', () => {
    const before = { x: 0.699, y: 1.25 };
    const next = stepMotion(corridor, before.x, before.y, 0.05, 0, 0.05);
    expect(next.y).toBeGreaterThan(before.y);
    expect(next.y - before.y).toBeLessThanOrEqual(WALK_SPEED * 0.05 * 0.05 + 1e-8);
    expect(next.x).toBeLessThan(0.7);
  });

  it('approaches a wall consistently at different frame durations', () => {
    const advance = (dt: number) => {
      let pos = { x: 1.2, y: 0.5 };
      for (let i = 0; i < 120; i += 1) pos = stepMotion(room, pos.x, pos.y, 1, 0, dt);
      return pos.x;
    };
    expect(advance(1 / 30)).toBeCloseTo(1.7, 3);
    expect(advance(1 / 60)).toBeCloseTo(1.7, 3);
  });
});

describe('collision safety across small maps', () => {
  it('keeps every valid starting box out of walls under varied inputs', () => {
    const inputs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [0.05, 0], [0, 0.05]];
    for (let mask = 1; mask < 512; mask += 1) {
      const grid = { width: 3, height: 3, cells: Array.from({ length: 9 }, (_, bit) => (mask >> bit) & 1) };
      for (let tile = 0; tile < 9; tile += 1) for (const offsetX of [-0.29, -0.19, 0, 0.19, 0.29]) for (const offsetY of [-0.29, -0.19, 0, 0.19, 0.29]) {
        const x = tile % 3 + 0.5 + offsetX;
        const y = Math.floor(tile / 3) + 0.5 + offsetY;
        if (!boxFits(grid, x, y, PLAYER_RADIUS)) continue;
        for (const [vx, vy] of inputs) {
          const next = stepMotion(grid, x, y, vx, vy, 0.05);
          if (!boxFits(grid, next.x, next.y, PLAYER_RADIUS)) {
            throw new Error(`wall overlap: ${JSON.stringify({ mask, x, y, vx, vy, next })}`);
          }
        }
      }
    }
  });
});

describe('facingFor', () => {
  it('prefers the side view on diagonals', () => {
    expect(facingFor(0.7, 0.7)).toBe('right');
    expect(facingFor(-0.2, 0.9)).toBe('down');
    expect(facingFor(0, -1)).toBe('up');
    expect(facingFor(0, 0)).toBeNull();
  });
});

describe('visibleChunks', () => {
  it('covers the viewport at map edges and during panel transitions with a smaller padded range', () => {
    const size = 48;
    for (const [width, height] of [[320, 568], [393, 852], [1024, 768], [1500, 1000]]) {
      for (let y = 0; y < 56; y += 1) for (let x = 0; x < 64; x += 1) {
        const bounds = chunkBoundsForViewport(x, y, width, height, size, 64, 56);
        for (const focus of [0.27, 0.38, 0.5]) for (const offset of [0, 0.5, 1]) {
          const origin = cameraOrigin((x + offset) * size, (y + offset) * size, width, height, 64 * size, 56 * size, focus);
          const left = Math.floor(origin.x / (8 * size));
          const right = Math.floor(Math.min(64 * size - 0.01, origin.x + width - 0.01) / (8 * size));
          const top = Math.floor(origin.y / (8 * size));
          const bottom = Math.floor(Math.min(56 * size - 0.01, origin.y + height - 0.01) / (8 * size));
          expect(bounds.left <= left && bounds.right >= right && bounds.top <= top && bounds.bottom >= bottom,
            `${width}x${height} at ${x},${y} focus ${focus}`).toBe(true);
        }
      }
    }
    const b = chunkBoundsForViewport(32, 32, 393, 852, 48, 64, 56);
    expect((b.right - b.left + 1) * (b.bottom - b.top + 1)).toBeLessThan(15);
  });
  it('lists the chunks around the camera, clipped to the map', () => {
    expect(visibleChunks(0, 0, 1, 1, 8, 7)).toEqual([
      { cx: 0, cy: 0 }, { cx: 1, cy: 0 }, { cx: 0, cy: 1 }, { cx: 1, cy: 1 },
    ]);
    expect(visibleChunks(4, 3, 1, 2, 8, 7)).toHaveLength(15);
  });

  it('keeps nearby overhanging sprites and excludes distant characters', () => {
    const chunks = [{ cx: 1, cy: 1 }];
    expect(isNearVisibleChunks(6, 8, chunks)).toBe(true);
    expect(isNearVisibleChunks(17, 17, chunks)).toBe(true);
    expect(isNearVisibleChunks(18, 8, chunks)).toBe(false);
    expect(isNearVisibleChunks(8, 18, chunks)).toBe(false);
  });

  it('keeps a building whenever any part of its roof or footprint overlaps the padded visible area', () => {
    const chunks = [{ cx: 1, cy: 1 }];
    expect(isRectNearVisibleChunks(4, 8, 3, 3, chunks)).toBe(true);
    expect(isRectNearVisibleChunks(8, 4, 3, 3, chunks)).toBe(true);
    expect(isRectNearVisibleChunks(18, 8, 3, 3, chunks)).toBe(false);
    expect(isRectNearVisibleChunks(8, 18, 3, 3, chunks)).toBe(false);
    expect(isRectNearVisibleChunks(4, 4, 2, 2, chunks)).toBe(false);
    expect(isRectNearVisibleChunks(8, 8, 2, 2, [])).toBe(false);
  });

  it('covers the camera at map edges and with the activity panel on phones and wide screens', () => {
    const tileSize = 48;
    const mapWidth = 64 * tileSize;
    const mapHeight = 56 * tileSize;
    for (const [width, height] of [[320, 568], [393, 852], [1024, 768], [1500, 1000]]) {
      const radius = chunkRadiiForViewport(width, height, tileSize);
      if (width === 393) expect(radius).toEqual({ x: 1, y: 2 });
      for (let y = 0; y < 56; y += 1) for (let x = 0; x < 64; x += 1) {
        const chunks = visibleChunks(Math.floor(x / 8), Math.floor(y / 8), radius.x, radius.y, 8, 7);
        for (const focus of [0.27, 0.5]) for (const offset of [0.3, 0.7]) {
          const origin = cameraOrigin((x + offset) * tileSize, (y + offset) * tileSize, width, height, mapWidth, mapHeight, focus);
          for (const px of [origin.x, Math.min(mapWidth - 0.01, origin.x + width - 0.01)]) {
            for (const py of [origin.y, Math.min(mapHeight - 0.01, origin.y + height - 0.01)]) {
              if (py >= mapHeight) continue;
              const cx = Math.floor(px / (8 * tileSize));
              const cy = Math.floor(py / (8 * tileSize));
              expect(chunks.some((chunk) => chunk.cx === cx && chunk.cy === cy), `${width}x${height} at ${x},${y} focus ${focus}`).toBe(true);
            }
          }
        }
      }
    }
  });
});

describe('cameraOrigin', () => {
  it('centres the player and clamps to the map edges', () => {
    expect(cameraOrigin(1000, 1000, 400, 800, 3072, 2688, 0.5)).toEqual({ x: 800, y: 600 });
    expect(cameraOrigin(10, 10, 400, 800, 3072, 2688, 0.5)).toEqual({ x: 0, y: 0 });
    expect(cameraOrigin(3070, 2680, 400, 800, 3072, 2688, 0.5)).toEqual({ x: 2672, y: 1888 });
  });

  it('may scroll past the bottom edge when the player is lifted above a panel', () => {
    // 평소 바닥 한계 1888 보다 화면 높이 x (0.5 - 0.25) = 200 만큼 더 내려갑니다.
    expect(cameraOrigin(1000, 2680, 400, 800, 3072, 2688, 0.25).y).toBe(1888 + 200);
  });
});

describe('open field', () => {
  it('walks across the stone bridge from the village to the riverside', () => {
    const map = { cells: buildPassGrid(FIELD_MAP), width: 64, height: 56 };
    let pos = { x: 44.5, y: 23.5 };
    for (let i = 0; i < 100; i += 1) pos = stepMotion(map, pos.x, pos.y, 1, 0, 0.03);
    expect(pos.x).toBeGreaterThan(53);
  });
});
