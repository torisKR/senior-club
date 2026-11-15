import { describe, expect, it } from 'vitest';

import { MAPS } from '../maps';
import { buildPassGrid, mapHeight, mapWidth } from '../maps/tiles';
import { CHUNK_TILES, isOpen } from '../movement/motion';
import { boundaryEdges } from './boundary-edges';

describe('boundary edges', () => {
  it('marks exactly the blocked neighbours of every walkable tile, including chunk and map edges', () => {
    for (const map of Object.values(MAPS)) {
      const grid = { cells: buildPassGrid(map), width: mapWidth(map), height: mapHeight(map) };
      const drawn = new Map<string, boolean[]>();
      for (let cy = 0; cy < Math.ceil(grid.height / CHUNK_TILES); cy += 1) {
        for (let cx = 0; cx < Math.ceil(grid.width / CHUNK_TILES); cx += 1) {
          for (const edge of boundaryEdges(grid, cx, cy, CHUNK_TILES)) {
            for (let x = edge.x; x < edge.x + edge.length; x += 1) {
              expect(drawn.has(`${x},${edge.y}`)).toBe(false);
              drawn.set(`${x},${edge.y}`, [edge.top, edge.bottom, edge.left, edge.right]);
            }
          }
        }
      }
      for (let y = 0; y < grid.height; y += 1) for (let x = 0; x < grid.width; x += 1) {
        if (!isOpen(grid, x, y)) continue;
        const expected = [!isOpen(grid, x, y - 1), !isOpen(grid, x, y + 1), !isOpen(grid, x - 1, y), !isOpen(grid, x + 1, y)];
        expect(drawn.get(`${x},${y}`) ?? [false, false, false, false], `${map.id}:${x},${y}`).toEqual(expected);
      }
    }
  });

  it('combines a straight shoreline without merging its corners', () => {
    const grid = { width: 6, height: 3, cells: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] };
    const shoreline = boundaryEdges(grid, 0, 0, 8).filter((edge) => edge.y === 1);
    expect(shoreline.map((edge) => edge.length)).toEqual([1, 4, 1]);
    expect(shoreline.every((edge) => edge.top)).toBe(true);
  });

  it('marks water only on blocked sides and keeps mixed shore and wall segments distinct', () => {
    const grid = { width: 6, height: 3, cells: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] };
    const edges = boundaryEdges(grid, 0, 0, 8, (x, y) => y === 0 && x < 3).filter((edge) => edge.y === 1);
    const top = new Map<number, boolean>();
    for (const edge of edges) for (let x = edge.x; x < edge.x + edge.length; x += 1) top.set(x, edge.topWater);
    expect([...top.values()]).toEqual([true, true, true, false, false, false]);
    expect(edges.every((edge) => !edge.bottomWater && !edge.leftWater && !edge.rightWater)).toBe(true);
    expect(edges.some((edge) => edge.x === 1 && edge.length === 2)).toBe(true);
    expect(edges.some((edge) => edge.x === 3 && edge.length === 2)).toBe(true);
  });
});
