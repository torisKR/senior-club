import { describe, expect, it } from 'vitest';

import { FIELD_MAP } from '../maps/field';
import { computeTileVisuals } from './tile-visuals';

const at = (x: number, y: number) => computeTileVisuals(FIELD_MAP)[y * 64 + x];

describe('computeTileVisuals', () => {
  it('lays forest floor under trees in the forest and grass under village trees', () => {
    const forestTree = FIELD_MAP.layout.findIndex((row, y) => y < 16 && y > 0 && row.slice(1, 40).includes('P'));
    const x = FIELD_MAP.layout[forestTree].indexOf('P', 1);
    expect(at(x, forestTree)).toEqual({ base: 'forest', decor: 'pine' });
    expect(at(20 + 4, 16 + 2)).toEqual({ base: 'grass', decor: 'pine' }); // 마을 안 소나무
  });

  it('draws the dock over water and the bridge as its own floor', () => {
    expect(at(20 + 9, 16 + 17)).toEqual({ base: 'water', decor: 'dock' });
    expect(at(50, 23)).toEqual({ base: 'bridge', decor: null });
  });

  it('uses the purple flower field where the hill is purple', () => {
    expect(at(31, 45)).toEqual({ base: 'flowersPurple', decor: null });
  });
});

describe('chunkLayers', () => {
  it('folds the most common floor into one repeated layer and keeps the rest per tile', async () => {
    const { chunkLayers } = await import('./tile-visuals');
    const forest = chunkLayers(FIELD_MAP, 2, 0, 8);
    expect(forest.dominant).toBe('forest');
    expect(forest.cells.every((cell) => cell.base !== 'forest')).toBe(true);
    expect(forest.cells.length).toBeLessThan(64);
  });
});
