import type { AlkkagiStone } from './arcade-logic';
import type { AlkkagiAiLevel } from './alkkagi-ai';
import { ALKKAGI_MAX_SPEED, simulateAlkkagiShot } from './alkkagi-physics';
import type { AlkkagiRound } from './round-save';

/**
 * 알까기 조작·이야기 시련 다듬기 수치 (순수 함수·상수). 기준은 alkkagi-balance.test.ts 가 시뮬레이션으로 고정합니다.
 * 자유 대국의 상대 실력(ALKKAGI_AI_LEVELS)·배치·보상은 여기서 바꾸지 않습니다.
 */
export type AlkkagiPowerMode = AlkkagiRound['powerMode'];

/**
 * 버튼으로 튕길 때의 힘. 저장 형식(powerMode)은 그대로 씁니다.
 * 살살(60%)은 시작 배치에서 상대 돌을 판 밖으로 밀어내지 못합니다(밀어내려면 약 80%부터) — 설명에 분명히 적습니다.
 */
export const ALKKAGI_BUTTON_POWERS: readonly { id: AlkkagiPowerMode; label: string; sub: string; power: number; canKnockOut: boolean }[] = [
  { id: 'precision', label: '살살', sub: '힘 60% · 상대 돌을 밀어내기엔 약해요', power: 0.6, canKnockOut: false },
  { id: 'strong', label: '보통', sub: '힘 80% · 가까운 돌 밀어내기', power: 0.8, canKnockOut: true },
  { id: 'double', label: '세게', sub: '힘 100% · 멀리 밀어내기', power: 1, canKnockOut: true },
];
/** 저장본이 없을 때 처음 골라 두는 힘. */
export const ALKKAGI_DEFAULT_POWER_MODE: AlkkagiPowerMode = 'strong';
export const ALKKAGI_WEAK_POWER_NOTE = '살살은 상대 돌을 판 밖으로 밀어내기엔 약해요. 밀어내려면 보통이나 세게를 고르세요.';

/** 승리와 함께 일석이조까지 이뤄야 하는 이야기 시련(5막)인지. 2막은 승리만 하면 됩니다(story-progress 와 같은 기준). */
export function isDoubleKnockoutTrial(chapterId: string | undefined): boolean {
  return chapterId !== undefined && chapterId !== 'chapter_2';
}

/** 일석이조 시련의 상대: 명인과 같은 방식으로 두되 조준이 조금 더 흔들립니다(명인 ±6°). */
export const ALKKAGI_TRIAL_AI_LEVEL: AlkkagiAiLevel = { aimErrorDeg: 8, powerMin: 0.65, powerMax: 1, plan: 'nearest' };

/**
 * 일석이조 시련의 시작 배치: 상대 돌이 양옆 가장자리에 두 개씩 붙어 있어,
 * 가까운 내 돌(★2·★4)로 길게 당겨 치면 두 개가 함께 나가는 각이 넓습니다.
 */
export function createTrialAlkkagiStones(): AlkkagiStone[] {
  return [
    { id: 'p1', owner: 'player', x: 20, y: 78, alive: true },
    { id: 'p2', owner: 'player', x: 35, y: 74, alive: true },
    { id: 'p3', owner: 'player', x: 50, y: 78, alive: true },
    { id: 'p4', owner: 'player', x: 65, y: 74, alive: true },
    { id: 'p5', owner: 'player', x: 80, y: 78, alive: true },
    { id: 'a1', owner: 'ai', x: 14, y: 30.5, alive: true },
    { id: 'a2', owner: 'ai', x: 14, y: 45, alive: true },
    { id: 'a3', owner: 'ai', x: 50, y: 20, alive: true },
    { id: 'a4', owner: 'ai', x: 86, y: 30.5, alive: true },
    { id: 'a5', owner: 'ai', x: 86, y: 45, alive: true },
  ];
}

/** 손이 조금 흔들려도 되도록, 조준 각도 양옆 이만큼(도)에서도 일석이조가 나올 때만 알려 줍니다. */
const DOUBLE_HINT_MARGIN_DEG = 2;

/**
 * "일석이조 각" 안내: 이 방향·힘(0~1)으로 튕기면 상대 돌 두 개 이상이 판 밖으로 나가는지 미리 굴려 봅니다.
 * 방향은 조준 보조까지 적용한 실제 날아갈 방향입니다.
 */
export function isDoubleKnockoutAim(stones: readonly AlkkagiStone[], shooterId: string, dirX: number, dirY: number, power: number): boolean {
  const speed = Math.max(0, Math.min(1, power)) * ALKKAGI_MAX_SPEED;
  const base = Math.atan2(dirY, dirX);
  return [0, -DOUBLE_HINT_MARGIN_DEG, DOUBLE_HINT_MARGIN_DEG].every((offsetDeg) => {
    const angle = base + (offsetDeg * Math.PI) / 180;
    const { knockedOut } = simulateAlkkagiShot(stones, { stoneId: shooterId, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
    return knockedOut.filter((id) => id.startsWith('a')).length >= 2;
  });
}
