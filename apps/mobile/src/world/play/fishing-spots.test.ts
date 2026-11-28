import { describe, expect, it } from 'vitest';

import { MAP_IDS, getMap } from '../maps';
import type { MapDef } from '../maps/map-types';
import { isWalkable, tileAt } from '../maps/tiles';
import { canFishAt } from './fishing';
import { fishingSpots, MIN_SPOT_GAP } from './fishing-spots';

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const neighborTypes = (map: MapDef, x: number, y: number) => NEIGHBORS.map(([dx, dy]) => tileAt(map, x + dx, y + dy).type);
const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

describe('낚시 표식 자리', () => {
  it.each(MAP_IDS)('marks three to five walkable waterside tiles on %s where fishing really opens', (mapId) => {
    const map = getMap(mapId);
    const spots = fishingSpots(map);
    expect(spots.length).toBeGreaterThanOrEqual(3);
    expect(spots.length).toBeLessThanOrEqual(5);
    for (const spot of spots) {
      expect(isWalkable(map, spot.x, spot.y)).toBe(true);
      expect(tileAt(map, spot.x, spot.y).type).not.toBe('dock');
      expect(canFishAt(tileAt(map, spot.x, spot.y).type, neighborTypes(map, spot.x, spot.y))).toBe(true);
    }
  });

  it.each(MAP_IDS)('spreads the marks out on %s instead of bunching them together', (mapId) => {
    const spots = fishingSpots(getMap(mapId));
    for (let i = 0; i < spots.length; i += 1) {
      for (let j = i + 1; j < spots.length; j += 1) expect(gap(spots[i], spots[j])).toBeGreaterThanOrEqual(MIN_SPOT_GAP);
    }
  });

  it('gives the same places every time', () => {
    const map = getMap('field');
    expect(fishingSpots({ ...map })).toEqual(fishingSpots({ ...map }));
    expect(fishingSpots(map)).toBe(fishingSpots(map));
  });

  it('marks nothing on a map without water', () => {
    const dry: MapDef = { ...getMap('field'), layout: ['....', '....'], buildings: [] };
    expect(fishingSpots(dry)).toEqual([]);
  });
});

describe('새 지도의 낚시', () => {
  it('opens fishing on the mountain dock and on the stream banks', () => {
    const map = getMap('mountain');
    expect(tileAt(map, 37, 30).type).toBe('dock');
    expect(canFishAt('dock', neighborTypes(map, 37, 30))).toBe(true);
    expect(tileAt(map, 36, 20).type).toBe('water'); // 계곡물도 물로 셉니다
    expect(canFishAt(tileAt(map, 36, 35).type, neighborTypes(map, 36, 35))).toBe(true); // 통나무 다리 위
    expect(canFishAt(tileAt(map, 39, 31).type, neighborTypes(map, 39, 31))).toBe(true); // 소 옆 물가
    expect(canFishAt(tileAt(map, 21, 20).type, neighborTypes(map, 21, 20))).toBe(false); // 쉼터 한가운데
  });

  it('opens fishing beside the market backyard pond only', () => {
    const map = getMap('market');
    expect(canFishAt(tileAt(map, 15, 28).type, neighborTypes(map, 15, 28))).toBe(true);
    expect(canFishAt(tileAt(map, 19, 19).type, neighborTypes(map, 19, 19))).toBe(false);
    for (const spot of fishingSpots(map)) expect(spot.y).toBeGreaterThanOrEqual(24);
  });
});
