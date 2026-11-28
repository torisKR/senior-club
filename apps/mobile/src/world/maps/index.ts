import { FIELD_MAP } from './field';
import type { MapDef, MapId } from './map-types';
import { MARKET_MAP } from './market';
import { MOUNTAIN_MAP } from './mountain';
import { SEASIDE_MAP } from './seaside';

export type { MapBuilding, MapDef, MapId } from './map-types';

export const MAPS: Record<MapId, MapDef> = { field: FIELD_MAP, seaside: SEASIDE_MAP, mountain: MOUNTAIN_MAP, market: MARKET_MAP };
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
  // 숨은 막다른 곳(버섯 골·뒷골목 쉼터)은 일부러 표지를 두지 않습니다.
  mountain: [
    { name: '산마루', x: 21, y: 5 },
    { name: '솔숲 산길', x: 21, y: 21 },
    { name: '산골 계곡', x: 41, y: 24 },
    { name: '산 들머리', x: 9, y: 35 },
  ],
  market: [
    { name: '장터 들머리', x: 20, y: 3 },
    { name: '오일장터', x: 20, y: 12 },
    { name: '장터 뒤뜰', x: 15, y: 26 },
  ],
};

/** 발밑 칸이 속한 지역 이름 */
export function regionName(mapId: MapId, x: number, y: number): string {
  if (mapId === 'seaside') return '바닷가 마을';
  if (mapId === 'mountain') {
    if (x >= 33) return '산골 계곡';
    if (y <= 10) return '산마루';
    return y >= 32 ? '산 들머리' : '솔숲 산길';
  }
  if (mapId === 'market') {
    if (y < 8) return '장터 들머리';
    if (y < 24) return '오일장터';
    return x > 31 ? '뒷골목 쉼터' : '장터 뒤뜰';
  }
  if (y < 16) return '숲 산책로';
  if (y >= 40) return '꽃동산 언덕';
  if (x < 20) return '장터 거리';
  if (x >= 44) return '강변';
  return '청솔마을';
}
