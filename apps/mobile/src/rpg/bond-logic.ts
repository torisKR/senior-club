/**
 * NPC 유대(관계) 로직 — 순수 함수.
 *
 * 성장의 두 번째 축입니다. CP가 "실력"이라면 유대는 "함께한 시간"입니다.
 * 이동(동행 산책)·미니게임(함께 한 판)·선물로 쌓이고, 단계마다 대사·에피소드·소품이 열립니다.
 * React/Expo에 의존하지 않아 테스트로 고정합니다.
 */

export type NpcId = 'chief' | 'golf_captain' | 'baduk_master' | 'tea_manager' | 'herbalist';

export const NPC_IDS: readonly NpcId[] = [
  'chief',
  'golf_captain',
  'baduk_master',
  'tea_manager',
  'herbalist',
] as const;

export interface NpcBond {
  npcId: NpcId;
  /** 누적 유대 포인트 */
  points: number;
  /** 마지막으로 산책 보상을 받은 날 (YYYY-MM-DD) */
  lastWalkDay: string | null;
  /** 마지막으로 차/선물을 건넨 날 */
  lastGiftDay: string | null;
  /** 재생한 개인 에피소드 id */
  scenesSeen: string[];
}

/** 단계별 누적 유대 기준 (0~5단계) */
export const BOND_THRESHOLDS = [0, 20, 50, 90, 140, 200] as const;

export const BOND_LEVEL_LABELS = [
  '낯선 사이',
  '인사하는 사이',
  '함께 걷는 사이',
  '마음을 나누는 사이',
  '가족 같은 사이',
  '평생의 벗',
] as const;

export const BOND_REWARDS = {
  dailyWalk: 15,
  gameTogether: 8,
  gift: 10,
} as const;

export function createInitialBonds(): NpcBond[] {
  return NPC_IDS.map((npcId) => ({
    npcId,
    points: 0,
    lastWalkDay: null,
    lastGiftDay: null,
    scenesSeen: [],
  }));
}

/** 저장된 값을 안전하게 복원합니다. 없는 NPC·잘못된 타입은 기본값으로 보정합니다. */
export function normalizeBonds(saved: unknown): NpcBond[] {
  const base = createInitialBonds();
  if (!Array.isArray(saved)) return base;
  return base.map((fallback) => {
    const row = saved.find(
      (item): item is Partial<NpcBond> =>
        typeof item === 'object' && item !== null && (item as Partial<NpcBond>).npcId === fallback.npcId,
    );
    if (!row) return fallback;
    return {
      ...fallback,
      points: typeof row.points === 'number' && Number.isFinite(row.points) ? Math.max(0, row.points) : 0,
      lastWalkDay: typeof row.lastWalkDay === 'string' ? row.lastWalkDay : null,
      lastGiftDay: typeof row.lastGiftDay === 'string' ? row.lastGiftDay : null,
      scenesSeen: Array.isArray(row.scenesSeen)
        ? row.scenesSeen.filter((id): id is string => typeof id === 'string')
        : [],
    };
  });
}

export function bondLevel(points: number): 0 | 1 | 2 | 3 | 4 | 5 {
  const safe = Math.max(0, Math.floor(points));
  let level = 0;
  for (let i = 0; i < BOND_THRESHOLDS.length; i += 1) {
    if (safe >= BOND_THRESHOLDS[i]) level = i;
  }
  return level as 0 | 1 | 2 | 3 | 4 | 5;
}

export function bondLevelLabel(level: number): string {
  const index = Math.min(BOND_LEVEL_LABELS.length - 1, Math.max(0, Math.floor(level)));
  return BOND_LEVEL_LABELS[index];
}

/** 다음 단계까지의 진행도. 최고 단계면 ratio 1, needed 0. */
export function bondProgress(points: number): {
  level: number;
  label: string;
  into: number;
  needed: number;
  ratio: number;
} {
  const level = bondLevel(points);
  const label = bondLevelLabel(level);
  if (level >= BOND_THRESHOLDS.length - 1) {
    return { level, label, into: points - BOND_THRESHOLDS[level], needed: 0, ratio: 1 };
  }
  const from = BOND_THRESHOLDS[level];
  const to = BOND_THRESHOLDS[level + 1];
  const into = Math.max(0, points - from);
  return { level, label, into, needed: Math.max(0, to - points), ratio: Math.min(1, into / (to - from)) };
}

export function getBond(bonds: readonly NpcBond[], npcId: NpcId): NpcBond {
  return bonds.find((bond) => bond.npcId === npcId) ?? {
    npcId,
    points: 0,
    lastWalkDay: null,
    lastGiftDay: null,
    scenesSeen: [],
  };
}

/** 유대 포인트를 더합니다. 상한은 두지 않지만 0 미만으로 내려가지 않습니다. */
export function addBond(
  bonds: readonly NpcBond[],
  npcId: NpcId,
  amount: number,
): NpcBond[] {
  return NPC_IDS.map((id) => {
    const current = getBond(bonds, id);
    if (id !== npcId) return current;
    return { ...current, points: Math.max(0, current.points + amount) };
  });
}

export function canClaimDailyWalk(bond: NpcBond, today: string): boolean {
  return bond.lastWalkDay !== today;
}

/** 하루 1회 산책 보상. 이미 받았다면 그대로 돌려줍니다. */
export function claimDailyWalk(
  bonds: readonly NpcBond[],
  npcId: NpcId,
  today: string,
): NpcBond[] {
  const bond = getBond(bonds, npcId);
  if (!canClaimDailyWalk(bond, today)) return bonds.map((item) => getBond(bonds, item.npcId));
  return addBond(bonds, npcId, BOND_REWARDS.dailyWalk).map((item) =>
    item.npcId === npcId ? { ...item, lastWalkDay: today } : item,
  );
}

export function markSceneSeen(
  bonds: readonly NpcBond[],
  npcId: NpcId,
  sceneId: string,
): NpcBond[] {
  return bonds.map((bond) =>
    bond.npcId === npcId && !bond.scenesSeen.includes(sceneId)
      ? { ...bond, scenesSeen: [...bond.scenesSeen, sceneId] }
      : bond,
  );
}

/** 승급 연출·기록에 쓸 "가장 가까운 사람". 전부 0이면 null. */
export function closestNpc(bonds: readonly NpcBond[]): NpcId | null {
  let best: NpcBond | null = null;
  for (const bond of bonds) {
    if (bond.points <= 0) continue;
    if (!best || bond.points > best.points) best = bond;
  }
  return best?.npcId ?? null;
}

/** 마음 온도: 0~100으로 자릅니다. */
export function clampWarmth(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
