export interface FacilityState {
  id: 'parkgolf' | 'alkkagi' | 'sacheonseong' | 'community_hall';
  name: string;
  level: number;
  baseAcornsPerSec: number;
  baseExpPerSec: number;
  assignedPartnerId: string | null;
  upgradeCost: number;
}

export interface PartnerCompanion {
  id: string;
  name: string;
  roleTitle: string;
  avatar: string;
  description: string;
  assignedFacilityId: string | null;
  acornMultiplier: number;
  expMultiplier: number;
  recruited: boolean;
  recruitCost: number;
}

export const DEFAULT_FACILITIES: readonly FacilityState[] = [
  {
    id: 'community_hall',
    name: '청솔 마을회관',
    level: 1,
    baseAcornsPerSec: 1,
    baseExpPerSec: 1,
    assignedPartnerId: 'chief_kim',
    upgradeCost: 100,
  },
  {
    id: 'parkgolf',
    name: '파크골프 잔디구장',
    level: 1,
    baseAcornsPerSec: 3,
    baseExpPerSec: 2,
    assignedPartnerId: 'captain_park',
    upgradeCost: 150,
  },
  {
    id: 'alkkagi',
    name: '송학기원 대국실',
    level: 1,
    baseAcornsPerSec: 2,
    baseExpPerSec: 4,
    assignedPartnerId: 'master_choi',
    upgradeCost: 180,
  },
  {
    id: 'sacheonseong',
    name: '매화다실 수련방',
    level: 1,
    baseAcornsPerSec: 3,
    baseExpPerSec: 3,
    assignedPartnerId: null,
    upgradeCost: 200,
  },
] as const;

export const DEFAULT_PARTNERS: readonly PartnerCompanion[] = [
  {
    id: 'chief_kim',
    name: '김 이장',
    roleTitle: '마을 총괄 어르신',
    avatar: '👴',
    description: '마을회관 배치 시 전체 생산량 1.3배 상승',
    assignedFacilityId: 'community_hall',
    acornMultiplier: 1.3,
    expMultiplier: 1.3,
    recruited: true,
    recruitCost: 0,
  },
  {
    id: 'captain_park',
    name: '박 캡틴',
    roleTitle: '파크골프 반장',
    avatar: '🏌️',
    description: '파크골프장 배치 시 도토리 수급 1.8배 특화',
    assignedFacilityId: 'parkgolf',
    acornMultiplier: 1.8,
    expMultiplier: 1.2,
    recruited: true,
    recruitCost: 0,
  },
  {
    id: 'master_choi',
    name: '최 사범',
    roleTitle: '송학기원 원장',
    avatar: '🥋',
    description: '기원 배치 시 연륜 EXP 생산 1.8배 특화',
    assignedFacilityId: 'alkkagi',
    acornMultiplier: 1.2,
    expMultiplier: 1.8,
    recruited: true,
    recruitCost: 0,
  },
  {
    id: 'tea_lady_lee',
    name: '이 다도명인',
    roleTitle: '매화다실 안주인',
    avatar: '🍵',
    description: '다실 배치 시 도토리/EXP 균형 1.5배 증가',
    assignedFacilityId: null,
    acornMultiplier: 1.5,
    expMultiplier: 1.5,
    recruited: false,
    recruitCost: 250,
  },
  {
    id: 'herbalist_kang',
    name: '강 원장',
    roleTitle: '청솔 한약방',
    avatar: '🌿',
    description: '어느 시설에나 활력과 생산 시너지 1.4배 부여',
    assignedFacilityId: null,
    acornMultiplier: 1.4,
    expMultiplier: 1.4,
    recruited: false,
    recruitCost: 350,
  },
] as const;

export function calculateProductionRate(
  facilities: readonly FacilityState[],
  partners: readonly PartnerCompanion[],
) {
  let totalAcornsPerSec = 0;
  let totalExpPerSec = 0;

  for (const facility of facilities) {
    const partner = partners.find((p) => p.assignedFacilityId === facility.id && p.recruited);
    const levelBonus = 1 + (facility.level - 1) * 0.4;
    const acornMul = partner ? partner.acornMultiplier : 1;
    const expMul = partner ? partner.expMultiplier : 1;

    totalAcornsPerSec += facility.baseAcornsPerSec * levelBonus * acornMul;
    totalExpPerSec += facility.baseExpPerSec * levelBonus * expMul;
  }

  return {
    acornsPerSec: Number(totalAcornsPerSec.toFixed(1)),
    expPerSec: Number(totalExpPerSec.toFixed(1)),
  };
}

export function calculateOfflineIdleRewards(
  lastTimestampMs: number,
  nowTimestampMs: number,
  facilities: readonly FacilityState[],
  partners: readonly PartnerCompanion[],
) {
  const elapsedSec = Math.max(0, Math.floor((nowTimestampMs - lastTimestampMs) / 1000));
  if (elapsedSec < 10) {
    return null;
  }

  // The game plan caps accumulated offline rewards at eight hours.
  const maxHours = 8;
  const maxCapSec = maxHours * 3600;
  const cappedElapsedSec = Math.min(elapsedSec, maxCapSec);

  const { acornsPerSec, expPerSec } = calculateProductionRate(facilities, partners);
  const earnedAcorns = Math.floor(acornsPerSec * cappedElapsedSec);
  const earnedExp = Math.floor(expPerSec * cappedElapsedSec);

  return {
    elapsedSec,
    cappedElapsedSec,
    maxHours,
    earnedAcorns,
    earnedExp,
  };
}
