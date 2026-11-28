/**
 * 탐험 거리: 날마다 자리가 바뀌는 채집물, 사진 명소, 도감 목록. 순수 함수만 둡니다.
 */
import { CROP_IDS, CROPS, FISH, type CropId, type FishId } from './life';
import { regionName } from './maps';
import type { MapDef, MapId } from './maps/map-types';
import { isWalkable, mapHeight, mapWidth, tileAt } from './maps/tiles';

export type ForageId = 'mushroom' | 'pinecone' | 'chestnut' | 'pebble' | 'watercress' | 'dandelion' | 'violet' | 'clover';
export type ItemId = CropId | FishId | ForageId;

type ForageRegion = '숲 산책로' | '강변' | '꽃동산 언덕' | '솔숲 산길' | '산마루' | '산골 계곡' | '장터 뒤뜰';

export const FORAGE: Record<ForageId, { name: string; region: ForageRegion; weight: number; acorns: number }> = {
  mushroom: { name: '표고버섯', region: '숲 산책로', weight: 4, acorns: 12 },
  pinecone: { name: '솔방울', region: '숲 산책로', weight: 5, acorns: 4 },
  chestnut: { name: '산밤', region: '숲 산책로', weight: 3, acorns: 10 },
  pebble: { name: '고운 조약돌', region: '강변', weight: 5, acorns: 3 },
  watercress: { name: '물냉이', region: '강변', weight: 4, acorns: 8 },
  dandelion: { name: '민들레', region: '꽃동산 언덕', weight: 5, acorns: 5 },
  violet: { name: '제비꽃', region: '꽃동산 언덕', weight: 4, acorns: 6 },
  clover: { name: '네잎클로버', region: '꽃동산 언덕', weight: 1, acorns: 40 },
};
export const FORAGE_IDS = Object.keys(FORAGE) as ForageId[];

/**
 * 지역마다 하루에 나오는 채집물 수와 놓이는 바닥.
 * items 가 있으면 그 목록에서, 없으면 FORAGE 의 region 이 같은 것에서 고릅니다.
 */
const SPAWN_RULES: Record<ForageRegion, { count: number; ground: readonly string[]; items?: readonly ForageId[] }> = {
  '숲 산책로': { count: 9, ground: ['forest'] },
  강변: { count: 6, ground: ['grass'] },
  '꽃동산 언덕': { count: 9, ground: ['flowerfield'] },
  '솔숲 산길': { count: 8, ground: ['forest'], items: ['mushroom', 'pinecone', 'chestnut'] },
  산마루: { count: 4, ground: ['forest'], items: ['pinecone', 'chestnut'] },
  '산골 계곡': { count: 6, ground: ['forest'], items: ['pebble', 'watercress'] },
  '장터 뒤뜰': { count: 5, ground: ['grass'], items: ['dandelion', 'violet'] },
};

export interface ForageSpawn {
  key: string;
  x: number;
  y: number;
  itemId: ForageId;
}

/** 날짜 문자열로 시작하는 작은 난수 생성기 (mulberry32) */
function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(rand: () => number, ids: readonly ForageId[]): ForageId {
  const total = ids.reduce((sum, id) => sum + FORAGE[id].weight, 0);
  let point = rand() * total;
  for (const id of ids) {
    if (point < FORAGE[id].weight) return id;
    point -= FORAGE[id].weight;
  }
  return ids[0];
}

const spawnCache = new Map<string, ForageSpawn[]>();

/** 그날 지도에 놓이는 채집물. 같은 날·같은 지도면 언제 불러도 같은 자리입니다. */
export function forageSpawns(map: MapDef, day: string): ForageSpawn[] {
  const cacheKey = `${map.id}:${day}`;
  const cached = spawnCache.get(cacheKey);
  if (cached) return cached;
  const rand = seeded(cacheKey);
  const spawns: ForageSpawn[] = [];
  const candidatesByRegion = Object.fromEntries(
    Object.keys(SPAWN_RULES).map((region) => [region, []]),
  ) as unknown as Record<ForageRegion, { x: number; y: number }[]>;
  const beach: { x: number; y: number }[] = [];
  for (let y = 0; y < mapHeight(map); y += 1) {
    for (let x = 0; x < mapWidth(map); x += 1) {
      const region = regionName(map.id, x, y);
      if (Object.prototype.hasOwnProperty.call(SPAWN_RULES, region)) {
        const forageRegion = region as ForageRegion;
        if (SPAWN_RULES[forageRegion].ground.includes(tileAt(map, x, y).type) && isWalkable(map, x, y)) {
          candidatesByRegion[forageRegion].push({ x, y });
        }
      }
      if (map.id === 'seaside' && map.layout[y][x] === 'd' && isWalkable(map, x, y)) beach.push({ x, y });
    }
  }
  for (const region of Object.keys(SPAWN_RULES) as ForageRegion[]) {
    const rule = SPAWN_RULES[region];
    const candidates = candidatesByRegion[region];
    const ids = rule.items ?? FORAGE_IDS.filter((id) => FORAGE[id].region === region);
    for (let i = 0; i < rule.count && candidates.length; i += 1) {
      const [spot] = candidates.splice(Math.floor(rand() * candidates.length), 1);
      spawns.push({ key: `${spot.x},${spot.y}`, x: spot.x, y: spot.y, itemId: pickWeighted(rand, ids) });
    }
  }
  if (map.id === 'seaside') {
    for (let i = 0; i < 6 && beach.length; i += 1) {
      const [spot] = beach.splice(Math.floor(rand() * beach.length), 1);
      spawns.push({ key: `${spot.x},${spot.y}`, x: spot.x, y: spot.y, itemId: 'pebble' });
    }
  }
  if (spawnCache.size > 8) spawnCache.clear();
  spawnCache.set(cacheKey, spawns);
  return spawns;
}

export interface PhotoSpot {
  id: string;
  mapId: MapId;
  x: number;
  y: number;
  name: string;
  caption: string;
}

/** 사진 명소. 그 칸(또는 바로 옆)에 서면 `사진 찍기`. */
export const PHOTO_SPOTS: readonly PhotoSpot[] = [
  { id: 'hill', mapId: 'field', x: 36, y: 54, name: '꽃동산 전망대', caption: '노랑·보라 꽃물결이 언덕을 덮었습니다.' },
  { id: 'bridge', mapId: 'field', x: 50, y: 24, name: '강변 돌다리', caption: '돌다리 아래로 맑은 강물이 흘러갑니다.' },
  { id: 'spring', mapId: 'field', x: 32, y: 6, name: '숲속 약수터', caption: '솔향 가득한 숲에서 약수 한 모금.' },
  { id: 'plaza', mapId: 'field', x: 27, y: 23, name: '마을 광장', caption: '석등 사이로 마을회관이 보입니다.' },
  { id: 'pond', mapId: 'field', x: 31, y: 33, name: '연못 선착장', caption: '연못에 노을이 내려앉았습니다.' },
  { id: 'sea', mapId: 'seaside', x: 16, y: 18, name: '바닷가 선착장', caption: '파도 소리 너머로 등대가 보입니다.' },
  { id: 'valley', mapId: 'mountain', x: 43, y: 11, name: '계곡 물가', caption: '바위 사이로 맑은 계곡물이 흐르고 물가에 기와집이 보입니다.' },
  { id: 'fair', mapId: 'market', x: 19, y: 19, name: '오일장 마당', caption: '돌 포장 마당 양옆으로 장날 좌판이 늘어섰습니다.' },
];

export function photoSpotAt(mapId: MapId, x: number, y: number): PhotoSpot | undefined {
  return PHOTO_SPOTS.find((spot) => spot.mapId === mapId && Math.abs(spot.x - x) + Math.abs(spot.y - y) <= 1);
}

/** 알 수 없는 이전 기록과 중복 기록은 보존하되 현재 앨범에 있는 명소만 셉니다. */
export function knownPhotoCount(photos: readonly { spotId: string }[]): number {
  return PHOTO_SPOTS.filter((spot) => photos.some((photo) => photo.spotId === spot.id)).length;
}

export type DexKind = 'fish' | 'crop' | 'forage';
export interface DexEntry { id: ItemId; kind: DexKind; name: string; hint: string }

/** 도감 칸 순서: 물고기 → 작물 → 채집물 */
export const DEX: readonly DexEntry[] = [
  ...FISH.map((fish) => ({ id: fish.id, kind: 'fish' as const, name: fish.name, hint: '연못·강에서 낚시' })),
  ...CROP_IDS.map((id) => ({ id, kind: 'crop' as const, name: CROPS[id].name, hint: '내 텃밭에서 수확' })),
  ...FORAGE_IDS.map((id) => ({ id, kind: 'forage' as const, name: FORAGE[id].name, hint: id === 'pebble' ? '강변·바닷가에서 줍기' : `${FORAGE[id].region}에서 줍기` })),
];

export function itemName(id: ItemId): string {
  return DEX.find((entry) => entry.id === id)?.name ?? id;
}
