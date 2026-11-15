import type {
  RpgCharacterStats,
  RpgQuest,
  VillageNpc,
  VillageTile,
} from './rpg-types';
import { getMap, type MapBuilding, type MapId } from '@/world/maps';
import { FIELD_BUILDINGS, FIELD_LAYOUT, FIELD_MAP, FIELD_NPCS } from '@/world/maps/field';
import { isDoorTile, isWalkable, mapHeight, mapWidth, tileAt } from '@/world/maps/tiles';


export const INITIAL_STATS: RpgCharacterStats = {
  vitality: 80,
  maxVitality: 100,
  wisdomExp: 350,
  acorns: 120,
  reputation: 15,
  dailyMorningGymDone: false,
  dailyMedicationTaken: false,
};

export const VILLAGE_NPCS = FIELD_NPCS;

export const INITIAL_QUESTS: readonly RpgQuest[] = [
  {
    id: 'quest_wellness',
    title: '상쾌한 아침의 시작',
    clientName: '김 이장',
    clientRole: '마을회관',
    locationName: '마을 광장',
    description: '아침 체조를 완수하고 약을 챙겨드셔 활력(HP)을 회복하세요.',
    targetType: 'daily_wellness',
    requiredCount: 2,
    currentCount: 0,
    rewardExp: 150,
    rewardAcorns: 50,
    completed: false,
    claimed: false,
  },
  {
    id: 'quest_parkgolf',
    title: '박 캡틴의 퍼팅 도전',
    clientName: '박 캡틴',
    clientRole: '파크골프장',
    locationName: '파크골프장',
    description: '파크골프 1홀에서 버디 또는 파로 홀컵 골인에 성공하세요.',
    targetType: 'parkgolf',
    requiredCount: 1,
    currentCount: 0,
    rewardExp: 200,
    rewardAcorns: 80,
    completed: false,
    claimed: false,
  },
  {
    id: 'quest_alkkagi',
    title: '송학기원의 일석이조',
    clientName: '최 사범',
    clientRole: '송학기원',
    locationName: '송학기원',
    description: '알까기 대국에서 상대 알을 밀어내고 통쾌한 승리를 거두세요.',
    targetType: 'alkkagi',
    requiredCount: 1,
    currentCount: 0,
    rewardExp: 220,
    rewardAcorns: 90,
    completed: false,
    claimed: false,
  },
  {
    id: 'quest_sacheonseong',
    title: '매화다실 전통 패 짝맞춤',
    clientName: '이 다도명인',
    clientRole: '매화다실',
    locationName: '매화다실',
    description: '전통 패 사천성에서 2회 이하 굴절 짝맞춤으로 1판을 완수하세요.',
    targetType: 'sacheonseong',
    requiredCount: 1,
    currentCount: 0,
    rewardExp: 210,
    rewardAcorns: 85,
    completed: false,
    claimed: false,
  },
] as const;

export function updateWellnessQuest(quests: readonly RpgQuest[], stats: RpgCharacterStats): RpgQuest[] {
  const done = Number(stats.dailyMorningGymDone) + Number(stats.dailyMedicationTaken);
  return quests.map((quest) => quest.targetType === 'daily_wellness' && !quest.completed
    ? { ...quest, currentCount: Math.min(quest.requiredCount, done), completed: done >= quest.requiredCount }
    : quest);
}

/**
 * 시설(건물) 배치 정보. width/height 는 타일 단위이며,
 * door 는 건물 앞 출입구 타일(걸어서 올라갈 수 있는 유일한 건물 타일)입니다.
 */
export const VILLAGE_BUILDINGS = FIELD_BUILDINGS;

/** 지도 건물 (기존 이름 유지) */
export type VillageBuilding = MapBuilding;

/** 청솔 들녘 글자 지도 (기존 이름 유지) */
export const VILLAGE_LAYOUT = FIELD_LAYOUT;
export const VILLAGE_WIDTH = mapWidth(FIELD_MAP);
export const VILLAGE_HEIGHT = mapHeight(FIELD_MAP);

/** 텃밭 칸 좌표 (들녘 글자 지도의 F, 위→아래·왼→오른 순서가 곧 텃밭 번호) */
export const FARM_PLOTS: readonly { x: number; y: number }[] = FIELD_LAYOUT.flatMap((row, y) =>
  [...row].flatMap((symbol, x) => (symbol === 'F' ? [{ x, y }] : [])),
);

export function getVillageTile(x: number, y: number, mapId: MapId = 'field'): VillageTile {
  return tileAt(getMap(mapId), x, y);
}

/** 해당 좌표가 시설 출입구 타일인지 여부 */
export function isVillageDoorTile(x: number, y: number, mapId: MapId = 'field'): boolean {
  return isDoorTile(getMap(mapId), x, y);
}

export function canMoveTo(x: number, y: number, mapId: MapId = 'field'): boolean {
  return isWalkable(getMap(mapId), x, y);
}

export function findNearbyNpc(x: number, y: number, mapId: MapId = 'field', excludeId?: string | null): VillageNpc | null {
  return getMap(mapId).npcs.find((npc) => npc.id !== excludeId && Math.abs(npc.x - x) <= 1 && Math.abs(npc.y - y) <= 1) ?? null;
}
