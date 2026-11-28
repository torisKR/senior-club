import { describe, expect, it } from 'vitest';

import { DEX, FORAGE, forageSpawns, PHOTO_SPOTS, photoSpotAt } from './explore';
import { createLife, gainItem, hasDiscovered, isForaged, markForaged, normalizeLife, takePhoto } from './life';
import { getMap, regionName } from './maps';
import { isWalkable, tileAt } from './maps/tiles';

function reachable(map: ReturnType<typeof getMap>): Set<string> {
  const queue = [map.arrival];
  const seen = new Set([`${map.arrival.x},${map.arrival.y}`]);
  for (let index = 0; index < queue.length; index += 1) {
    const { x, y } = queue[index];
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const next = { x: x + dx, y: y + dy };
      const key = `${next.x},${next.y}`;
      if (!seen.has(key) && isWalkable(map, next.x, next.y)) { seen.add(key); queue.push(next); }
    }
  }
  return seen;
}

describe('new map finds and photo spots', () => {
  const expected = {
    mountain: { count: 8 + 4 + 6, items: { '솔숲 산길': ['mushroom', 'pinecone', 'chestnut'], 산마루: ['pinecone', 'chestnut'], '산골 계곡': ['pebble', 'watercress'] } },
    market: { count: 5, items: { '장터 뒤뜰': ['dandelion', 'violet'] } },
  } as const;

  it('spawns reachable, stable finds in the forage zones of the mountain and the market', () => {
    for (const mapId of ['mountain', 'market'] as const) {
      const map = getMap(mapId);
      const seen = reachable(map);
      for (let day = 1; day <= 30; day += 1) {
        const date = `2026-11-${String(day).padStart(2, '0')}`;
        const spawns = forageSpawns(map, date);
        expect(spawns).toHaveLength(expected[mapId].count);
        expect(forageSpawns(map, date)).toEqual(spawns);
        expect(new Set(spawns.map((spawn) => spawn.key)).size).toBe(spawns.length);
        for (const spawn of spawns) {
          expect(seen.has(spawn.key), `${mapId}:${spawn.key}`).toBe(true);
          const allowed: readonly string[] = (expected[mapId].items as Record<string, readonly string[]>)[regionName(mapId, spawn.x, spawn.y)] ?? [];
          expect(allowed, `${mapId}:${spawn.key}`).toContain(spawn.itemId);
        }
      }
    }
  });

  it('has a reachable photo spot on every map without growing the item dex', () => {
    for (const mapId of ['field', 'seaside', 'mountain', 'market'] as const) {
      const spots = PHOTO_SPOTS.filter((spot) => spot.mapId === mapId);
      expect(spots.length, mapId).toBeGreaterThanOrEqual(1);
      const seen = reachable(getMap(mapId));
      for (const spot of spots) expect(seen.has(`${spot.x},${spot.y}`), spot.id).toBe(true);
    }
    expect(new Set(PHOTO_SPOTS.map((spot) => spot.id)).size).toBe(PHOTO_SPOTS.length);
    expect(DEX).toHaveLength(6 + 3 + 8);
  });

  it('keeps an old album and bag when new photo spots are added', () => {
    const life = normalizeLife({ photos: [{ spotId: 'hill', day: '2026-11-01' }], items: { pebble: 2 }, discovered: ['pebble'] });
    expect(life.photos).toEqual([{ spotId: 'hill', day: '2026-11-01' }]);
    expect(takePhoto(life, 'valley', '2026-11-28')).toMatchObject({ isNew: true });
    expect(photoSpotAt('mountain', 43, 10)?.id).toBe('valley');
    expect(photoSpotAt('market', 19, 19)?.id).toBe('fair');
  });
});

describe('forageSpawns', () => {
  const field = getMap('field');

  it('places the same items in the same spots all day, and moves them the next day', () => {
    const a = forageSpawns(field, '2026-11-12');
    expect(forageSpawns(field, '2026-11-12')).toEqual(a);
    expect(forageSpawns(field, '2026-11-13')).not.toEqual(a);
  });

  it('puts each item on walkable ground of its own region', () => {
    const spawns = forageSpawns(field, '2026-11-12');
    expect(spawns).toHaveLength(9 + 6 + 9);
    expect(new Set(spawns.map((s) => s.key)).size).toBe(spawns.length);
    for (const spawn of spawns) {
      expect(isWalkable(field, spawn.x, spawn.y)).toBe(true);
      expect(regionName('field', spawn.x, spawn.y)).toBe(FORAGE[spawn.itemId].region);
    }
    const forest = spawns.filter((s) => FORAGE[s.itemId].region === '숲 산책로');
    for (const spawn of forest) expect(tileAt(field, spawn.x, spawn.y).type).toBe('forest');
  });

  it('keeps the four-leaf clover rare over a month', () => {
    let clovers = 0;
    let flowers = 0;
    for (let d = 1; d <= 30; d += 1) {
      for (const s of forageSpawns(field, `2026-11-${String(d).padStart(2, '0')}`)) {
        if (FORAGE[s.itemId].region !== '꽃동산 언덕') continue;
        flowers += 1;
        if (s.itemId === 'clover') clovers += 1;
      }
    }
    expect(clovers).toBeGreaterThan(0);
    expect(clovers / flowers).toBeLessThan(0.2);
  });

  it('places each daily find in an area reachable from arrival', () => {
    const seen = reachable(field);
    for (let d = 1; d <= 30; d += 1) for (const spawn of forageSpawns(field, `2026-11-${String(d).padStart(2, '0')}`)) {
      expect(seen.has(`${spawn.x},${spawn.y}`), `${d}:${spawn.key}`).toBe(true);
    }
  });

  it('places reachable pebbles on the beach and keeps their positions stable for the day', () => {
    const map = getMap('seaside');
    const seen = reachable(map);
    for (let day = 1; day <= 30; day += 1) {
      const date = `2026-11-${String(day).padStart(2, '0')}`;
      const spawns = forageSpawns(map, date);
      expect(spawns).toHaveLength(6);
      expect(forageSpawns(map, date)).toEqual(spawns);
      expect(new Set(spawns.map((spawn) => spawn.key)).size).toBe(6);
      for (const spawn of spawns) {
        expect(spawn.itemId).toBe('pebble');
        expect(map.layout[spawn.y][spawn.x]).toBe('d');
        expect(seen.has(spawn.key), spawn.key).toBe(true);
      }
    }
  });
});

describe('photo spots', () => {
  it('stand on walkable tiles and trigger from the spot or right next to it', () => {
    for (const spot of PHOTO_SPOTS) expect(isWalkable(getMap(spot.mapId), spot.x, spot.y), spot.id).toBe(true);
    expect(photoSpotAt('field', 36, 54)?.id).toBe('hill');
    expect(photoSpotAt('field', 37, 54)?.id).toBe('hill');
    expect(photoSpotAt('field', 38, 54)).toBeUndefined();
    expect(photoSpotAt('seaside', 36, 54)).toBeUndefined();
  });

  it('allows reaching every photo spot from its map arrival', () => {
    for (const spot of PHOTO_SPOTS) expect(reachable(getMap(spot.mapId)).has(`${spot.x},${spot.y}`), spot.id).toBe(true);
  });
});

describe('bag, dex and album', () => {
  it('registers a first find once and keeps counting', () => {
    const first = gainItem(createLife(), 'mushroom');
    expect(first.isNew).toBe(true);
    const second = gainItem(first.life, 'mushroom');
    expect(second.isNew).toBe(false);
    expect(second.life.items.mushroom).toBe(2);
    expect(hasDiscovered(second.life, 'mushroom')).toBe(true);
  });

  it('lets each spot be picked once a day', () => {
    const picked = markForaged(createLife(), '2026-11-12', 'field:30,5')!;
    expect(isForaged(picked, '2026-11-12', 'field:30,5')).toBe(true);
    expect(markForaged(picked, '2026-11-12', 'field:30,5')).toBeNull();
    expect(isForaged(picked, '2026-11-13', 'field:30,5')).toBe(false);
    expect(markForaged(picked, '2026-11-13', 'field:31,5')!.foraged).toEqual({ day: '2026-11-13', keys: ['field:31,5'] });
  });

  it('keeps one photo per spot with the latest day', () => {
    const one = takePhoto(createLife(), 'hill', '2026-11-12');
    expect(one.isNew).toBe(true);
    const again = takePhoto(one.life, 'hill', '2026-11-13');
    expect(again.isNew).toBe(false);
    expect(again.life.photos).toEqual([{ spotId: 'hill', day: '2026-11-13' }]);
  });

  it('cleans tampered bag data from a save', () => {
    const life = normalizeLife({
      items: { mushroom: 3, 'bad id': 5, pebble: -1, clover: 1e9 },
      discovered: ['mushroom', 'mushroom', 7],
      foraged: { day: '2026-11-12', keys: ['field:1,2', 'nope'] },
      photos: [{ spotId: 'hill', day: '2026-11-12' }, { spotId: 'x', day: 'later' }],
    });
    expect(life.items).toEqual({ mushroom: 3, clover: 9999 });
    expect(life.discovered).toEqual(['mushroom']);
    expect(life.foraged).toEqual({ day: '2026-11-12', keys: ['field:1,2'] });
    expect(life.photos).toEqual([{ spotId: 'hill', day: '2026-11-12' }]);
  });

  it('lists fish, crops and forage in the dex without duplicates', () => {
    expect(new Set(DEX.map((e) => e.id)).size).toBe(DEX.length);
    expect(DEX).toHaveLength(6 + 3 + 8);
  });
});
