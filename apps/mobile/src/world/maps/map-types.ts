import type { FacilityRoute, VillageBuildingId, VillageNpc } from '@/rpg/rpg-types';

export type MapId = 'field' | 'seaside' | 'mountain' | 'market';

export interface MapBuilding {
  id: VillageBuildingId;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 걸어서 올라설 수 있는 출입구 타일 */
  door: { x: number; y: number };
  facilityRoute?: FacilityRoute;
  /** 문 앞에서 버스를 탑니다 */
  busStop?: boolean;
}

/**
 * 지도 하나 = 글자 지도 + 건물 + NPC.
 * 글자 지도의 한 글자가 타일 한 칸이고, 글자 뜻은 `tiles.ts`의 LEGEND가 정합니다.
 */
export interface MapDef {
  id: MapId;
  name: string;
  layout: readonly string[];
  buildings: readonly MapBuilding[];
  npcs: readonly VillageNpc[];
  /** 처음 오거나 버스에서 내릴 때 서는 자리 */
  arrival: { x: number; y: number };
  /** 나무·바위만 모인 곳 아래에 까는 바닥 (없으면 잔디) */
  wildFloor?: 'forest';
}
