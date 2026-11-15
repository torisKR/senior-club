import { describe, expect, it } from 'vitest';

import { FIELD_VILLAGE_OFFSET } from './field';
import { restorePosition, WORLD_VERSION } from './position';

describe('restorePosition', () => {
  it('moves a save from the old 24x24 village into field coordinates', () => {
    expect(restorePosition({ playerPos: { x: 7, y: 7 } }, { x: 0, y: 0 })).toEqual({
      mapId: 'field', playerPos: { x: 7 + FIELD_VILLAGE_OFFSET.x, y: 7 + FIELD_VILLAGE_OFFSET.y }, worldVersion: WORLD_VERSION,
    });
  });

  it('keeps an up-to-date save where it is', () => {
    expect(restorePosition({ mapId: 'field', playerPos: { x: 55, y: 24 }, worldVersion: WORLD_VERSION }, { x: 0, y: 0 }).playerPos).toEqual({ x: 55, y: 24 });
  });

  it('nudges a blocked spot to the nearest walkable tile and ignores unknown maps', () => {
    const restored = restorePosition({ mapId: 'moon', playerPos: { x: 50, y: 30 }, worldVersion: WORLD_VERSION }, { x: 0, y: 0 });
    expect(restored.mapId).toBe('field');
    expect(restored.playerPos).not.toEqual({ x: 50, y: 30 }); // 강물
  });

  it('restores a seaside save on the seaside map', () => {
    expect(restorePosition({ mapId: 'seaside', playerPos: { x: 4, y: 6 }, worldVersion: WORLD_VERSION }, { x: 0, y: 0 }))
      .toMatchObject({ mapId: 'seaside', playerPos: { x: 4, y: 6 } });
  });
});
