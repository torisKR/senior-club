import { describe, expect, it } from 'vitest';

import { FIELD_MAP } from '../maps/field';
import { MARKET_MAP } from '../maps/market';
import { MOUNTAIN_MAP } from '../maps/mountain';
import { SEASIDE_MAP } from '../maps/seaside';
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

describe('computeTileVisuals on the new maps', () => {
  const mountain = computeTileVisuals(MOUNTAIN_MAP);
  const market = computeTileVisuals(MARKET_MAP);
  const mt = (x: number, y: number) => mountain[y * 48 + x];
  const mk = (x: number, y: number) => market[y * 40 + x];

  it('draws mountain floors from their own tiles', () => {
    expect(mt(5, 36)).toEqual({ base: 'mtGround', decor: null }); // 들머리 흙길
    expect(mt(22, 28)).toEqual({ base: 'mtSteps', decor: null }); // 돌계단
    expect(mt(36, 20)).toEqual({ base: 'mtStream', decor: null }); // 계곡물
    expect(mt(39, 21)).toEqual({ base: 'mtRock', decor: null }); // 절벽에는 바위 장식을 겹치지 않음
  });

  it('lays the log bridge and the fishing dock over the stream', () => {
    expect(mt(36, 35)).toEqual({ base: 'mtStream', decor: 'mtBridge' });
    expect(mt(37, 30)).toEqual({ base: 'mtStream', decor: 'dock' });
    const seaside = computeTileVisuals(SEASIDE_MAP);
    expect(seaside[16 * 32 + 16]).toEqual({ base: 'water', decor: 'dock' }); // 바닷가 선착장은 그대로
  });

  it('puts props on the floor around them and forest floor under deep woods', () => {
    expect(mt(20, 19)).toEqual({ base: 'mtGround', decor: 'mtSpring' });
    expect(mt(4, 18)).toEqual({ base: 'forest', decor: 'mtMushroomLog' });
    expect(mt(1, 12).base).toBe('forest'); // 나무만 모인 곳
    expect(mk(30, 16)).toEqual({ base: 'grass', decor: 'mkJarStack' });
    expect(mk(7, 16)).toEqual({ base: 'mkPaving', decor: 'mkYutMat' });
    expect(mk(16, 16)).toEqual({ base: 'mkPaving', decor: 'mkFlagLine' });
  });

  it('keeps entrance floors matching the ground they stand on', () => {
    expect(mt(41, 10)).toEqual({ base: 'mtGround', decor: null }); // 정자 입구
    expect(mk(19, 17)).toEqual({ base: 'mkPaving', decor: null }); // 놀이 좌판 입구
    expect(mk(19, 16).base).toBe('mkPaving'); // 좌판 안쪽 칸도 잔디가 비치지 않게
    expect(mk(4, 4)).toEqual({ base: 'path', decor: null }); // 잔디 위 정류장은 기존처럼 길
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
