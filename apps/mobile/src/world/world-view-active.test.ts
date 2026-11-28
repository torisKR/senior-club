// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { SEASIDE_MAP } from './maps/seaside';

const mocks = vi.hoisted(() => ({
  active: true,
  setActive: vi.fn(),
  peopleActive: [] as boolean[],
  frame: null as null | ((info: { timeSincePreviousFrame: number }) => void),
  reduceMotion: false,
  cancelBreeze: vi.fn(),
  startBreeze: vi.fn((value: number) => value),
  forageDays: [] as string[],
}));
vi.mock('react-native', () => ({
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: ({ children, testID }: { children?: ReactNode; testID?: string }) => createElement('div', { 'data-testid': testID }, children),
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('expo-image', () => ({ Image: ({ source }: { source: unknown }) => createElement('span', { 'data-source': String(source) }) }));
vi.mock('react-native-reanimated', () => {
  const box = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
  return {
    default: { View: box },
    useSharedValue: <T,>(initial: T) => useState(() => {
      let value = initial;
      return { get: () => value, set: (next: T) => { value = next; } };
    })[0],
    useAnimatedStyle: (style: () => unknown) => style(),
    useFrameCallback: (callback: typeof mocks.frame) => { mocks.frame = callback; return useState(() => ({ setActive: mocks.setActive }))[0]; },
    cancelAnimation: mocks.cancelBreeze,
    Easing: { inOut: (value: unknown) => value, sin: () => 0 },
    withTiming: (value: number) => value,
    withRepeat: mocks.startBreeze,
    withDelay: (_delay: number, value: number) => value,
  };
});
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args) }));
vi.mock('@/arcade/arcade-store', () => ({ useArcade: () => ({ state: { cp: 0 } }) }));
vi.mock('@/fx/use-reduce-motion', () => ({ useReduceMotion: () => mocks.reduceMotion }));
vi.mock('@/hooks/use-app-state', () => ({ useAppState: () => ({ largeTextEnabled: false }) }));
vi.mock('@/fx/pixel-fx', () => ({ PixelFx: () => null }));
vi.mock('@/rpg/rpg-logic', () => ({ FARM_PLOTS: [] }));
vi.mock('./play/play-sprites', () => ({ PLAY_SPRITES: { bush: 'bush' } }));
vi.mock('@/rpg/rpg-sprites', () => ({
  BUILDING_SPRITES: {}, CROP_SPRITES: {}, PLAYER_POSE_SPRITES: {},
  playerSpriteForTier: () => 1, playerTierForCp: () => 0,
}));
vi.mock('@/rpg/rpg-store', () => ({ useRpg: () => ({ state: {
  playerPos: { x: 4, y: 6 }, life: { garden: [], foraged: { day: null, keys: [] } },
} }) }));
vi.mock('./explore', () => ({
  forageSpawns: (_map: unknown, day: string) => {
    mocks.forageDays.push(day);
    return [{ key: 'near', x: 5, y: 6, itemId: 'pebble' }, { key: 'far', x: 30, y: 6, itemId: 'pebble' }];
  },
  PHOTO_SPOTS: [
    { id: 'near', mapId: 'seaside', x: 4, y: 6 },
    { id: 'far', mapId: 'seaside', x: 30, y: 6 },
    { id: 'other', mapId: 'field', x: 4, y: 6 },
  ],
}));
vi.mock('./render/map-chunk', () => ({ MapChunk: () => null, TILE_DP: 48 }));
vi.mock('./render/village-people', () => ({ VillagePeople: ({ active }: { active: boolean }) => { mocks.peopleActive.push(active); return null; } }));
vi.mock('./use-world-active', () => ({ useWorldActive: () => mocks.active }));

it('stops frame work and clears movement when hidden, then resumes it on return', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.active = true;
  mocks.reduceMotion = false;
  mocks.setActive.mockClear();
  mocks.startBreeze.mockClear();
  mocks.cancelBreeze.mockClear();
  mocks.peopleActive = [];
  mocks.forageDays = [];
  const { WorldView } = await import('./world-view');
  const shared = (initial: number) => {
    let value = initial;
    return { get: () => value, set: (next: number) => { value = next; } };
  };
  const joyX = shared(0.8);
  const joyY = shared(-0.4);
  const props = { map: SEASIDE_MAP, joyX, joyY, nowMs: 0, onTileChange: vi.fn(), onMovementEnd: vi.fn() };
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => root.render(createElement(WorldView, props as never)));
  expect(mocks.setActive).toHaveBeenLastCalledWith(true);
  expect(mocks.peopleActive.at(-1)).toBe(true);
  expect(container.querySelector('[data-testid="photo-marker-near"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="photo-marker-far"]')).toBeNull();
  expect(container.querySelector('[data-testid="photo-marker-other"]')).toBeNull();
  // 채집물은 풀숲에 숨어 있어 지도에는 덤불로만 보입니다.
  expect(container.querySelectorAll('[data-source="bush"]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-source="pebble"]')).toHaveLength(0);
  const firstDay = mocks.forageDays.at(-1);
  await act(async () => root.render(createElement(WorldView, { ...props, nowMs: 86_400_000 } as never)));
  expect(mocks.forageDays.at(-1)).not.toBe(firstDay);
  expect(mocks.startBreeze).toHaveBeenCalledTimes(1);
  mocks.active = false;
  await act(async () => root.render(createElement(WorldView, props as never)));
  expect(mocks.setActive).toHaveBeenLastCalledWith(false);
  expect(mocks.peopleActive.at(-1)).toBe(false);
  expect([joyX.get(), joyY.get()]).toEqual([0, 0]);
  expect(mocks.cancelBreeze).toHaveBeenCalled();
  mocks.active = true;
  await act(async () => root.render(createElement(WorldView, props as never)));
  expect(mocks.setActive).toHaveBeenLastCalledWith(true);
  expect(mocks.peopleActive.at(-1)).toBe(true);
  expect(mocks.startBreeze).toHaveBeenCalledTimes(2);
  mocks.reduceMotion = true;
  await act(async () => root.render(createElement(WorldView, props as never)));
  expect(mocks.startBreeze).toHaveBeenCalledTimes(2);
  expect(mocks.cancelBreeze).toHaveBeenCalled();
  await act(async () => root.unmount());
  expect(mocks.setActive).toHaveBeenLastCalledWith(false);
  vi.unstubAllGlobals();
});

it('reports the final UI-thread tile when joystick movement stops', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.active = true;
  mocks.reduceMotion = false;
  const { WorldView } = await import('./world-view');
  const shared = (initial: number) => {
    let value = initial;
    return { get: () => value, set: (next: number) => { value = next; } };
  };
  const joyX = shared(1);
  const joyY = shared(0);
  const onMovementEnd = vi.fn();
  const props = { map: SEASIDE_MAP, joyX, joyY, nowMs: 0, onTileChange: vi.fn(), onMovementEnd };
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => root.render(createElement(WorldView, props as never)));
  for (let index = 0; index < 4; index += 1) await act(async () => mocks.frame!({ timeSincePreviousFrame: 50 }));
  joyX.set(0);
  await act(async () => mocks.frame!({ timeSincePreviousFrame: 50 }));
  expect(onMovementEnd).toHaveBeenCalledExactlyOnceWith(5, 6, 'seaside');
  await act(async () => mocks.frame!({ timeSincePreviousFrame: 50 }));
  expect(onMovementEnd).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it('saves the last movement tile immediately when the world becomes inactive', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.active = true;
  mocks.reduceMotion = false;
  const { WorldView } = await import('./world-view');
  const shared = (initial: number) => {
    let value = initial;
    return { get: () => value, set: (next: number) => { value = next; } };
  };
  const joyX = shared(1);
  const joyY = shared(0);
  const onMovementEnd = vi.fn();
  const props = { map: SEASIDE_MAP, joyX, joyY, nowMs: 0, onTileChange: vi.fn(), onMovementEnd };
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(createElement(WorldView, props as never)));
  for (let index = 0; index < 4; index += 1) await act(async () => mocks.frame!({ timeSincePreviousFrame: 50 }));
  mocks.active = false;
  await act(async () => root.render(createElement(WorldView, props as never)));
  expect(onMovementEnd).toHaveBeenCalledExactlyOnceWith(5, 6, 'seaside');
  expect([joyX.get(), joyY.get()]).toEqual([0, 0]);
  mocks.active = true;
  await act(async () => root.render(createElement(WorldView, props as never)));
  await act(async () => mocks.frame!({ timeSincePreviousFrame: 50 }));
  expect(onMovementEnd).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
