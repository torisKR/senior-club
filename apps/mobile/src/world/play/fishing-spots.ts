/**
 * 지도에 '낚시' 표식을 띄울 물가 자리. 물가 칸 전부가 아니라 서로 떨어진 몇 곳만, 언제나 같은 자리로 고릅니다.
 * (표식이 없는 물가에서도 낚시는 할 수 있습니다 — 표식은 "여기서도 된다"는 안내입니다.)
 */
import type { MapDef } from '../maps/map-types';
import { isWalkable, mapHeight, mapWidth, tileAt } from '../maps/tiles';
import { canFishAt } from './fishing';

export interface FishingSpot { x: number; y: number }

export const MAX_FISHING_SPOTS = 4;
/** 표식끼리, 그리고 선착장과 이만큼(칸)은 떨어뜨립니다. */
export const MIN_SPOT_GAP = 6;

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const gap = (a: FishingSpot, b: FishingSpot) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const nearestGap = (spot: FishingSpot, others: readonly FishingSpot[]) =>
  others.reduce((best, other) => Math.min(best, gap(spot, other)), Infinity);

function scanWaterside(map: MapDef): { shore: FishingSpot[]; docks: FishingSpot[] } {
  const shore: FishingSpot[] = [];
  const docks: FishingSpot[] = [];
  for (let y = 0; y < mapHeight(map); y += 1) {
    for (let x = 0; x < mapWidth(map); x += 1) {
      if (!isWalkable(map, x, y)) continue;
      const here = tileAt(map, x, y).type;
      if (here === 'dock') docks.push({ x, y });
      else if (canFishAt(here, NEIGHBORS.map(([dx, dy]) => tileAt(map, x + dx, y + dy).type))) shore.push({ x, y });
    }
  }
  return { shore, docks };
}

const cache = new WeakMap<MapDef, readonly FishingSpot[]>();

/** 선착장과 서로에게서 가장 먼 물가부터 차례로 고릅니다. 같은 지도면 늘 같은 결과입니다. */
export function fishingSpots(map: MapDef): readonly FishingSpot[] {
  const cached = cache.get(map);
  if (cached) return cached;
  const { shore, docks } = scanWaterside(map);
  const chosen: FishingSpot[] = [];
  while (chosen.length < MAX_FISHING_SPOTS) {
    const taken = [...docks, ...chosen];
    // 처음(선착장도 없을 때)은 지도를 훑은 순서의 첫 물가에서 시작합니다.
    const best = shore.reduce<{ spot: FishingSpot; distance: number } | null>((top, spot) => {
      const distance = taken.length ? nearestGap(spot, taken) : 0;
      return !top || distance > top.distance ? { spot, distance } : top;
    }, null);
    if (!best || (taken.length > 0 && best.distance < MIN_SPOT_GAP)) break;
    chosen.push(best.spot);
  }
  cache.set(map, chosen);
  return chosen;
}
