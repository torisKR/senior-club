import { describe, expect, it } from 'vitest';

import {
  PARK_GOLF_HOLES, createInitialAlkkagiStones, createSacheonseongBoard, findFirstSacheonseongHint,
  findSacheonseongPath, hasAlkkagiProgress, shuffleSacheonseongBoard, simulateParkGolfShot,
} from './arcade-logic';
import { sacheonseongPathSegments } from './sacheonseong-layout';

describe('arcade game mechanics', () => {
  it('reflects on the actual bumper segment and leaves a shot outside the segment unaffected', () => {
    const hole = PARK_GOLF_HOLES[1];
    const bumperShot = simulateParkGolfShot(hole, { x: 28, y: 55 }, 0, 2);
    const noBumper = simulateParkGolfShot({ ...hole, bumper: undefined }, { x: 28, y: 55 }, 0, 2);
    expect(bumperShot.bouncedBumper).toBe(true);
    expect(bumperShot.finalPos.y).toBeGreaterThan(hole.bumper!.y1);
    expect(noBumper.finalPos.y).toBeLessThan(hole.bumper!.y1);
    expect(simulateParkGolfShot(hole, { x: 75, y: 55 }, 0, 2).bouncedBumper).toBe(false);
    expect(bumperShot.path.some((point) => point.y === hole.bumper!.y1)).toBe(true);
  });

  it('slows a ball inside the depicted bunker and only reports a hole when the simulated path enters the cup', () => {
    const hole = PARK_GOLF_HOLES[1];
    const bunker = simulateParkGolfShot(hole, { x: 50, y: 65 }, 0, 2);
    const clear = simulateParkGolfShot({ ...hole, bunker: { x: 500, y: 500, rx: 1, ry: 1 } }, { x: 50, y: 65 }, 0, 2);
    expect(bunker.hitBunker).toBe(true);
    expect(clear.hitBunker).toBe(false);
    expect(bunker.finalPos.y).toBeGreaterThan(clear.finalPos.y);
    const miss = simulateParkGolfShot(PARK_GOLF_HOLES[0], { x: 75, y: 45 }, 0, 2);
    expect(miss.holed).toBe(false);
    expect(miss.finalPos).not.toEqual(PARK_GOLF_HOLES[0].cup);
  });

  it.each([
    [0, [[0, 3], [15, 1]]],
    [1, [[5, 3], [5, 3]]],
    [2, [[0, 3], [15, 1]]],
  ] as const)('keeps free hole %i playable with the available direction and power buttons', (index, shots) => {
    const hole = PARK_GOLF_HOLES[index];
    let position = hole.tee;
    const results = shots.map(([angle, power]) => {
      const result = simulateParkGolfShot(hole, position, angle, power);
      position = result.finalPos;
      return result;
    });
    expect(results[0].holed).toBe(false);
    expect(results[results.length - 1].holed).toBe(true);
    expect(position).toEqual({ x: hole.cup.x, y: hole.cup.y });
  });

  it('recognizes a match as started only after a stone moves or leaves the board', () => {
    const stones = createInitialAlkkagiStones();
    expect(hasAlkkagiProgress(stones)).toBe(false);
    stones[0] = { ...stones[0], x: stones[0].x + 1 };
    expect(hasAlkkagiProgress(stones)).toBe(true);
  });

  it('maps outside-board paths into the visible gutter and keeps their bends orthogonal', () => {
    const board = createSacheonseongBoard(4, 6);
    const path = findSacheonseongPath(board, { row: 0, col: 0 }, { row: 1, col: 3 });
    expect(path).toBeNull();
    const segments = sacheonseongPathSegments([{ row: 0, col: 0 }, { row: -1, col: 0 }, { row: -1, col: 2 }, { row: 0, col: 2 }], 4, 6);
    expect(segments).toHaveLength(3);
    expect(segments[0].width).toBe(6);
    expect(segments[1].height).toBe(6);
    expect(segments[2].width).toBe(6);
    expect(segments[1].top).toBe(6);
  });

  it('shuffles without inventing or removing tiles and leaves a usable hint', () => {
    const board = createSacheonseongBoard(4, 6);
    board[0][0].motifId = null;
    board[0][1].motifId = null;
    const shuffled = shuffleSacheonseongBoard(board);
    const motifs = (value: typeof board) => value.flat().map((cell) => cell.motifId).filter(Boolean).sort();
    expect(motifs(shuffled)).toEqual(motifs(board));
    expect(shuffled[0][0].motifId).toBeNull();
    expect(shuffled[0][1].motifId).toBeNull();
    const hint = findFirstSacheonseongHint(shuffled);
    expect(hint).not.toBeNull();
    expect(findSacheonseongPath(shuffled, hint![0], hint![1])).not.toBeNull();
  });
});
