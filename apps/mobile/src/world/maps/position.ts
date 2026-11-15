import { FIELD_VILLAGE_OFFSET } from './field';
import { getMap, isMapId } from './index';
import type { MapId } from './map-types';
import { nearestWalkable } from './tiles';

/** 2 = 청솔 들녘(64x56) 좌표계. 그 전 저장은 24x24 마을 좌표라 오프셋만큼 옮깁니다. */
export const WORLD_VERSION = 2;

interface SavedPosition {
  mapId?: unknown;
  playerPos?: { x: number; y: number };
  worldVersion?: unknown;
}

/**
 * 저장된 지도·위치 복원. 옛 24x24 좌표는 들녘 오프셋만큼 옮기고,
 * 지도가 바뀌어 막힌 칸이면 가장 가까운 걸을 수 있는 칸으로 옮깁니다.
 */
export function restorePosition(
  saved: SavedPosition,
  fallback: { x: number; y: number },
): { mapId: MapId; playerPos: { x: number; y: number }; worldVersion: number } {
  const mapId: MapId = isMapId(saved.mapId) ? saved.mapId : 'field';
  const raw = saved.playerPos;
  const valid = Boolean(raw && Number.isFinite(raw.x) && Number.isFinite(raw.y));
  const legacy = saved.worldVersion !== WORLD_VERSION && mapId === 'field';
  const pos = valid && raw
    ? legacy ? { x: raw.x + FIELD_VILLAGE_OFFSET.x, y: raw.y + FIELD_VILLAGE_OFFSET.y } : raw
    : fallback;
  return { mapId, playerPos: nearestWalkable(getMap(mapId), pos.x, pos.y), worldVersion: WORLD_VERSION };
}
