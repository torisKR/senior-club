import { describe, expect, it } from 'vitest';

import {
  addBond,
  normalizeBonds,
  bondLevel,
  bondLevelLabel,
  bondProgress,
  canClaimDailyWalk,
  claimDailyWalk,
  closestNpc,
  clampWarmth,
  createInitialBonds,
  getBond,
  markSceneSeen,
  type NpcBond,
} from './bond-logic';

const today = '2026-11-05';
const withPoints = (npcId: NpcBond['npcId'], points: number): NpcBond[] => {
  const bonds = createInitialBonds();
  return bonds.map((bond) => (bond.npcId === npcId ? { ...bond, points } : bond));
};

describe('bondLevel', () => {
  it('누적 포인트로 0~5단계를 판정한다', () => {
    expect(bondLevel(0)).toBe(0);
    expect(bondLevel(19)).toBe(0);
    expect(bondLevel(20)).toBe(1);
    expect(bondLevel(50)).toBe(2);
    expect(bondLevel(90)).toBe(3);
    expect(bondLevel(140)).toBe(4);
    expect(bondLevel(200)).toBe(5);
    expect(bondLevel(9999)).toBe(5);
  });

  it('음수는 0단계로 취급한다', () => {
    expect(bondLevel(-30)).toBe(0);
  });

  it('단계 이름이 있다', () => {
    expect(bondLevelLabel(0)).toBe('낯선 사이');
    expect(bondLevelLabel(2)).toBe('함께 걷는 사이');
    expect(bondLevelLabel(5)).toBe('평생의 벗');
  });
});

describe('bondProgress', () => {
  it('다음 단계까지 남은 양을 계산한다', () => {
    const progress = bondProgress(35);
    expect(progress.level).toBe(1);
    expect(progress.into).toBe(15);
    expect(progress.needed).toBe(15);
    expect(progress.ratio).toBeCloseTo(15 / 30, 5);
  });

  it('최고 단계는 가득 찬 상태로 둔다', () => {
    expect(bondProgress(240)).toEqual({
      level: 5,
      label: '평생의 벗',
      into: 40,
      needed: 0,
      ratio: 1,
    });
  });
});

describe('addBond / getBond', () => {
  it('해당 NPC만 포인트가 오른다', () => {
    const bonds = addBond(createInitialBonds(), 'golf_captain', 8);
    expect(getBond(bonds, 'golf_captain').points).toBe(8);
    expect(getBond(bonds, 'chief').points).toBe(0);
  });

  it('0 미만으로 내려가지 않는다', () => {
    const bonds = addBond(withPoints('chief', 5), 'chief', -20);
    expect(getBond(bonds, 'chief').points).toBe(0);
  });

  it('없는 항목을 조회해도 기본값을 돌려준다', () => {
    expect(getBond([], 'herbalist')).toMatchObject({ npcId: 'herbalist', points: 0 });
  });
});

describe('daily walk', () => {
  it('오늘 아직 안 걸었으면 보상을 받을 수 있다', () => {
    expect(canClaimDailyWalk(getBond(createInitialBonds(), 'chief'), today)).toBe(true);
  });

  it('보상은 하루 한 번만 적용된다', () => {
    const once = claimDailyWalk(createInitialBonds(), 'chief', today);
    expect(getBond(once, 'chief').points).toBe(15);
    expect(getBond(once, 'chief').lastWalkDay).toBe(today);

    const twice = claimDailyWalk(once, 'chief', today);
    expect(getBond(twice, 'chief').points).toBe(15);
  });

  it('다음 날에는 다시 받을 수 있다', () => {
    const once = claimDailyWalk(createInitialBonds(), 'tea_manager', today);
    const nextDay = claimDailyWalk(once, 'tea_manager', '2026-11-06');
    expect(getBond(nextDay, 'tea_manager').points).toBe(30);
  });
});

describe('markSceneSeen / closestNpc', () => {
  it('에피소드는 중복 저장하지 않는다', () => {
    let bonds = markSceneSeen(createInitialBonds(), 'baduk_master', 'choi_1');
    bonds = markSceneSeen(bonds, 'baduk_master', 'choi_1');
    expect(getBond(bonds, 'baduk_master').scenesSeen).toEqual(['choi_1']);
  });

  it('가장 가까운 사람을 찾고, 전부 0이면 null', () => {
    expect(closestNpc(createInitialBonds())).toBeNull();
    const bonds = addBond(addBond(createInitialBonds(), 'chief', 30), 'herbalist', 60);
    expect(closestNpc(bonds)).toBe('herbalist');
  });
});

describe('normalizeBonds', () => {
  it('저장값이 없으면 전부 기본값', () => {
    expect(normalizeBonds(undefined)).toEqual(createInitialBonds());
  });

  it('저장된 포인트·날짜·에피소드를 복원한다', () => {
    const restored = normalizeBonds([
      { npcId: 'chief', points: 42, lastWalkDay: today, scenesSeen: ['chief_1'], lastGiftDay: null },
    ]);
    const chief = restored.find((bond) => bond.npcId === 'chief');
    expect(chief).toMatchObject({ points: 42, lastWalkDay: today, scenesSeen: ['chief_1'] });
  });

  it('잘못된 타입은 버리고 기본값을 쓴다', () => {
    const restored = normalizeBonds([
      { npcId: 'golf_captain', points: 'many', lastWalkDay: 5, scenesSeen: [1, 'ok'] },
    ]);
    const captain = restored.find((bond) => bond.npcId === 'golf_captain');
    expect(captain).toMatchObject({ points: 0, lastWalkDay: null, scenesSeen: ['ok'] });
  });

  it('항상 5명 전원을 돌려준다', () => {
    expect(normalizeBonds([]).map((bond) => bond.npcId)).toEqual([
      'chief',
      'golf_captain',
      'baduk_master',
      'tea_manager',
      'herbalist',
    ]);
  });
});

describe('clampWarmth', () => {
  it('0~100으로 자른다', () => {
    expect(clampWarmth(-5)).toBe(0);
    expect(clampWarmth(55.6)).toBe(56);
    expect(clampWarmth(180)).toBe(100);
  });
});
