import { describe, expect, it } from 'vitest';

import {
  BONUS_ACORNS,
  BUSH_COUNT,
  bushAt,
  clearBush,
  createForageRound,
  rubStrokes,
  strokeBush,
} from './forage-play';

/** 정해진 값을 차례로 돌려주는 난수. */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

describe('풀숲 헤치기 판', () => {
  it('always hides exactly one item under a rustling bush', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      let value = seed / 40;
      const round = createForageRound(() => { value = (value * 9301 + 0.2113) % 1; return value; });
      expect(round.bushes).toHaveLength(BUSH_COUNT);
      const items = round.bushes.filter((bush) => bush.content === 'item');
      expect(items).toHaveLength(1);
      expect(items[0].rustles).toBe(true);
      expect(round.bushes.filter((bush) => bush.content === 'bonus').length).toBeLessThanOrEqual(1);
      expect(round.bushes.every((bush) => bush.cover >= 3 && bush.cover <= 5)).toBe(true);
      expect(round.bushes.every((bush) => bush.content === 'empty' || bush.rustles)).toBe(true);
    }
  });

  it('sometimes adds a bonus acorn pile and an empty rustling decoy', () => {
    const plain = createForageRound(sequence([0.99]));
    expect(plain.bushes.filter((bush) => bush.rustles)).toHaveLength(1);
    const lively = createForageRound(sequence([0]));
    expect(lively.bushes.some((bush) => bush.content === 'bonus')).toBe(true);
    expect(lively.bushes.some((bush) => bush.content === 'empty' && bush.rustles)).toBe(true);
  });
});

describe('헤치기', () => {
  const round = createForageRound(sequence([0]));
  const itemIndex = round.bushes.findIndex((bush) => bush.content === 'item');
  const bonusIndex = round.bushes.findIndex((bush) => bush.content === 'bonus');
  const emptyIndex = round.bushes.findIndex((bush) => bush.content === 'empty');

  it('needs several strokes before a bush opens', () => {
    const once = strokeBush(round, itemIndex, 1);
    expect(once.found).toBe(false);
    expect(once.bushes[itemIndex].cover).toBe(round.bushes[itemIndex].cover - 1);
    expect(round.bushes[itemIndex].cover).toBeGreaterThan(once.bushes[itemIndex].cover);
    expect(strokeBush(once, itemIndex, 10).found).toBe(true);
  });

  it('collects the bonus only once and keeps the round going after an empty bush', () => {
    const afterEmpty = clearBush(round, emptyIndex);
    expect(afterEmpty).toMatchObject({ found: false, bonusAcorns: 0 });
    const afterBonus = clearBush(afterEmpty, bonusIndex);
    expect(afterBonus).toMatchObject({ found: false, bonusAcorns: BONUS_ACORNS });
    expect(clearBush(afterBonus, bonusIndex)).toBe(afterBonus);
    expect(clearBush(afterBonus, itemIndex)).toMatchObject({ found: true, bonusAcorns: BONUS_ACORNS });
  });

  it('stops changing once the item is found and ignores places with no bush', () => {
    const found = clearBush(round, itemIndex);
    expect(clearBush(found, bonusIndex)).toBe(found);
    expect(strokeBush(round, -1, 3)).toBe(round);
    expect(strokeBush(round, BUSH_COUNT, 3)).toBe(round);
    expect(strokeBush(round, itemIndex, 0)).toBe(round);
  });
});

describe('손가락 위치와 문지르기', () => {
  it('maps a touch to the bush under the finger', () => {
    expect(bushAt(10, 10, 300, 200)).toBe(0);
    expect(bushAt(290, 10, 300, 200)).toBe(2);
    expect(bushAt(150, 190, 300, 200)).toBe(4);
    expect(bushAt(-5, 10, 300, 200)).toBe(-1);
    expect(bushAt(10, 220, 300, 200)).toBe(-1);
    expect(bushAt(10, 10, 0, 0)).toBe(-1);
  });

  it('turns rubbing distance into strokes and carries the remainder', () => {
    expect(rubStrokes(0, 20)).toEqual({ strokes: 0, carryDp: 20 });
    expect(rubStrokes(20, 20)).toEqual({ strokes: 1, carryDp: 4 });
    expect(rubStrokes(0, 80)).toEqual({ strokes: 2, carryDp: 8 });
  });
});
