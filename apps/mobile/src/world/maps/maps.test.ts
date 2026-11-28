import { describe, expect, it } from 'vitest';

import { rowRuns } from '../hud/minimap-runs';
import { busDestinations, getMap, MAP_IDS, MAP_REGIONS, MAPS, regionName } from './index';
import type { MapDef } from './map-types';
import { buildPassGrid, isWalkable, LEGEND, mapHeight, mapWidth, tileAt } from './tiles';

function reachableFromArrival(map: MapDef): Set<string> {
  const seen = new Set([`${map.arrival.x},${map.arrival.y}`]);
  const queue = [map.arrival];
  for (let index = 0; index < queue.length; index += 1) {
    const { x, y } = queue[index];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${x + dx},${y + dy}`;
      if (!seen.has(key) && isWalkable(map, x + dx, y + dy)) {
        seen.add(key);
        queue.push({ x: x + dx, y: y + dy });
      }
    }
  }
  return seen;
}

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
    // 솔숲 산길·오일장터가 생겨 네 지도가 서로 버스로 이어집니다.
    for (const from of MAP_IDS) {
      expect(busDestinations(from).map((m) => m.id)).toEqual(MAP_IDS.filter((id) => id !== from));
    }
    expect(MAP_IDS).toEqual(['field', 'seaside', 'mountain', 'market']);
  });
});

describe('솔숲 산길 · 오일장터', () => {
  const mountain = getMap('mountain');
  const market = getMap('market');

  it('is bigger than the seaside and uses only known map letters', () => {
    const seasideArea = mapWidth(getMap('seaside')) * mapHeight(getMap('seaside'));
    for (const map of [mountain, market]) {
      expect(mapWidth(map) * mapHeight(map)).toBeGreaterThan(seasideArea);
      for (const row of map.layout) for (const symbol of row) expect(LEGEND[symbol], `${map.id}:${symbol}`).toBeDefined();
    }
  });

  it('has no walkable tile cut off from the bus stop', () => {
    for (const map of [mountain, market]) {
      const seen = reachableFromArrival(map);
      for (let y = 0; y < mapHeight(map); y += 1) for (let x = 0; x < mapWidth(map); x += 1) {
        if (isWalkable(map, x, y)) expect(seen.has(`${x},${y}`), `${map.id}:${x},${y}`).toBe(true);
      }
    }
  });

  it('stands every neighbour on a reachable tile and gives each map one or two of them', () => {
    for (const map of [mountain, market]) {
      const seen = reachableFromArrival(map);
      expect(map.npcs.length).toBeGreaterThanOrEqual(1);
      expect(map.npcs.length).toBeLessThanOrEqual(2);
      for (const npc of map.npcs) {
        expect(seen.has(`${npc.x},${npc.y}`), npc.id).toBe(true);
        expect(map.buildings.some((b) => b.door.x === npc.x && b.door.y === npc.y), `${npc.id} blocks a door`).toBe(false);
        expect(npc.dialogue.length).toBeGreaterThanOrEqual(2);
      }
    }
    const npcIds = MAP_IDS.flatMap((id) => getMap(id).npcs.map((npc) => npc.id));
    expect(new Set(npcIds).size).toBe(npcIds.length);
  });

  it('arrives next to a bus stop that is not blocked by buildings', () => {
    for (const map of [mountain, market]) {
      const stop = map.buildings.find((b) => b.busStop)!;
      expect(Math.abs(stop.door.x - map.arrival.x) + Math.abs(stop.door.y - map.arrival.y)).toBe(1);
      expect(tileAt(map, map.arrival.x, map.arrival.y).type).not.toBe('building');
    }
  });

  it('opens the two new play entrances', () => {
    expect(market.buildings.find((b) => b.id === 'mk_toy')?.facilityRoute).toBe('/jegi');
    expect(mountain.buildings.find((b) => b.id === 'mt_pavilion')?.facilityRoute).toBe('/stones');
    expect(market.npcs.find((npc) => npc.facilityRoute === '/jegi')?.facilityLabel).toBeTruthy();
    expect(mountain.npcs.find((npc) => npc.facilityRoute === '/stones')?.facilityLabel).toBeTruthy();
  });

  it('offers walks worth taking: bridges, steps, benches, a fishing spot and dead-end secrets', () => {
    const count = (map: MapDef, symbol: string) => map.layout.join('').split(symbol).length - 1;
    expect(count(mountain, 'H')).toBeGreaterThanOrEqual(2); // 통나무 다리 두 곳
    expect(count(mountain, 's')).toBeGreaterThanOrEqual(6); // 돌계단 세 군데
    expect(count(mountain, 'b')).toBeGreaterThanOrEqual(3);
    expect(count(market, 'b')).toBeGreaterThanOrEqual(3);
    const seen = reachableFromArrival(mountain);
    const docks = mountain.layout.flatMap((row, y) => [...row].flatMap((symbol, x) => (symbol === 'K' ? [`${x},${y}`] : [])));
    expect(docks.length).toBeGreaterThan(0);
    for (const dock of docks) expect(seen.has(dock), dock).toBe(true);
    // 숨은 곳: 버섯 골(솔숲), 뒷골목 쉼터(장터)는 입구가 한 칸뿐입니다.
    expect(isWalkable(mountain, 12, 21)).toBe(true);
    expect(isWalkable(mountain, 12, 20) || isWalkable(mountain, 12, 22)).toBe(false);
    expect(isWalkable(market, 36, 23)).toBe(true);
    expect(isWalkable(market, 35, 23) || isWalkable(market, 37, 23)).toBe(false);
  });

  it('keeps cliff tiles in small clumps so the pattern does not repeat', () => {
    const seenCliff = new Set<string>();
    mountain.layout.forEach((row, y) => [...row].forEach((symbol, x) => {
      if (symbol !== 'R' || seenCliff.has(`${x},${y}`)) return;
      const clump = [{ x, y }];
      seenCliff.add(`${x},${y}`);
      for (let index = 0; index < clump.length; index += 1) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = clump[index].x + dx;
          const ny = clump[index].y + dy;
          if (mountain.layout[ny]?.[nx] === 'R' && !seenCliff.has(`${nx},${ny}`)) { seenCliff.add(`${nx},${ny}`); clump.push({ x: nx, y: ny }); }
        }
      }
      expect(clump.length, `${x},${y}`).toBeLessThanOrEqual(4);
    }));
  });

  it('names every walkable tile with a region and puts map labels inside the map', () => {
    expect(regionName('mountain', 5, 36)).toBe('산 들머리');
    expect(regionName('mountain', 21, 20)).toBe('솔숲 산길');
    expect(regionName('mountain', 20, 5)).toBe('산마루');
    expect(regionName('mountain', 41, 10)).toBe('산골 계곡');
    expect(regionName('market', 4, 5)).toBe('장터 들머리');
    expect(regionName('market', 19, 17)).toBe('오일장터');
    expect(regionName('market', 10, 26)).toBe('장터 뒤뜰');
    expect(regionName('market', 35, 26)).toBe('뒷골목 쉼터');
    for (const map of [mountain, market]) {
      expect(MAP_REGIONS[map.id].length).toBeGreaterThan(0);
      for (const region of MAP_REGIONS[map.id]) {
        expect(region.x).toBeLessThan(mapWidth(map));
        expect(region.y).toBeLessThan(mapHeight(map));
        expect(regionName(map.id, region.x, region.y)).toBe(region.name);
      }
    }
  });
});

describe('minimap rowRuns', () => {
  it('merges neighbouring tiles of the same colour', () => {
    expect(rowRuns('..==.')).toEqual([
      { color: '#5E9C4E', length: 2 }, { color: '#D9B98A', length: 2 }, { color: '#5E9C4E', length: 1 },
    ]);
  });
});
