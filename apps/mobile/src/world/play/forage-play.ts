/**
 * 풀숲 헤치기 놀이의 판정: 덤불 여러 개 중 바스락거리는 곳을 문질러 채집물을 찾습니다. 순수 함수만 둡니다.
 */
export type BushContent = 'item' | 'bonus' | 'empty';
export interface Bush {
  content: BushContent;
  /** 헤치기까지 남은 손길 수. 0이면 열린 덤불입니다. */
  cover: number;
  /** 처음 덮여 있던 정도 (그림 크기를 줄여 보여 주는 데 씁니다) */
  fullCover: number;
  rustles: boolean;
}
export interface ForageRound {
  bushes: readonly Bush[];
  bonusAcorns: number;
  found: boolean;
}

export const BUSH_COLUMNS = 3;
export const BUSH_ROWS = 2;
export const BUSH_COUNT = BUSH_COLUMNS * BUSH_ROWS;
export const BONUS_ACORNS = 3;
const BONUS_CHANCE = 0.3;
const DECOY_CHANCE = 0.35;
const MIN_COVER = 3;
const COVER_SPREAD = 3;
/** 이만큼 문지르면 손길 한 번으로 칩니다. */
export const RUB_DP_PER_STROKE = 36;

/** 채집물 하나, 가끔 도토리 더미 하나, 가끔 바스락거리기만 하는 빈 덤불 하나. */
export function createForageRound(rand: () => number): ForageRound {
  const free = Array.from({ length: BUSH_COUNT }, (_, index) => index);
  const take = () => free.splice(Math.min(free.length - 1, Math.floor(rand() * free.length)), 1)[0];
  const itemIndex = take();
  const bonusIndex = rand() < BONUS_CHANCE ? take() : -1;
  const decoyIndex = rand() < DECOY_CHANCE ? take() : -1;
  const bushes = Array.from({ length: BUSH_COUNT }, (_, index): Bush => {
    const cover = MIN_COVER + Math.min(COVER_SPREAD - 1, Math.floor(rand() * COVER_SPREAD));
    const content: BushContent = index === itemIndex ? 'item' : index === bonusIndex ? 'bonus' : 'empty';
    return { content, cover, fullCover: cover, rustles: content !== 'empty' || index === decoyIndex };
  });
  return { bushes, bonusAcorns: 0, found: false };
}

/** 덤불을 strokes번 헤칩니다. 다 헤치면 안에 든 것이 나옵니다. */
export function strokeBush(round: ForageRound, index: number, strokes: number): ForageRound {
  const bush = round.bushes[index];
  if (round.found || !bush || bush.cover <= 0 || strokes <= 0) return round;
  const cover = Math.max(0, bush.cover - strokes);
  const opened = cover === 0;
  return {
    bushes: round.bushes.map((current, at) => (at === index ? { ...current, cover } : current)),
    bonusAcorns: round.bonusAcorns + (opened && bush.content === 'bonus' ? BONUS_ACORNS : 0),
    found: opened && bush.content === 'item',
  };
}

/** 한 번에 끝까지 헤칩니다(단순 모드). */
export function clearBush(round: ForageRound, index: number): ForageRound {
  return strokeBush(round, index, round.bushes[index]?.cover ?? 0);
}

/** 덤불밭(가로 3 × 세로 2) 안의 손가락 위치가 몇 번째 덤불인지. 밖이면 -1. */
export function bushAt(x: number, y: number, width: number, height: number): number {
  if (width <= 0 || height <= 0 || x < 0 || y < 0 || x >= width || y >= height) return -1;
  return Math.floor((y / height) * BUSH_ROWS) * BUSH_COLUMNS + Math.floor((x / width) * BUSH_COLUMNS);
}

/** 문지른 거리를 손길 수로 바꾸고, 남은 거리는 다음으로 넘깁니다. */
export function rubStrokes(carryDp: number, movedDp: number): { strokes: number; carryDp: number } {
  const total = carryDp + movedDp;
  const strokes = Math.floor(total / RUB_DP_PER_STROKE);
  return { strokes, carryDp: total - strokes * RUB_DP_PER_STROKE };
}
