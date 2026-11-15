import type { VillageTile } from '@/rpg/rpg-types';

import type { MapDef } from '../maps/map-types';
import { isDoorTile, mapHeight, mapWidth, tileAt } from '../maps/tiles';

/** TILE_SPRITES 의 키 */
export type TileSpriteKey =
  | 'grass' | 'path' | 'water' | 'fence' | 'pine' | 'cherry' | 'lantern' | 'flower'
  | 'dock' | 'farm' | 'bench' | 'forest' | 'bush' | 'bridge' | 'flowersYellow' | 'flowersPurple'
  | 'rock' | 'well' | 'table' | 'firewood' | 'signpost';

export interface TileVisual {
  base: TileSpriteKey;
  decor: TileSpriteKey | null;
}

const DECOR: Partial<Record<VillageTile['type'], TileSpriteKey>> = {
  fence: 'fence', lantern: 'lantern', flower: 'flower', dock: 'dock', farm: 'farm', bench: 'bench',
  bush: 'bush', rock: 'rock', well: 'well', table: 'table', firewood: 'firewood', signpost: 'signpost',
};

function decorFor(tile: VillageTile): TileSpriteKey | null {
  if (tile.type === 'tree') return tile.variant === 'cherry' ? 'cherry' : 'pine';
  return DECOR[tile.type] ?? null;
}

function ownBase(tile: VillageTile): TileSpriteKey | null {
  switch (tile.type) {
    case 'path': return 'path';
    case 'water':
    case 'dock': return 'water';
    case 'bridge': return 'bridge';
    case 'forest': return 'forest';
    case 'flowerfield': return tile.variant === 'purple' ? 'flowersPurple' : 'flowersYellow';
    case 'grass': return 'grass';
    default: return null;
  }
}

/**
 * 지도 전체의 칸별 그림(바닥 + 장식)을 한 번 계산합니다.
 * 나무·덤불처럼 바닥이 없는 칸은 이웃 바닥(숲 바닥·모래 등)을 따라 깝니다.
 */
export function computeTileVisuals(map: MapDef): TileVisual[] {
  const width = mapWidth(map);
  const height = mapHeight(map);
  const tiles: VillageTile[] = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) tiles.push(tileAt(map, x, y));
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? null : tiles[y * width + x]);
  return tiles.map((tile) => {
    // 건물 출입 칸은 충돌 격자에서 열려 있으므로 바닥도 길로 보여 줍니다.
    if (tile.type === 'building' && isDoorTile(map, tile.x, tile.y)) return { base: 'path', decor: null };
    const own = ownBase(tile);
    if (own) return { base: own, decor: decorFor(tile) };
    // 바닥이 없는 칸(나무·바위·벤치 등)은 이웃 바닥 중 가장 많은 것을 깝니다(물은 제외).
    const counts = new Map<TileSpriteKey, number>();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const neighbour = at(tile.x + dx, tile.y + dy);
      const base = neighbour ? ownBase(neighbour) : null;
      if (base && base !== 'water') counts.set(base, (counts.get(base) ?? 0) + 1);
    }
    let base: TileSpriteKey = 'grass';
    let best = 0;
    for (const [key, count] of counts) if (count > best || (count === best && key === 'grass')) { best = count; base = key; }
    return { base, decor: decorFor(tile) };
  });
}

const cache = new WeakMap<MapDef, TileVisual[]>();
export function tileVisualsFor(map: MapDef): TileVisual[] {
  let visuals = cache.get(map);
  if (!visuals) {
    visuals = computeTileVisuals(map);
    cache.set(map, visuals);
  }
  return visuals;
}

/**
 * 청크 한 장을 그릴 그림 목록: 가장 많은 바닥은 반복 이미지 한 장으로 깔고,
 * 다른 바닥과 장식만 칸마다 그립니다.
 */
type ChunkLayers = { dominant: TileSpriteKey; cells: { x: number; y: number; base: TileSpriteKey | null; decor: TileSpriteKey | null }[] };
const chunkCache = new WeakMap<MapDef, Map<string, ChunkLayers>>();

export function chunkLayers(
  map: MapDef,
  cx: number,
  cy: number,
  chunkTiles: number,
): ChunkLayers {
  let chunks = chunkCache.get(map);
  if (!chunks) {
    chunks = new Map();
    chunkCache.set(map, chunks);
  }
  const key = `${cx}:${cy}:${chunkTiles}`;
  const cached = chunks.get(key);
  if (cached) return cached;
  const visuals = tileVisualsFor(map);
  const width = mapWidth(map);
  const height = mapHeight(map);
  const counts = new Map<TileSpriteKey, number>();
  const inChunk: { x: number; y: number; visual: TileVisual }[] = [];
  for (let y = cy * chunkTiles; y < Math.min(height, (cy + 1) * chunkTiles); y += 1) {
    for (let x = cx * chunkTiles; x < Math.min(width, (cx + 1) * chunkTiles); x += 1) {
      const visual = visuals[y * width + x];
      inChunk.push({ x, y, visual });
      counts.set(visual.base, (counts.get(visual.base) ?? 0) + 1);
    }
  }
  let dominant: TileSpriteKey = 'grass';
  let best = -1;
  for (const [key, count] of counts) if (count > best) { best = count; dominant = key; }
  const cells = inChunk
    .map(({ x, y, visual }) => ({ x, y, base: visual.base === dominant ? null : visual.base, decor: visual.decor }))
    .filter((cell) => cell.base || cell.decor);
  const result = { dominant, cells };
  chunks.set(key, result);
  return result;
}
