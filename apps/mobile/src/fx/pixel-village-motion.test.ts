// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scene = vi.hoisted(() => ({
  reduced: null as boolean | null,
  playerPos: { x: 8, y: 7 },
  values: [] as { value: number }[],
  layout: undefined as undefined | ((event: unknown) => void),
  springs: vi.fn(),
  timings: vi.fn(),
  loops: vi.fn(),
  starts: vi.fn(),
  stops: vi.fn(),
  playerSprite: vi.fn(),
}));

vi.mock('react-native', () => {
  class Value {
    value: number;
    constructor(value: number) { this.value = value; scene.values.push(this); }
    setValue(value: number) { this.value = value; }
    interpolate() { return this; }
  }
  const animation = () => ({ start: scene.starts, stop: scene.stops });
  const View = ({ children, testID, onLayout }: { children?: ReactNode; testID?: string; onLayout?: (event: unknown) => void }) => {
    if (testID === 'rpg-pixel-village-map') scene.layout = onLayout;
    return createElement('div', { 'data-testid': testID }, children);
  };
  return {
    View,
    Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
    StyleSheet: { create: <T,>(styles: T) => styles },
    Easing: { quad: 'quad', inOut: () => 'easing' },
    Animated: {
      View, Value,
      spring: (...args: unknown[]) => { scene.springs(...args); return animation(); },
      timing: (...args: unknown[]) => { scene.timings(...args); return animation(); },
      sequence: animation,
      parallel: animation,
      delay: animation,
      loop: () => { scene.loops(); return animation(); },
    },
  };
});
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('./use-reduce-motion', () => ({ useReduceMotion: () => scene.reduced }));
vi.mock('../rpg/rpg-store', () => ({
  useRpg: () => ({ state: { playerPos: scene.playerPos, companionId: null } }),
}));
vi.mock('@/arcade/arcade-store', () => ({ useArcade: () => ({ state: { cp: 0 } }) }));
vi.mock('../rpg/rpg-logic', () => ({
  VILLAGE_GRID_SIZE: 15,
  VILLAGE_BUILDINGS: [],
  VILLAGE_NPCS: [{ id: 'npc', x: 1, y: 1 }],
  getVillageTile: (x: number, y: number) => ({ x, y, type: 'grass' }),
}));
vi.mock('../rpg/rpg-sprites', () => ({
  TILE_SPRITES: { grass: 1 }, BUILDING_SPRITES: {}, npcSpriteFor: () => 1,
  playerTierForCp: () => 0,
  playerSpriteForTier: (...args: unknown[]) => { scene.playerSprite(...args); return 1; },
}));
vi.mock('../rpg/companion-lines', () => ({ WALK_LINES: {} }));

let PixelVillageMap: typeof import('../rpg/pixel-village-map').PixelVillageMap;
let root: Root;
let container: HTMLDivElement;
const render = async () => act(async () => root.render(createElement(PixelVillageMap)));

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  scene.reduced = null;
  scene.playerPos = { x: 8, y: 7 };
  scene.values.length = 0;
  scene.layout = undefined;
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  PixelVillageMap = (await import('../rpg/pixel-village-map')).PixelVillageMap;
});

afterEach(async () => {
  await act(async () => root.unmount());
  expect(vi.getTimerCount()).toBe(0);
  container.parentNode?.removeChild(container);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('village motion', () => {
  it('snaps the camera and avatar, keeps NPCs and sprites still, and resumes only when allowed', async () => {
    await render();
    await act(async () => scene.layout?.({ nativeEvent: { layout: { width: 360, height: 440 } } }));
    expect(scene.springs).not.toHaveBeenCalled();
    expect(scene.timings).not.toHaveBeenCalled();
    expect(scene.loops).not.toHaveBeenCalled();
    expect(scene.values.slice(0, 4).map((value) => value.value)).toEqual([-228, -140, 364, 302]);
    expect(vi.getTimerCount()).toBe(0);

    scene.reduced = true;
    scene.playerPos = { x: 9, y: 7 };
    await render();
    expect(scene.values.slice(0, 4).map((value) => value.value)).toEqual([-276, -140, 412, 302]);
    expect(scene.playerSprite).toHaveBeenLastCalledWith(0, 'side', false, 0);
    await act(async () => vi.advanceTimersByTime(2000));
    expect(scene.playerSprite).toHaveBeenLastCalledWith(0, 'side', false, 0);

    scene.reduced = false;
    await render();
    expect(scene.springs).toHaveBeenCalled();
    expect(scene.timings).toHaveBeenCalled();
    expect(scene.loops).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(260));
    expect(scene.playerSprite).toHaveBeenLastCalledWith(0, 'side', false, 1);

    scene.playerPos = { x: 10, y: 7 };
    await render();
    expect(scene.playerSprite).toHaveBeenLastCalledWith(0, 'side', true, 1);
    scene.reduced = true;
    await render();
    expect(scene.stops).toHaveBeenCalled();
    expect(scene.values.slice(0, 4).map((value) => value.value)).toEqual([-324, -140, 460, 302]);
    expect(scene.playerSprite).toHaveBeenLastCalledWith(0, 'side', false, 0);
    await act(async () => vi.advanceTimersByTime(200));
    expect(vi.getTimerCount()).toBe(0);
  });
});
