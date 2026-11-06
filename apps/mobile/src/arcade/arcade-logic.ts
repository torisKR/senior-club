export interface RankTier {
  id: string;
  label: string;
  shortLabel: string;
  tierGroup: '입문부' | '유단부' | '최고위';
  minCp: number;
  plaqueName: string;
}

export function markAttendance<T extends { attendanceStampClaimed: boolean }>(missions: T): T {
  return missions.attendanceStampClaimed ? missions : { ...missions, attendanceStampClaimed: true };
}

export const RANK_TIERS: readonly RankTier[] = [
  { id: '18k', label: '18급 신입 회원', shortLabel: '18급', tierGroup: '입문부', minCp: 0, plaqueName: '느티나무 입문 명패' },
  { id: '15k', label: '15급 클럽 회원', shortLabel: '15급', tierGroup: '입문부', minCp: 200, plaqueName: '느티나무 정회원 명패' },
  { id: '12k', label: '12급 숙련 회원', shortLabel: '12급', tierGroup: '입문부', minCp: 500, plaqueName: '느티나무 숙련 명패' },
  { id: '9k', label: '9급 유단자', shortLabel: '9급', tierGroup: '유단부', minCp: 900, plaqueName: '비자나무 은장 명패' },
  { id: '5k', label: '5급 상급 유단자', shortLabel: '5급', tierGroup: '유단부', minCp: 1400, plaqueName: '비자나무 상급 은장패' },
  { id: '1k', label: '1급 클럽 고수', shortLabel: '1급', tierGroup: '유단부', minCp: 2000, plaqueName: '비자나무 수석 고수패' },
  { id: '1d', label: '초단(初段) 사범', shortLabel: '초단', tierGroup: '최고위', minCp: 2700, plaqueName: '흑단 황동 단증패' },
  { id: 'master', label: '클럽 명인(名人)', shortLabel: '명인', tierGroup: '최고위', minCp: 3500, plaqueName: '흑단 황동 금장 명인패' },
] as const;

export function resolveRankProgress(cp: number) {
  const safeCp = Math.max(0, Math.floor(cp));
  let currentIndex = 0;
  for (let i = 0; i < RANK_TIERS.length; i += 1) {
    if (safeCp >= RANK_TIERS[i].minCp) {
      currentIndex = i;
    }
  }
  const current = RANK_TIERS[currentIndex];
  const next = RANK_TIERS[currentIndex + 1] ?? null;
  if (!next) {
    return {
      current,
      next: null,
      progressRatio: 1,
      cpIntoTier: safeCp - current.minCp,
      cpNeededForNext: 0,
    };
  }
  const span = Math.max(1, next.minCp - current.minCp);
  const into = Math.max(0, safeCp - current.minCp);
  return {
    current,
    next,
    progressRatio: Math.min(1, into / span),
    cpIntoTier: into,
    cpNeededForNext: Math.max(0, next.minCp - safeCp),
  };
}

// --- SYS-02: Park Golf Arcade ---
export interface ParkGolfHoleSpec {
  holeNumber: number;
  title: string;
  par: number;
  tee: { x: number; y: number };
  cup: { x: number; y: number; radius: number };
  bunker: { x: number; y: number; rx: number; ry: number };
  bumper?: { x1: number; y1: number; x2: number; y2: number; label: string };
  slope: { dx: number; dy: number; chevrons: 1 | 2 | 3; label: string };
}

export const PARK_GOLF_HOLES: readonly ParkGolfHoleSpec[] = [
  {
    holeNumber: 1,
    title: '소나무 공원 1홀',
    par: 3,
    tee: { x: 50, y: 84 },
    cup: { x: 50, y: 18, radius: 6.5 },
    bunker: { x: 68, y: 48, rx: 12, ry: 15 },
    slope: { dx: -2, dy: 0, chevrons: 1, label: '완만한 좌측 경사 ◀' },
  },
  {
    holeNumber: 2,
    title: '황금 벙커길 2홀',
    par: 4,
    tee: { x: 46, y: 84 },
    cup: { x: 54, y: 17, radius: 6.5 },
    bunker: { x: 50, y: 50, rx: 14, ry: 12 },
    bumper: { x1: 20, y1: 42, x2: 36, y2: 42, label: '느티나무 반사 쿠션' },
    slope: { dx: 3, dy: -1, chevrons: 2, label: '우상향 순풍 경사 ▲▶' },
  },
  {
    holeNumber: 3,
    title: '명인 챔피언십 3홀',
    par: 4,
    tee: { x: 52, y: 85 },
    cup: { x: 46, y: 16, radius: 6.5 },
    bunker: { x: 35, y: 46, rx: 13, ry: 14 },
    bumper: { x1: 58, y1: 35, x2: 78, y2: 35, label: '황동 원목 게이트' },
    slope: { dx: -4, dy: 1, chevrons: 3, label: '강한 좌측 그린 경사 ◀◀◀' },
  },
] as const;

export interface ParkGolfShotResult {
  path: { x: number; y: number }[];
  finalPos: { x: number; y: number };
  holed: boolean;
  hitBunker: boolean;
  bouncedWall: boolean;
  bouncedBumper: boolean;
  distanceToCup: number;
}

export const PARK_GOLF_BOUNDS = { left: 12, right: 88, top: 10, bottom: 90 } as const;

type Point = { x: number; y: number };

function bumperIntersection(start: Point, end: Point, bumper: NonNullable<ParkGolfHoleSpec['bumper']>) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const bx = bumper.x2 - bumper.x1;
  const by = bumper.y2 - bumper.y1;
  const cross = dx * by - dy * bx;
  if (Math.abs(cross) < 1e-8) return null;
  const ax = bumper.x1 - start.x;
  const ay = bumper.y1 - start.y;
  const t = (ax * by - ay * bx) / cross;
  const u = (ax * dy - ay * dx) / cross;
  if (t <= 1e-8 || t > 1 || u < 0 || u > 1) return null;
  const length = Math.hypot(bx, by);
  return length > 0 ? { t, normal: { x: -by / length, y: bx / length } } : null;
}

function reflect(vector: Point, normal: Point): Point {
  const projection = vector.x * normal.x + vector.y * normal.y;
  return { x: vector.x - 2 * projection * normal.x, y: vector.y - 2 * projection * normal.y };
}

export function simulateParkGolfShot(
  hole: ParkGolfHoleSpec,
  startPos: { x: number; y: number },
  aimAngleDeg: number,
  powerStep: 1 | 2 | 3,
): ParkGolfShotResult {
  const rad = ((aimAngleDeg - 90) * Math.PI) / 180;
  const speedByStep = { 1: 36, 2: 68, 3: 94 }[powerStep];
  let vx = Math.cos(rad) * (speedByStep / 18);
  let vy = Math.sin(rad) * (speedByStep / 18);
  let x = startPos.x;
  let y = startPos.y;
  const path: { x: number; y: number }[] = [{ x, y }];
  let holed = false;
  let hitBunker = false;
  let bouncedWall = false;
  let bouncedBumper = false;

  if (Math.hypot(x - hole.cup.x, y - hole.cup.y) <= hole.cup.radius) {
    return { path: [...path, { x: hole.cup.x, y: hole.cup.y }], finalPos: { x: hole.cup.x, y: hole.cup.y }, holed: true, hitBunker, bouncedWall, bouncedBumper, distanceToCup: 0 };
  }

  for (let step = 0; step < 26; step += 1) {
    const start = { x, y };
    const movement = { x: vx + hole.slope.dx * 0.04, y: vy + hole.slope.dy * 0.04 };
    x += movement.x;
    y += movement.y;

    const impact = hole.bumper && bumperIntersection(start, { x, y }, hole.bumper);
    if (impact) {
      const reflectedMovement = reflect(movement, impact.normal);
      const reflectedVelocity = reflect({ x: vx, y: vy }, impact.normal);
      const hit = { x: start.x + movement.x * impact.t, y: start.y + movement.y * impact.t };
      path.push({ x: Number(hit.x.toFixed(1)), y: Number(hit.y.toFixed(1)) });
      x = hit.x + reflectedMovement.x * (1 - impact.t) * 0.82;
      y = hit.y + reflectedMovement.y * (1 - impact.t) * 0.82;
      vx = reflectedVelocity.x * 0.82;
      vy = reflectedVelocity.y * 0.82;
      bouncedBumper = true;
    }

    if (x < PARK_GOLF_BOUNDS.left) {
      x = PARK_GOLF_BOUNDS.left + (PARK_GOLF_BOUNDS.left - x);
      vx = Math.abs(vx) * 0.82;
      bouncedWall = true;
    } else if (x > PARK_GOLF_BOUNDS.right) {
      x = PARK_GOLF_BOUNDS.right - (x - PARK_GOLF_BOUNDS.right);
      vx = -Math.abs(vx) * 0.82;
      bouncedWall = true;
    }
    if (y < PARK_GOLF_BOUNDS.top) {
      y = PARK_GOLF_BOUNDS.top + (PARK_GOLF_BOUNDS.top - y);
      vy = Math.abs(vy) * 0.82;
      bouncedWall = true;
    } else if (y > PARK_GOLF_BOUNDS.bottom) {
      y = PARK_GOLF_BOUNDS.bottom - (y - PARK_GOLF_BOUNDS.bottom);
      vy = -Math.abs(vy) * 0.82;
      bouncedWall = true;
    }

    const inBunker =
      Math.pow((x - hole.bunker.x) / hole.bunker.rx, 2) +
        Math.pow((y - hole.bunker.y) / hole.bunker.ry, 2) <=
      1;
    if (inBunker) {
      hitBunker = true;
      vx *= 0.72;
      vy *= 0.72;
    } else {
      vx *= 0.91;
      vy *= 0.91;
    }

    path.push({ x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) });

    const distToCup = Math.hypot(x - hole.cup.x, y - hole.cup.y);
    if (distToCup <= hole.cup.radius) {
      x = hole.cup.x;
      y = hole.cup.y;
      path.push({ x, y });
      holed = true;
      break;
    }
    if (Math.hypot(vx, vy) < 0.25) break;
  }

  const distanceToCup = Number(Math.hypot(x - hole.cup.x, y - hole.cup.y).toFixed(1));
  return {
    path,
    finalPos: { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) },
    holed,
    hitBunker,
    bouncedWall,
    bouncedBumper,
    distanceToCup,
  };
}

// --- SYS-03: Alkkagi Board Battle ---
export interface AlkkagiStone {
  id: string;
  owner: 'player' | 'ai';
  x: number;
  y: number;
  alive: boolean;
}

export function createInitialAlkkagiStones(): AlkkagiStone[] {
  return [
    { id: 'p1', owner: 'player', x: 20, y: 78, alive: true },
    { id: 'p2', owner: 'player', x: 35, y: 74, alive: true },
    { id: 'p3', owner: 'player', x: 50, y: 78, alive: true },
    { id: 'p4', owner: 'player', x: 65, y: 74, alive: true },
    { id: 'p5', owner: 'player', x: 80, y: 78, alive: true },
    { id: 'a1', owner: 'ai', x: 20, y: 22, alive: true },
    { id: 'a2', owner: 'ai', x: 36, y: 26, alive: true },
    { id: 'a3', owner: 'ai', x: 50, y: 20, alive: true },
    { id: 'a4', owner: 'ai', x: 64, y: 26, alive: true },
    { id: 'a5', owner: 'ai', x: 80, y: 22, alive: true },
  ];
}

export function hasAlkkagiProgress(stones: readonly AlkkagiStone[]): boolean {
  const initial = createInitialAlkkagiStones();
  return stones.length !== initial.length || initial.some((original) => {
    const current = stones.find((stone) => stone.id === original.id);
    return !current || current.owner !== original.owner || current.alive !== original.alive ||
      current.x !== original.x || current.y !== original.y;
  });
}

export interface AlkkagiFlickOutcome {
  stones: AlkkagiStone[];
  knockedOutEnemies: number;
  shooterFellOut: boolean;
  doubleKnockout: boolean;
  summaryText: string;
}

export function executeAlkkagiFlick(
  stones: readonly AlkkagiStone[],
  shooterId: string,
  targetId: string,
  power: 'precision' | 'strong' | 'double',
): AlkkagiFlickOutcome {
  const next = stones.map((s) => ({ ...s }));
  const shooter = next.find((s) => s.id === shooterId && s.alive);
  const target = next.find((s) => s.id === targetId && s.alive);
  if (!shooter || !target) {
    return {
      stones: next,
      knockedOutEnemies: 0,
      shooterFellOut: false,
      doubleKnockout: false,
      summaryText: '조준할 알을 다시 선택해 주세요.',
    };
  }

  const dx = target.x - shooter.x;
  const dy = target.y - shooter.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / dist;
  const uy = dy / dist;

  // Move shooter to just before target impact point
  const followThrough = power === 'double' ? 14 : power === 'strong' ? 6 : -3;
  shooter.x = Number((target.x + ux * followThrough).toFixed(1));
  shooter.y = Number((target.y + uy * followThrough).toFixed(1));

  // Push target outward along impact vector
  const pushDist = power === 'double' ? 48 : power === 'strong' ? 42 : 34;
  target.x = Number((target.x + ux * pushDist).toFixed(1));
  target.y = Number((target.y + uy * pushDist).toFixed(1));

  let knockedOutEnemies = 0;
  const isOut = (s: { x: number; y: number }) => s.x < 6 || s.x > 94 || s.y < 6 || s.y > 94;

  if (isOut(target)) {
    target.alive = false;
    knockedOutEnemies += 1;
  }

  // Check secondary splash collision for 'double' or nearby enemy stone
  if (power === 'double') {
    const nearbyEnemy = next.find(
      (s) =>
        s.alive &&
        s.owner !== shooter.owner &&
        s.id !== target.id &&
        Math.hypot(s.x - shooter.x, s.y - shooter.y) <= 26,
    );
    if (nearbyEnemy) {
      nearbyEnemy.alive = false;
      knockedOutEnemies += 1;
    }
  }

  let shooterFellOut = false;
  if (isOut(shooter)) {
    // Protect last player stone from accidental tie-out if an enemy was knocked out
    const remainingAllies = next.filter((s) => s.alive && s.owner === shooter.owner && s.id !== shooter.id);
    if (remainingAllies.length > 0) {
      shooter.alive = false;
      shooterFellOut = true;
    } else {
      shooter.x = Math.min(90, Math.max(10, shooter.x));
      shooter.y = Math.min(90, Math.max(10, shooter.y));
    }
  }

  const doubleKnockout = knockedOutEnemies >= 2;
  const summaryText = doubleKnockout
    ? '통쾌한 일석이조! 상대 알 2개를 동시에 장외로 밀어냈습니다!'
    : knockedOutEnemies === 1
      ? '정확한 정타! 상대 알 1개를 바둑판 밖으로 떨어뜨렸습니다.'
      : '상대 알을 바둑판 가장자리로 강하게 밀어붙였습니다.';

  return {
    stones: next,
    knockedOutEnemies,
    shooterFellOut,
    doubleKnockout,
    summaryText,
  };
}

// --- SYS-04: Sacheonseong Tile Match ---
export interface SacheonseongMotif {
  id: string;
  name: string;
  hanja: string;
  symbol: string;
  accentColor: string;
  badgeBg: string;
}

export const SACHEONSEONG_MOTIFS: readonly SacheonseongMotif[] = [
  { id: 'crane', name: '송학', hanja: '鶴', symbol: '🦢', accentColor: '#0E5142', badgeBg: '#E4EDDA' },
  { id: 'plum', name: '홍매화', hanja: '梅', symbol: '🌸', accentColor: '#A83B35', badgeBg: '#FBE8E8' },
  { id: 'maple', name: '단풍', hanja: '楓', symbol: '🍁', accentColor: '#C2410C', badgeBg: '#FDE7DF' },
  { id: 'moon', name: '보름달', hanja: '月', symbol: '🌕', accentColor: '#855B00', badgeBg: '#FFF1C7' },
  { id: 'celadon', name: '청자', hanja: '壺', symbol: '🏺', accentColor: '#1E6F94', badgeBg: '#E5F4FA' },
  { id: 'turtle', name: '장수거북', hanja: '龜', symbol: '🐢', accentColor: '#277357', badgeBg: '#E3F3EA' },
] as const;

export interface SacheonseongCell {
  row: number;
  col: number;
  motifId: string | null;
}

export function createSacheonseongBoard(rows = 4, cols = 6): SacheonseongCell[][] {
  const total = rows * cols;
  const pairs = total / 2;
  const pool: string[] = [];
  for (let i = 0; i < pairs; i += 1) {
    const motif = SACHEONSEONG_MOTIFS[i % SACHEONSEONG_MOTIFS.length];
    pool.push(motif.id, motif.id);
  }
  // Deterministic senior-friendly pattern with immediate outer & inner matches
  const grid: SacheonseongCell[][] = [];
  let idx = 0;
  for (let r = 0; r < rows; r += 1) {
    const rowCells: SacheonseongCell[] = [];
    for (let c = 0; c < cols; c += 1) {
      const mappedIndex = (r * cols + c * 3) % pool.length;
      rowCells.push({ row: r, col: c, motifId: pool[idx < pool.length ? idx : mappedIndex] });
      idx += 1;
    }
    grid.push(rowCells);
  }
  return grid;
}

/** Returns orthogonal path points (with <= 2 turns / <= 4 points) if two matching tiles can connect, else null. */
export function findSacheonseongPath(
  board: readonly (readonly SacheonseongCell[])[],
  a: { row: number; col: number },
  b: { row: number; col: number },
): { row: number; col: number }[] | null {
  if (a.row === b.row && a.col === b.col) return null;
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const cellA = board[a.row]?.[a.col];
  const cellB = board[b.row]?.[b.col];
  if (!cellA?.motifId || !cellB?.motifId || cellA.motifId !== cellB.motifId) return null;

  // Padded grid (rows + 2) x (cols + 2) so outer border connections (<=2 turns) work naturally
  const isBlocked = (r: number, c: number) => {
    if ((r === a.row && c === a.col) || (r === b.row && c === b.col)) return false;
    if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
    return Boolean(board[r][c].motifId);
  };

  const clearSegment = (r1: number, c1: number, r2: number, c2: number): boolean => {
    if (r1 !== r2 && c1 !== c2) return false;
    if (r1 === r2) {
      const minC = Math.min(c1, c2);
      const maxC = Math.max(c1, c2);
      for (let c = minC; c <= maxC; c += 1) {
        if (isBlocked(r1, c)) return false;
      }
      return true;
    }
    const minR = Math.min(r1, r2);
    const maxR = Math.max(r1, r2);
    for (let r = minR; r <= maxR; r += 1) {
      if (isBlocked(r, c1)) return false;
    }
    return true;
  };

  // 0 turns (straight line)
  if (clearSegment(a.row, a.col, b.row, b.col)) {
    return [a, b];
  }

  // 1 turn (1 corner)
  const corners = [
    { row: a.row, col: b.col },
    { row: b.row, col: a.col },
  ];
  for (const corner of corners) {
    if (!isBlocked(corner.row, corner.col) &&
        clearSegment(a.row, a.col, corner.row, corner.col) &&
        clearSegment(corner.row, corner.col, b.row, b.col)) {
      return [a, corner, b];
    }
  }

  // 2 turns (2 corners, including 1-cell border outside the board)
  for (let r = -1; r <= rows; r += 1) {
    const c1 = { row: r, col: a.col };
    const c2 = { row: r, col: b.col };
    if (!isBlocked(c1.row, c1.col) && !isBlocked(c2.row, c2.col) &&
        clearSegment(a.row, a.col, c1.row, c1.col) &&
        clearSegment(c1.row, c1.col, c2.row, c2.col) &&
        clearSegment(c2.row, c2.col, b.row, b.col)) {
      return [a, c1, c2, b];
    }
  }
  for (let c = -1; c <= cols; c += 1) {
    const c1 = { row: a.row, col: c };
    const c2 = { row: b.row, col: c };
    if (!isBlocked(c1.row, c1.col) && !isBlocked(c2.row, c2.col) &&
        clearSegment(a.row, a.col, c1.row, c1.col) &&
        clearSegment(c1.row, c1.col, c2.row, c2.col) &&
        clearSegment(c2.row, c2.col, b.row, b.col)) {
      return [a, c1, c2, b];
    }
  }

  return null;
}

export function findFirstSacheonseongHint(
  board: readonly (readonly SacheonseongCell[])[],
): [{ row: number; col: number }, { row: number; col: number }] | null {
  const active: { row: number; col: number; motifId: string }[] = [];
  for (const row of board) {
    for (const cell of row) {
      if (cell.motifId) {
        active.push({ row: cell.row, col: cell.col, motifId: cell.motifId });
      }
    }
  }
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      if (active[i].motifId === active[j].motifId) {
        const path = findSacheonseongPath(board, active[i], active[j]);
        if (path) return [active[i], active[j]];
      }
    }
  }
  return null;
}

/** Rearranges only remaining motifs and tries to leave at least one legal pair. */
export function shuffleSacheonseongBoard(board: readonly (readonly SacheonseongCell[])[]): SacheonseongCell[][] {
  const slots = board.flat().filter((cell) => cell.motifId !== null);
  const motifs = slots.map((cell) => cell.motifId!);
  if (motifs.length > 2) motifs.push(motifs.shift()!);
  const withMotifs = (values: readonly string[]) => {
    let index = 0;
    return board.map((row) => row.map((cell) => cell.motifId ? { ...cell, motifId: values[index++] } : { ...cell }));
  };
  const rotated = withMotifs(motifs);
  if (findFirstSacheonseongHint(rotated)) return rotated;

  const pairTypes = [...new Set(motifs)].filter((motif) => motifs.filter((id) => id === motif).length >= 2);
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      for (const motif of pairTypes) {
        const values = [...motifs];
        let source = values.indexOf(motif);
        [values[i], values[source]] = [values[source], values[i]];
        source = values.findIndex((value, index) => value === motif && index !== i);
        [values[j], values[source]] = [values[source], values[j]];
        const candidate = withMotifs(values);
        if (findSacheonseongPath(candidate, slots[i], slots[j])) return candidate;
      }
    }
  }
  return rotated;
}

// --- Daily mission calendar reset ---
export interface DailyMissionFlags {
  parkGolfDone: boolean;
  alkkagiDone: boolean;
  sacheonseongDone: boolean;
  attendanceStampClaimed: boolean;
}

/** Local calendar date key in YYYY-MM-DD form. */
export function todayKey(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** True when the last recorded date is missing, empty, invalid, or different from today. */
export function isCalendarDayChanged(lastDate: string | null | undefined, today: string): boolean {
  if (!lastDate) return true;
  return lastDate !== today;
}

/**
 * Returns fresh all-false missions when the calendar day changed since `lastDate`;
 * otherwise returns `missions` unchanged. A missing `lastDate` counts as a day change.
 */
export function resetDailyMissions<T extends Partial<DailyMissionFlags>>(
  missions: T,
  today: string,
  lastDate: string | null | undefined = null,
): T {
  if (!isCalendarDayChanged(lastDate, today)) return missions;
  return {
    parkGolfDone: false,
    alkkagiDone: false,
    sacheonseongDone: false,
    attendanceStampClaimed: false,
  } as T;
}
