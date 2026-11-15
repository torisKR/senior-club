import { FIELD_MAP } from './field';
import type { MapDef, MapId } from './map-types';
import { SEASIDE_MAP } from './seaside';

export type { MapBuilding, MapDef, MapId } from './map-types';

export const MAPS: Record<MapId, MapDef> = { field: FIELD_MAP, seaside: SEASIDE_MAP };
export const MAP_IDS = Object.keys(MAPS) as MapId[];

export const isMapId = (value: unknown): value is MapId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(MAPS, value);

export function getMap(id: MapId | undefined | null): MapDef {
  return isMapId(id) ? MAPS[id] : FIELD_MAP;
}

/** 버스 노선: 정류장이 있는 지도끼리 오갑니다. */
export function busDestinations(from: MapId): MapDef[] {
  return MAP_IDS.filter((id) => id !== from && MAPS[id].buildings.some((b) => b.busStop)).map((id) => MAPS[id]);
}

/** 지역 이름과 미니맵 표지 위치 */
export const MAP_REGIONS: Record<MapId, readonly { name: string; x: number; y: number }[]> = {
  field: [
    { name: '숲 산책로', x: 30, y: 7 },
    { name: '장터 거리', x: 9, y: 33 },
    { name: '청솔마을', x: 31, y: 30 },
    { name: '강변', x: 57, y: 31 },
    { name: '꽃동산 언덕', x: 30, y: 51 },
  ],
  seaside: [{ name: '바닷가 마을', x: 15, y: 9 }],
};

/** 발밑 칸이 속한 지역 이름 */
export function regionName(mapId: MapId, x: number, y: number): string {
  if (mapId === 'seaside') return '바닷가 마을';
  if (y < 16) return '숲 산책로';
  if (y >= 40) return '꽃동산 언덕';
  if (x < 20) return '장터 거리';
  if (x >= 44) return '강변';
  return '청솔마을';
}
