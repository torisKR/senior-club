/**
 * 자유 이동의 순수 계산. 위치는 타일 단위 실수(칸 중심 = 정수 + 0.5).
 * 'worklet' 지시어로 UI 스레드에서 매 프레임 돌고, 테스트에서는 평범한 함수로 돕니다.
 */

/** 걷는 속도 (칸/초) */
export const WALK_SPEED = 3.2;
/** 주인공 발 아래 충돌 상자의 반폭 (칸) — 1칸 통로를 여유 있게 지나가도록 0.5보다 작게 */
export const PLAYER_RADIUS = 0.3;
/** 한 프레임 최대 경과 시간 (초) — 앱이 잠깐 멈췄다 돌아와도 벽을 뚫지 않게 */
export const MAX_FRAME_SECONDS = 0.05;
/** 짧은 가속으로 출발의 튐을 줄이되, 입력을 줄이면 바로 반응합니다. */
export const ACCELERATION_SECONDS = 0.06;
/** 한 방향으로만 밀 때(다른 축 입력이 이보다 작을 때) 모서리 걸림을 풀어 줍니다. */
export const CORNER_ASSIST_INPUT = 0.3;

/** 청크 한 변 (칸) */
export const CHUNK_TILES = 8;

export interface PassGrid {
  cells: readonly number[];
  width: number;
  height: number;
}

/** 조이스틱 크기의 가속만 부드럽게 합니다. 방향 전환과 정지는 지연하지 않습니다. */
export function nextWalkStrength(current: number, target: number, dt: number): number {
  'worklet';
  const desired = Math.min(1, Math.max(0, target));
  if (desired <= current) return desired;
  const seconds = Math.min(Math.max(dt, 0), MAX_FRAME_SECONDS);
  return current + (desired - current) * (1 - Math.exp(-seconds / ACCELERATION_SECONDS));
}

export function isOpen(grid: PassGrid, x: number, y: number): boolean {
  'worklet';
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= grid.width || ty >= grid.height) return false;
  return grid.cells[ty * grid.width + tx] === 1;
}

/** 중심 (cx, cy), 반폭 r 인 상자의 네 모서리가 모두 걸을 수 있는 칸 위에 있는지 */
export function boxFits(grid: PassGrid, cx: number, cy: number, r: number): boolean {
  'worklet';
  return (
    isOpen(grid, cx - r, cy - r) &&
    isOpen(grid, cx + r, cy - r) &&
    isOpen(grid, cx - r, cy + r) &&
    isOpen(grid, cx + r, cy + r)
  );
}

/**
 * 모서리 보정: 앞이 막혔지만 칸 가운데 줄로는 지나갈 수 있으면, 가운데 쪽으로 조금 옮깁니다.
 * shiftX = true 면 x 를 (fromX 에서) 옮기고, 아니면 y 를 옮깁니다.
 * worklet 변환은 함수 선언을 끌어올리지 않으므로 boxFits 아래에 둡니다.
 */
function towardCenter(grid: PassGrid, probeX: number, probeY: number, shiftX: boolean, maxStep: number, fromX: number): number {
  'worklet';
  const current = shiftX ? fromX : probeY;
  const center = Math.floor(current) + 0.5;
  const fits = shiftX ? boxFits(grid, center, probeY, PLAYER_RADIUS) : boxFits(grid, probeX, center, PLAYER_RADIUS);
  if (!fits) return current;
  const diff = center - current;
  return current + Math.sign(diff) * Math.min(Math.abs(diff), maxStep);
}

/** 막힌 이동도 벽 직전까지 진행해 프레임 길이에 따라 틈이 달라지지 않게 합니다. */
function approachWall(grid: PassGrid, x: number, y: number, dx: number, dy: number): number {
  'worklet';
  // 10회 이분 탐색의 최소 단위도 막혔다면 기존 탐색 결과는 0입니다.
  const smallestStep = 1 / 1024;
  if (!boxFits(grid, x + dx * smallestStep, y + dy * smallestStep, PLAYER_RADIUS)) return 0;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 10; i += 1) {
    const mid = (low + high) / 2;
    if (boxFits(grid, x + dx * mid, y + dy * mid, PLAYER_RADIUS)) low = mid;
    else high = mid;
  }
  return low;
}

/**
 * 조이스틱 벡터(길이 0~1)로 dt 초 만큼 걷습니다. 가로·세로를 따로 막아
 * 벽에 비스듬히 부딪히면 벽을 따라 미끄러집니다.
 */
export function stepMotion(
  grid: PassGrid,
  x: number,
  y: number,
  vx: number,
  vy: number,
  dt: number,
): { x: number; y: number } {
  'worklet';
  const seconds = Math.min(Math.max(dt, 0), MAX_FRAME_SECONDS);
  const length = Math.hypot(vx, vy);
  if (length === 0 || seconds === 0) return { x, y };
  const scale = length > 1 ? 1 / length : 1;
  const dx = vx * scale * WALK_SPEED * seconds;
  const dy = vy * scale * WALK_SPEED * seconds;
  const stepLength = Math.hypot(dx, dy);
  let nx = x;
  let ny = y;
  if (dx !== 0) {
    if (boxFits(grid, x + dx, y, PLAYER_RADIUS)) nx = x + dx;
    else {
      nx = x + dx * approachWall(grid, x, y, dx, 0);
      if (Math.abs(vy) < CORNER_ASSIST_INPUT) ny = towardCenter(grid, x + dx, y, false, stepLength, x);
    }
  }
  if (dy !== 0) {
    if (boxFits(grid, nx, ny + dy, PLAYER_RADIUS)) ny += dy;
    else {
      const fraction = approachWall(grid, nx, ny, 0, dy);
      if (Math.abs(vx) < CORNER_ASSIST_INPUT) nx = towardCenter(grid, nx, ny + dy, true, stepLength, nx);
      ny += dy * fraction;
    }
  }
  return { x: nx, y: ny };
}

/** 입력 방향으로 이동하지 못한 축이 있으면 벽에 닿은 상태입니다. */
export function hitBoundary(x: number, y: number, nextX: number, nextY: number, vx: number, vy: number, dt: number): boolean {
  'worklet';
  const length = Math.hypot(vx, vy);
  const seconds = Math.min(Math.max(dt, 0), MAX_FRAME_SECONDS);
  if (!length || !seconds) return false;
  const distance = WALK_SPEED * seconds / Math.max(1, length);
  const expectedX = Math.abs(vx) * distance;
  const expectedY = Math.abs(vy) * distance;
  const traveledX = (nextX - x) * Math.sign(vx);
  const traveledY = (nextY - y) * Math.sign(vy);
  return (expectedX > 0.001 && traveledX < expectedX * 0.8) ||
    (expectedY > 0.001 && traveledY < expectedY * 0.8);
}

export type Facing = 'down' | 'up' | 'left' | 'right';

/** 대각선 경계에서는 직전 축을 유지해 조이스틱 떨림에 그림이 번갈아 나오지 않게 합니다. */
export function facingFor(vx: number, vy: number, previous?: Facing): Facing | null {
  'worklet';
  if (vx === 0 && vy === 0) return null;
  const horizontal = Math.abs(vx);
  const vertical = Math.abs(vy);
  if (previous && Math.abs(horizontal - vertical) <= Math.max(horizontal, vertical) * 0.12) {
    if ((previous === 'left' || previous === 'right') && horizontal > 0) return vx > 0 ? 'right' : 'left';
    if ((previous === 'up' || previous === 'down') && vertical > 0) return vy > 0 ? 'down' : 'up';
  }
  if (horizontal >= vertical) return vx > 0 ? 'right' : 'left';
  return vy > 0 ? 'down' : 'up';
}

/** 카메라가 비추는 칸 주변 청크 목록 (cx, cy 는 청크 좌표) */
export function visibleChunks(
  centerChunkX: number,
  centerChunkY: number,
  radiusX: number,
  radiusY: number,
  chunkCols: number,
  chunkRows: number,
): { cx: number; cy: number }[] {
  const out: { cx: number; cy: number }[] = [];
  for (let cy = Math.max(0, centerChunkY - radiusY); cy <= Math.min(chunkRows - 1, centerChunkY + radiusY); cy += 1) {
    for (let cx = Math.max(0, centerChunkX - radiusX); cx <= Math.min(chunkCols - 1, centerChunkX + radiusX); cx += 1) {
      out.push({ cx, cy });
    }
  }
  return out;
}

/** 카메라 중앙과 지도 가장자리에서 화면을 모두 덮도록 청크 반경을 정합니다. */
export function chunkRadiiForViewport(viewWidth: number, viewHeight: number, tileSize: number): { x: number; y: number } {
  const chunkSize = CHUNK_TILES * tileSize;
  if (chunkSize <= 0) return { x: 1, y: 2 };
  const w = Math.max(0, viewWidth);
  const h = Math.max(0, viewHeight);
  return {
    x: Math.max(1, Math.ceil(w / (2 * chunkSize)), Math.ceil(w / chunkSize) - 1),
    // 활동창이 열리면 초점이 화면 위쪽 27%까지 올라갑니다.
    y: Math.max(2, Math.ceil(h * 0.73 / chunkSize), Math.ceil(h / chunkSize) - 1),
  };
}

/** 현재 칸과 카메라 이동 여유를 포함하는 청크 범위입니다. 패널 열림·닫힘 중에도 화면을 덮습니다. */
export function chunkBoundsForViewport(
  tileX: number, tileY: number, viewWidth: number, viewHeight: number,
  tileSize: number, mapWidthTiles: number, mapHeightTiles: number,
): { left: number; right: number; top: number; bottom: number } {
  const chunkPx = CHUNK_TILES * tileSize;
  const cols = Math.ceil(mapWidthTiles / CHUNK_TILES);
  const rows = Math.ceil(mapHeightTiles / CHUNK_TILES);
  if (viewWidth <= 0 || viewHeight <= 0 || chunkPx <= 0) {
    const x = Math.floor(tileX / CHUNK_TILES);
    const y = Math.floor(tileY / CHUNK_TILES);
    return { left: Math.max(0, x - 1), right: Math.min(cols - 1, x + 1), top: Math.max(0, y - 2), bottom: Math.min(rows - 1, y + 2) };
  }
  const mapWidth = mapWidthTiles * tileSize;
  const mapHeight = mapHeightTiles * tileSize;
  const first = cameraOrigin(tileX * tileSize, tileY * tileSize, viewWidth, viewHeight, mapWidth, mapHeight, 0.5);
  const last = cameraOrigin((tileX + 1) * tileSize, (tileY + 1) * tileSize, viewWidth, viewHeight, mapWidth, mapHeight, 0.27);
  // JS 스레드에 칸 이동이 전달되기 전의 이동 및 가장자리 스프라이트 여유.
  const margin = 2 * tileSize;
  return {
    left: Math.max(0, Math.floor((first.x - margin) / chunkPx)),
    right: Math.min(cols - 1, Math.floor((last.x + viewWidth + margin) / chunkPx)),
    top: Math.max(0, Math.floor((first.y - margin) / chunkPx)),
    bottom: Math.min(rows - 1, Math.floor((last.y + viewHeight + margin) / chunkPx)),
  };
}

/** 스프라이트가 청크 밖으로 걸치는 여유를 포함해 인물 표시 범위를 판단합니다. */
export function isNearVisibleChunks(x: number, y: number, chunks: readonly { cx: number; cy: number }[]): boolean {
  return chunks.some(({ cx, cy }) =>
    x >= cx * CHUNK_TILES - 2 && x < (cx + 1) * CHUNK_TILES + 2 &&
    y >= cy * CHUNK_TILES - 2 && y < (cy + 1) * CHUNK_TILES + 2,
  );
}

/** 영역 일부가 보이는 청크(및 주변 여유)에 걸치면 화면 밖으로 제거하지 않습니다. */
export function isRectNearVisibleChunks(x: number, y: number, width: number, height: number, chunks: readonly { cx: number; cy: number }[]): boolean {
  return chunks.some(({ cx, cy }) =>
    x < (cx + 1) * CHUNK_TILES + 2 && x + width > cx * CHUNK_TILES - 2 &&
    y < (cy + 1) * CHUNK_TILES + 2 && y + height > cy * CHUNK_TILES - 2,
  );
}

/** 카메라 왼쪽 위 좌표(dp): 주인공을 화면 (0.5, focusY)에 두되 지도 밖은 보이지 않게(아래쪽은 focus 만큼 여유) */
export function cameraOrigin(
  playerPx: number,
  playerPy: number,
  viewW: number,
  viewH: number,
  mapW: number,
  mapH: number,
  focusY: number,
): { x: number; y: number } {
  'worklet';
  const maxX = Math.max(0, mapW - viewW);
  const maxY = Math.max(0, mapH - viewH + viewH * Math.max(0, 0.5 - focusY));
  return {
    x: Math.min(Math.max(playerPx - viewW / 2, 0), maxX),
    y: Math.min(Math.max(playerPy - viewH * focusY, 0), maxY),
  };
}
