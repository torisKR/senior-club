import { describe, expect, it } from 'vitest';

import { rowRuns } from '../hud/minimap-runs';
import { busDestinations, getMap, MAPS, regionName } from './index';
import { buildPassGrid, isWalkable, mapHeight, mapWidth } from './tiles';

describe('maps', () => {
  it('keeps every map rectangular and every door walkable', () => {
    for (const map of Object.values(MAPS)) {
      for (const row of map.layout) expect(row).toHaveLength(mapWidth(map));
      for (const b of map.buildings) expect(isWalkable(map, b.door.x, b.door.y), `${map.id}:${b.id}`).toBe(true);
      expect(isWalkable(map, map.arrival.x, map.arrival.y), map.id).toBe(true);
      expect(buildPassGrid(map)).toHaveLength(mapWidth(map) * mapHeight(map));
    }
  });

  it('can reach every region, the bus stop and the observatory on foot from the village', () => {
    const map = getMap('field');
    const seen = new Set(['23,19']);
    const queue = [{ x: 23, y: 19 }];
    while (queue.length) {
      const { x, y } = queue.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const key = `${x + dx},${y + dy}`;
        if (seen.has(key) || !isWalkable(map, x + dx, y + dy)) continue;
        seen.add(key);
        queue.push({ x: x + dx, y: y + dy });
      }
    }
    for (const spot of [[27, 5], [10, 24], [57, 24], [57, 44], [6, 28], [36, 53], [48, 30]]) {
      expect(seen.has(`${spot[0]},${spot[1]}`), spot.join(',')).toBe(true);
    }
  });

  it('can reach every building entrance from the arrival point on each map', () => {
    for (const map of Object.values(MAPS)) {
      const seen = new Set([`${map.arrival.x},${map.arrival.y}`]);
      const queue = [map.arrival];
      for (let index = 0; index < queue.length; index += 1) {
        const { x, y } = queue[index];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          const key = `${nx},${ny}`;
          if (!seen.has(key) && isWalkable(map, nx, ny)) {
            seen.add(key);
            queue.push({ x: nx, y: ny });
          }
        }
      }
      for (const building of map.buildings) {
        expect(seen.has(`${building.door.x},${building.door.y}`), `${map.id}:${building.id}`).toBe(true);
      }
    }
  });

  it('names regions and links bus stops both ways', () => {
    expect(regionName('field', 27, 5)).toBe('숲 산책로');
    expect(regionName('field', 10, 24)).toBe('장터 거리');
    expect(regionName('field', 57, 24)).toBe('강변');
    expect(regionName('field', 30, 50)).toBe('꽃동산 언덕');
    expect(regionName('field', 30, 30)).toBe('청솔마을');
    expect(busDestinations('field').map((m) => m.id)).toEqual(['seaside']);
    expect(busDestinations('seaside').map((m) => m.id)).toEqual(['field']);
  });
});

describe('minimap rowRuns', () => {
  it('merges neighbouring tiles of the same colour', () => {
    expect(rowRuns('..==.')).toEqual([
      { color: '#5E9C4E', length: 2 }, { color: '#D9B98A', length: 2 }, { color: '#5E9C4E', length: 1 },
    ]);
  });
});
