import { describe, expect, it } from 'vitest';

import {
  buyFurniture,
  canRest,
  createLife,
  CROPS,
  cropStage,
  FISH,
  FISH_CATCH_WINDOW_MS,
  harvestPlot,
  houseComfort,
  isCatchInTime,
  markRested,
  normalizeLife,
  placeFurniture,
  plantCrop,
  recordCatch,
  rollBiteDelayMs,
  rollFish,
  waterPlot,
  writeDiary,
} from './life';

const HOUR = 60 * 60 * 1000;

describe('garden', () => {
  it('grows a lettuce from sprout to harvest over two real hours', () => {
    const life = plantCrop(createLife(), 0, 'lettuce', 0)!;
    expect(cropStage(life.garden[0], 0)).toBe(0);
    expect(cropStage(life.garden[0], 1 * HOUR)).toBe(1);
    expect(cropStage(life.garden[0], 2 * HOUR)).toBe(2);
    expect(harvestPlot(life, 0, 1.9 * HOUR)).toBeNull();
    const harvest = harvestPlot(life, 0, 2 * HOUR)!;
    expect(harvest.acorns).toBe(CROPS.lettuce.acorns);
    expect(harvest.life.garden[0].cropId).toBeNull();
  });

  it('does not plant over an occupied plot', () => {
    const life = plantCrop(createLife(), 1, 'tomato', 0)!;
    expect(plantCrop(life, 1, 'lettuce', 0)).toBeNull();
  });

  it('lets one watering a day bring the harvest forward by a quarter', () => {
    const planted = plantCrop(createLife(), 0, 'tomato', 0)!;
    const watered = waterPlot(planted, 0, '2026-11-12', 0)!;
    expect(waterPlot(watered, 0, '2026-11-12', 0)).toBeNull();
    expect(cropStage(watered.garden[0], 6 * HOUR)).toBe(2);
    expect(cropStage(planted.garden[0], 6 * HOUR)).toBe(1);
    expect(waterPlot(watered, 0, '2026-11-13', 1 * HOUR)).not.toBeNull();
  });
});

describe('fishing', () => {
  it('picks every fish across the random range, rare golden carp last', () => {
    expect(rollFish(0).id).toBe('minnow');
    expect(rollFish(0.9999).id).toBe('golden');
    const seen = new Set(Array.from({ length: 100 }, (_, i) => rollFish(i / 100).id));
    expect(seen.size).toBe(FISH.length);
  });

  it('waits 2 to 6 seconds for a bite', () => {
    expect(rollBiteDelayMs(0)).toBe(2000);
    expect(rollBiteDelayMs(1)).toBe(6000);
  });

  it('accepts a tap within the generous window only after the bobber moves', () => {
    expect(isCatchInTime(1000, 999)).toBe(false);
    expect(isCatchInTime(1000, 1000 + FISH_CATCH_WINDOW_MS)).toBe(true);
    expect(isCatchInTime(1000, 1001 + FISH_CATCH_WINDOW_MS)).toBe(false);
  });

  it('counts catches in the fish log', () => {
    const life = recordCatch(recordCatch(createLife(), 'carp'), 'carp');
    expect(life.fishLog.carp).toBe(2);
  });
});

describe('house', () => {
  it('buys furniture once when there are enough acorns', () => {
    expect(buyFurniture(createLife(), 'cabinet', 299)).toBeNull();
    const bought = buyFurniture(createLife(), 'radio', 500)!;
    expect(bought.cost).toBe(150);
    expect(buyFurniture(bought.life, 'radio', 500)).toBeNull();
  });

  it('places only owned furniture and moves it between slots', () => {
    const owned = buyFurniture(createLife(), 'orchid', 100)!.life;
    expect(placeFurniture(createLife(), 0, 'orchid')).toBeNull();
    const first = placeFurniture(owned, 0, 'orchid')!;
    const moved = placeFurniture(first, 3, 'orchid')!;
    expect(moved.houseSlots[0]).toBeNull();
    expect(moved.houseSlots[3]).toBe('orchid');
    expect(houseComfort(moved)).toBe(1);
  });
});

describe('rest and diary', () => {
  it('rests once a day', () => {
    const rested = markRested(createLife(), '2026-11-12');
    expect(canRest(rested, '2026-11-12')).toBe(false);
    expect(canRest(rested, '2026-11-13')).toBe(true);
  });

  it('keeps one trimmed line per day', () => {
    expect(writeDiary(createLife(), '2026-11-12', '   ')).toBeNull();
    const first = writeDiary(createLife(), '2026-11-12', ' 연못에서 붕어를 낚았다 ')!;
    const again = writeDiary(first, '2026-11-12', '이장님과 산책했다')!;
    expect(again.diary).toEqual([{ day: '2026-11-12', text: '이장님과 산책했다' }]);
  });
});

describe('normalizeLife', () => {
  it('drops unknown or tampered values from a save', () => {
    const life = normalizeLife({
      garden: [{ cropId: 'durian', plantedAtMs: 1 }, { cropId: 'pepper', plantedAtMs: 'x', waterBonusMs: -5 }],
      fishLog: { carp: 3, whale: 9 },
      ownedFurniture: ['radio', 'sofa', 'radio'],
      houseSlots: ['radio', 'radio', 'cabinet'],
      lastRestDay: 'yesterday',
      diary: [{ day: '2026-11-12', text: 'ok' }, { day: 'bad', text: 'x' }],
    });
    expect(life.garden).toHaveLength(4);
    expect(life.garden[0].cropId).toBeNull();
    expect(life.garden[1]).toMatchObject({ cropId: 'pepper', plantedAtMs: 0, waterBonusMs: 0 });
    expect(life.fishLog).toEqual({ carp: 3 });
    expect(life.ownedFurniture).toEqual(['radio']);
    expect(life.houseSlots).toEqual(['radio', null, null, null, null, null]);
    expect(life.lastRestDay).toBeNull();
    expect(life.diary).toEqual([{ day: '2026-11-12', text: 'ok' }]);
  });

  it('starts fresh for a save without life data', () => {
    expect(normalizeLife(undefined)).toEqual(createLife());
  });

  it('does not restore inherited object properties as crops or furniture', () => {
    const life = normalizeLife({
      garden: [{ cropId: 'constructor' }, { cropId: 'toString' }, { cropId: '__proto__' }, { cropId: 'lettuce', plantedAtMs: 1 }],
      ownedFurniture: ['constructor', 'toString', '__proto__', 'radio'],
      houseSlots: ['constructor', 'toString', '__proto__', 'radio'],
    });
    expect(life.garden.map((plot) => plot.cropId)).toEqual([null, null, null, 'lettuce']);
    expect(life.ownedFurniture).toEqual(['radio']);
    expect(life.houseSlots).toEqual([null, null, null, 'radio', null, null]);
  });
});

describe('clock safety', () => {
  it('treats a planting time in the future as just planted instead of going negative', () => {
    const life = plantCrop(createLife(), 0, 'lettuce', 10 * HOUR)!;
    expect(cropStage(life.garden[0], 0)).toBe(0);
    const watered = waterPlot(life, 0, '2026-11-12', 0)!;
    expect(cropStage(watered.garden[0], 0)).toBe(0);
  });
});
