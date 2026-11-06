import type {
  RpgCharacterStats,
  RpgQuest,
  VillageBuildingId,
  VillageNpc,
  VillageTile,
} from './rpg-types';

/** 청솔 시니어 마을은 15 x 15 타일 맵입니다. (x: 0-14, y: 0-14) */
export const VILLAGE_GRID_SIZE = 15;

export const INITIAL_STATS: RpgCharacterStats = {
  vitality: 80,
  maxVitality: 100,
  wisdomExp: 350,
  acorns: 120,
  reputation: 15,
  dailyMorningGymDone: false,
  dailyMedicationTaken: false,
};

export const VILLAGE_NPCS: readonly VillageNpc[] = [
  {
    id: 'chief',
    name: '김 이장',
    title: '마을회관 어르신',
    x: 7,
    y: 4,
    dialogue: [
      '어서 오시게! 청솔마을에 잘 정착하고 계시는가?',
      '아침 체조와 약 챙겨먹기는 건강의 기본이니 꼭 잊지 말게나.',
      '마을 시설마다 명인 어르신들이 기다리고 계시니 한 번 둘러보시게.',
    ],
  },
  {
    id: 'golf_captain',
    name: '박 캡틴',
    title: '파크골프장 반장',
    x: 2,
    y: 7,
    dialogue: [
      '오늘 그린 잔디 결이 기가 막히게 잘 깎였습니다!',
      '소나무 1홀에서 감나무 퍼터로 버디 한 번 노려보시지요?',
    ],
    questId: 'quest_parkgolf',
    facilityRoute: '/clubs',
    facilityLabel: '파크골프장 입장 ▶',
  },
  {
    id: 'baduk_master',
    name: '최 사범',
    title: '송학기원 원장',
    x: 12,
    y: 7,
    dialogue: [
      '반갑구려. 비자나무 바둑판에서 한 수 두시겠소?',
      '상대 알을 둘 이상 밀어내는 일석이조의 손맛이 일품이지요.',
    ],
    questId: 'quest_alkkagi',
    facilityRoute: '/events',
    facilityLabel: '송학기원 입장 ▶',
  },
  {
    id: 'tea_manager',
    name: '이 다도명인',
    title: '매화다실 안주인',
    x: 2,
    y: 12,
    dialogue: [
      '향긋한 찻잔과 함께 전통 패 사천성 한 판 어떠세요?',
      '길상 문양의 짝을 맞추다 보면 뇌 활력이 솟아난답니다.',
    ],
    questId: 'quest_sacheonseong',
    facilityRoute: '/chat',
    facilityLabel: '매화다실 입장 ▶',
  },
  {
    id: 'herbalist',
    name: '강 원장',
    title: '청솔 한약방',
    x: 12,
    y: 12,
    dialogue: [
      '기운이 허하실 땐 쌍화차와 아침 체조가 보약입니다.',
      '활력(HP)을 가득 채우고 모험을 떠나보세요.',
    ],
  },
] as const;

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
export interface VillageBuilding {
  id: VillageBuildingId;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  door: { x: number; y: number };
  facilityRoute?: '/clubs' | '/events' | '/chat' | '/me';
}

export const VILLAGE_BUILDINGS: readonly VillageBuilding[] = [
  {
    id: 'club_hall',
    name: '마을회관',
    x: 6,
    y: 1,
    width: 3,
    height: 2,
    door: { x: 7, y: 3 },
  },
  {
    id: 'parkgolf',
    name: '파크골프장',
    x: 1,
    y: 4,
    width: 3,
    height: 2,
    door: { x: 2, y: 6 },
    facilityRoute: '/clubs',
  },
  {
    id: 'alkkagi',
    name: '송학기원',
    x: 11,
    y: 4,
    width: 3,
    height: 2,
    door: { x: 12, y: 6 },
    facilityRoute: '/events',
  },
  {
    id: 'sacheonseong',
    name: '매화다실',
    x: 1,
    y: 9,
    width: 3,
    height: 2,
    door: { x: 2, y: 11 },
    facilityRoute: '/chat',
  },
  {
    id: 'herbal',
    name: '청솔 한약방',
    x: 11,
    y: 9,
    width: 3,
    height: 2,
    door: { x: 12, y: 11 },
  },
] as const;

const tileKey = (x: number, y: number) => `${x},${y}`;

/** 양 끝을 포함하는 정수 범위 */
function rangeInclusive(from: number, to: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to; v += 1) out.push(v);
  return out;
}

const DOOR_TILES = new Set(
  VILLAGE_BUILDINGS.map((building) => tileKey(building.door.x, building.door.y)),
);

/** 마을 길(걸을 수 있는 돌담길/광장) 타일 */
const PATH_TILES = new Set<string>([
  // 동서 대로 (y = 7)
  ...rangeInclusive(0, VILLAGE_GRID_SIZE - 1).map((x) => tileKey(x, 7)),
  // 남북 대로 (x = 7)
  ...rangeInclusive(0, VILLAGE_GRID_SIZE - 1).map((y) => tileKey(7, y)),
  // 시설 진입 골목
  tileKey(2, 6),
  tileKey(2, 7),
  tileKey(12, 6),
  tileKey(12, 7),
  tileKey(2, 11),
  tileKey(2, 12),
  tileKey(12, 11),
  tileKey(12, 12),
  // 마을회관 앞길 (y = 3)
  tileKey(6, 3),
  tileKey(7, 3),
  tileKey(8, 3),
  // 남쪽 길 (y = 13)
  ...rangeInclusive(2, 12).map((x) => tileKey(x, 13)),
  // 중앙 광장 (3 x 3)
  ...rangeInclusive(6, 8).flatMap((x) => rangeInclusive(6, 8).map((y) => tileKey(x, y))),
]);

const FENCE_TILES = new Set<string>([
  tileKey(5, 0),
  tileKey(9, 0),
  tileKey(0, 4),
  tileKey(14, 4),
  tileKey(0, 10),
  tileKey(14, 10),
  tileKey(5, 14),
  tileKey(9, 14),
]);

const PINE_TILES = new Set<string>([
  tileKey(0, 0),
  tileKey(14, 0),
  tileKey(4, 2),
  tileKey(10, 2),
  tileKey(0, 8),
  tileKey(14, 8),
]);

const CHERRY_TILES = new Set<string>([
  tileKey(4, 12),
  tileKey(6, 12),
  tileKey(8, 12),
  tileKey(10, 12),
]);

const FLOWER_TILES = new Set<string>([
  tileKey(5, 6),
  tileKey(9, 6),
  tileKey(5, 8),
  tileKey(9, 8),
]);

const LANTERN_TILES = new Set<string>([tileKey(6, 6), tileKey(8, 6)]);

/** 청솔 연못 (x 11-14, y 13-14) — 물이라 걸을 수 없습니다. */
const POND_TILES = new Set<string>(
  rangeInclusive(11, 14).flatMap((x) => rangeInclusive(13, 14).map((y) => tileKey(x, y))),
);

export function getVillageTile(x: number, y: number): VillageTile {
  const key = tileKey(x, y);

  // 1) 출입구 타일(걸어 올라갈 수 있는 건물 타일)
  const doorBuilding = VILLAGE_BUILDINGS.find(
    (building) => building.door.x === x && building.door.y === y,
  );
  if (doorBuilding) {
    return {
      x,
      y,
      type: 'building',
      name: doorBuilding.name,
      facilityRoute: doorBuilding.facilityRoute,
      spriteId: doorBuilding.id,
    };
  }

  // 2) 건물 외벽/지붕 (통행 불가)
  const footprintBuilding = VILLAGE_BUILDINGS.find(
    (building) =>
      x >= building.x &&
      x < building.x + building.width &&
      y >= building.y &&
      y < building.y + building.height,
  );
  if (footprintBuilding) {
    return {
      x,
      y,
      type: 'building',
      name: footprintBuilding.name,
      facilityRoute: footprintBuilding.facilityRoute,
      spriteId: footprintBuilding.id,
    };
  }

  // 3) 장식/지형
  if (POND_TILES.has(key)) return { x, y, type: 'water', name: '청솔 연못' };
  if (FENCE_TILES.has(key)) return { x, y, type: 'fence', name: '돌담' };
  if (PINE_TILES.has(key)) return { x, y, type: 'tree', name: '소나무', variant: 'pine' };
  if (CHERRY_TILES.has(key)) return { x, y, type: 'tree', name: '매화나무', variant: 'cherry' };
  if (FLOWER_TILES.has(key)) return { x, y, type: 'flower', name: '꽃밭' };
  if (LANTERN_TILES.has(key)) return { x, y, type: 'lantern', name: '석등' };

  // 4) 길 / 풀밭
  if (PATH_TILES.has(key)) return { x, y, type: 'path', name: '마을 돌담길' };
  return { x, y, type: 'grass', name: '푸른 잔디' };
}

/** 해당 좌표가 시설 출입구 타일인지 여부 */
export function isVillageDoorTile(x: number, y: number): boolean {
  return DOOR_TILES.has(tileKey(x, y));
}

export function canMoveTo(x: number, y: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || x >= VILLAGE_GRID_SIZE || y < 0 || y >= VILLAGE_GRID_SIZE) return false;

  const tile = getVillageTile(x, y);
  switch (tile.type) {
    case 'grass':
    case 'path':
      return true;
    case 'building':
      // 건물은 출입구(문) 타일만 걸어서 올라갈 수 있습니다.
      return DOOR_TILES.has(tileKey(x, y));
    default:
      // water / fence / tree / flower / lantern
      return false;
  }
}

export function findNearbyNpc(x: number, y: number): VillageNpc | null {
  for (const npc of VILLAGE_NPCS) {
    if (Math.abs(npc.x - x) <= 1 && Math.abs(npc.y - y) <= 1) {
      return npc;
    }
  }
  return null;
}
