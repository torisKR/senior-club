import type { VillageTile } from '@/rpg/rpg-types';

import type { MapBuilding, MapDef } from './map-types';

type TileInfo = Omit<VillageTile, 'x' | 'y'>;

/**
 * 글자 → 타일. 모든 지도가 같은 사전을 씁니다.
 *  . 잔디  = 길  ~ 물  K 선착장  S 돌다리  f 숲 바닥  y/v 꽃밭(걸을 수 있음)  d 모래
 *  # 돌담  P 소나무  C 매화나무  u 덤불  o 바위  * 꽃 화단  L 석등  F 텃밭  b 벤치
 *  W 약수터  T 평상  w 장작  g 이정표  B 건물(실제 판정은 건물 데이터)
 *  솔숲 산길: m 솔잎 흙길  s 돌계단  r 계곡물  H 통나무 다리  R 바위 절벽  Q 산 약수터  c 돌탑  M 버섯 통나무  A 큰 소나무
 *  오일장터: p 돌 포장  Y 윷놀이 멍석(걸을 수 있음)  l 청사초롱  x 과일 상자  j 항아리  n 만국기
 */
export const LEGEND: Record<string, TileInfo> = {
  '.': { type: 'grass', name: '푸른 잔디' },
  B: { type: 'grass', name: '푸른 잔디' },
  '=': { type: 'path', name: '마을 돌담길' },
  d: { type: 'path', name: '모래밭' },
  '~': { type: 'water', name: '물가' },
  K: { type: 'dock', name: '선착장' },
  S: { type: 'bridge', name: '돌다리' },
  f: { type: 'forest', name: '숲 산책로' },
  y: { type: 'flowerfield', name: '꽃동산', variant: 'yellow' },
  v: { type: 'flowerfield', name: '꽃동산', variant: 'purple' },
  '#': { type: 'fence', name: '돌담' },
  P: { type: 'tree', name: '소나무', variant: 'pine' },
  C: { type: 'tree', name: '매화나무', variant: 'cherry' },
  u: { type: 'bush', name: '덤불' },
  o: { type: 'rock', name: '바위' },
  '*': { type: 'flower', name: '꽃밭' },
  L: { type: 'lantern', name: '석등' },
  F: { type: 'farm', name: '내 텃밭' },
  b: { type: 'bench', name: '쉼터 벤치' },
  W: { type: 'well', name: '약수터' },
  T: { type: 'table', name: '평상' },
  w: { type: 'firewood', name: '장작더미' },
  g: { type: 'signpost', name: '이정표' },
  m: { type: 'path', name: '솔잎 흙길', variant: 'dirt' },
  s: { type: 'path', name: '돌계단', variant: 'steps' },
  r: { type: 'water', name: '계곡물', variant: 'stream' },
  H: { type: 'bridge', name: '통나무 다리', variant: 'logbridge' },
  R: { type: 'rock', name: '바위 절벽', variant: 'cliff' },
  Q: { type: 'well', name: '산 약수터', variant: 'spring' },
  c: { type: 'rock', name: '돌탑', variant: 'cairn' },
  M: { type: 'firewood', name: '버섯 난 통나무', variant: 'mushroomlog' },
  A: { type: 'tree', name: '큰 소나무', variant: 'bigpine' },
  p: { type: 'path', name: '장터 돌 포장', variant: 'paving' },
  Y: { type: 'path', name: '윷놀이 멍석', variant: 'yut' },
  l: { type: 'lantern', name: '청사초롱', variant: 'cheongsa' },
  x: { type: 'prop', name: '과일 상자', variant: 'crates' },
  j: { type: 'prop', name: '장터 항아리', variant: 'jars' },
  n: { type: 'prop', name: '만국기', variant: 'flags' },
};

/** 걸을 수 있는 바닥 */
const WALKABLE = new Set<VillageTile['type']>(['grass', 'path', 'dock', 'bridge', 'forest', 'flowerfield']);

/** 물 글자: 연못·강·바다(~)와 계곡물(r) */
export const isWaterSymbol = (symbol: string | undefined) => symbol === '~' || symbol === 'r';

export const mapWidth = (map: MapDef) => map.layout[0]?.length ?? 0;
export const mapHeight = (map: MapDef) => map.layout.length;

export function buildingAt(map: MapDef, x: number, y: number): MapBuilding | undefined {
  return map.buildings.find(
    (b) => (b.door.x === x && b.door.y === y) || (x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height),
  );
}

export function isDoorTile(map: MapDef, x: number, y: number): boolean {
  return map.buildings.some((b) => b.door.x === x && b.door.y === y);
}

export function tileAt(map: MapDef, x: number, y: number): VillageTile {
  const building = buildingAt(map, x, y);
  if (building) {
    return { x, y, type: 'building', name: building.name, facilityRoute: building.facilityRoute, spriteId: building.id };
  }
  const symbol = map.layout[y]?.[x] ?? '.';
  return { x, y, ...(LEGEND[symbol] ?? LEGEND['.']) };
}

export function isWalkable(map: MapDef, x: number, y: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || y < 0 || x >= mapWidth(map) || y >= mapHeight(map)) return false;
  const tile = tileAt(map, x, y);
  if (tile.type === 'building') return isDoorTile(map, x, y);
  return WALKABLE.has(tile.type);
}

/** 자유 이동 충돌용 통과 격자: 1 = 걸을 수 있음. 행 우선(y * width + x). */
export function buildPassGrid(map: MapDef): number[] {
  const width = mapWidth(map);
  const height = mapHeight(map);
  const grid = new Array<number>(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) grid[y * width + x] = isWalkable(map, x, y) ? 1 : 0;
  }
  return grid;
}

/** 저장된 자리가 막혀 있으면 가장 가까운 걸을 수 있는 칸으로 옮깁니다(너비 우선 탐색). */
export function nearestWalkable(map: MapDef, x: number, y: number): { x: number; y: number } {
  const sx = Math.min(Math.max(Math.round(x), 0), mapWidth(map) - 1);
  const sy = Math.min(Math.max(Math.round(y), 0), mapHeight(map) - 1);
  const seen = new Set<string>([`${sx},${sy}`]);
  const queue = [{ x: sx, y: sy }];
  while (queue.length) {
    const cur = queue.shift()!;
    if (isWalkable(map, cur.x, cur.y)) return cur;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= mapWidth(map) || ny >= mapHeight(map) || seen.has(key)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return map.arrival;
}
