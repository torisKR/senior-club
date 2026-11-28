// @vitest-environment jsdom
import { act, createElement, useEffect, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createLife, type LifeState } from './life';

const mocks = vi.hoisted(() => ({
  state: null as unknown as { playerPos: { x: number; y: number }; mapId: string; life: LifeState },
  notices: [] as string[],
  failSave: false,
  acorns: 0,
  active: true,
  triggerHaptic: vi.fn(),
  bench: false,
  spot: null as null | { id: string; mapId: 'field'; x: number; y: number; name: string; caption: string },
  simple: true,
  water: false,
  spawns: [] as { key: string; x: number; y: number; itemId: string }[],
}));
vi.mock('react-native', () => ({
  StyleSheet: { create: <T,>(styles: T) => styles },
  useWindowDimensions: () => ({ height: 568 }),
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  ScrollView: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  TextInput: () => null,
  Pressable: ({ children, testID, onPress, onPressIn, onPressOut, onLayout, disabled }: { children?: ReactNode; testID?: string; onPress?: (event: unknown) => void; onPressIn?: () => void; onPressOut?: () => void; onLayout?: (event: unknown) => void; disabled?: boolean }) => {
    const layoutRef = useRef(onLayout);
    useEffect(() => layoutRef.current?.({ nativeEvent: { layout: { width: 300, height: 200 } } }), []);
    return createElement('button', {
      'data-testid': testID, disabled,
      onClick: () => onPress?.({ nativeEvent: { locationX: 0, locationY: 0 } }),
      onMouseDown: onPressIn, onMouseUp: onPressOut,
    }, children);
  },
}));
vi.mock('./play/use-simple-play', () => ({ useSimplePlay: () => mocks.simple }));
vi.mock('./play/play-sprites', () => ({ PLAY_SPRITES: {} }));
vi.mock('@/components/game/game-icon', () => ({ GameIcon: () => null }));
vi.mock('@/components/game/pixel-panel', () => ({ pixelFrameStyle: {} }));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('@/components/ui', () => ({
  AppText: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
  SeniorButton: ({ label, testID, onPress }: { label: string; testID: string; onPress: () => void }) =>
    createElement('button', { 'data-testid': testID, onClick: onPress }, label),
}));
vi.mock('@/constants/theme', () => ({ FontWeights: { strong: 'bold' }, Radius: { lg: 12, md: 8 }, Spacing: { sm: 8, md: 16 } }));
vi.mock('@/audio/sound-manager', () => ({ playSfx: vi.fn() }));
vi.mock('@/arcade/arcade-store', () => ({ useArcade: () => ({ state: { soundEnabled: false }, triggerHaptic: mocks.triggerHaptic }) }));
vi.mock('@/rpg/rpg-logic', () => ({
  FARM_PLOTS: [{ x: 10, y: 10 }],
  getVillageTile: (x: number, y: number) => ({ type: mocks.bench && x === 2 && y === 1 ? 'bench' : x === 1 && y === 1 ? 'dock' : mocks.water && x === 21 && y === 20 ? 'stream' : 'grass' }),
}));
vi.mock('@/world/maps', () => ({ getMap: () => ({ id: 'field', buildings: [] }) }));
vi.mock('@/rpg/rpg-sprites', () => ({ FISH_SPRITES: {}, FORAGE_SPRITES: {}, LIFE_PROP_SPRITES: {}, POSTCARDS: {} }));
vi.mock('./explore', () => ({ FORAGE: { pebble: { name: '고운 조약돌', acorns: 3 } }, forageSpawns: () => mocks.spawns, photoSpotAt: () => mocks.spot }));
vi.mock('./use-world-active', () => ({ useWorldActive: () => mocks.active }));
vi.mock('@/rpg/rpg-store', () => ({ useRpg: () => ({
  state: mocks.state,
  applyLife: (change: (current: { life: LifeState; acorns: number }) => { life: LifeState; acorns?: number } | null) => {
    if (mocks.failSave) return false;
    const next = change({ life: mocks.state.life, acorns: mocks.acorns });
    if (!next) return false;
    mocks.state.life = next.life;
    mocks.acorns += next.acorns ?? 0;
    return true;
  },
}) }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-13T00:00:00Z'));
  vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.state = { playerPos: { x: 1, y: 1 }, mapId: 'field', life: createLife() };
  mocks.notices = [];
  mocks.failSave = false;
  mocks.acorns = 0;
  mocks.active = true;
  mocks.bench = false;
  mocks.spot = null;
  mocks.simple = true;
  mocks.water = false;
  mocks.spawns = [];
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

it('keeps a failed planting retryable and saves watering and harvest only after success', async () => {
  const { useWorldActivities } = await import('./world-activities');
  mocks.state.playerPos = { x: 10, y: 9 };
  function Scene() {
    const { action, overlay, celebration, finishCelebration } = useWorldActivities((notice) => mocks.notices.push(notice));
    return createElement('div', null,
      action ? createElement('button', { 'data-testid': 'action', onClick: action.run }, action.label) : null,
      createElement('span', { 'data-testid': 'celebration' }, String(celebration)),
      createElement('button', { 'data-testid': 'finish-old', onClick: () => finishCelebration(1) }, 'finish old'),
      overlay);
  }
  const refresh = async () => act(async () => root.render(createElement(Scene)));
  const press = async (id: string) => {
    const button = container.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
    expect(button, id).not.toBeNull();
    await act(async () => button!.click());
  };
  await refresh();
  await press('action');
  mocks.failSave = true;
  await press('plant-lettuce');
  expect(mocks.state.life.garden[0].cropId).toBeNull();
  expect(container.querySelector('[data-testid="celebration"]')?.textContent).toBe('null');
  expect(mocks.notices.at(-1)).toContain('심지 못했어요');
  expect(container.querySelector('[data-testid="plant-lettuce"]')).not.toBeNull();
  mocks.failSave = false;
  await press('plant-lettuce');
  expect(mocks.state.life.garden[0].cropId).toBe('lettuce');
  expect(container.querySelector('[data-testid="celebration"]')?.textContent).toBe('1');
  await refresh();
  expect(container.textContent).toContain('물 주기');
  await press('action');
  expect(mocks.state.life.garden[0].waterBonusMs).toBeGreaterThan(0);
  expect(container.querySelector('[data-testid="celebration"]')?.textContent).toBe('2');
  await press('finish-old');
  expect(container.querySelector('[data-testid="celebration"]')?.textContent).toBe('2');
  await refresh();
  vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
  await act(async () => vi.advanceTimersByTime(30_000));
  await refresh();
  expect(container.textContent).toContain('수확하기');
  mocks.failSave = true;
  await press('action');
  expect(mocks.state.life.garden[0].cropId).toBe('lettuce');
  expect(mocks.acorns).toBe(0);
  expect(mocks.notices.at(-1)).toContain('수확을 저장하지 못했어요');
  mocks.failSave = false;
  await press('action');
  expect(mocks.state.life.garden[0].cropId).toBeNull();
  expect(mocks.state.life.items.lettuce).toBe(1);
  expect(mocks.acorns).toBeGreaterThan(0);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('shows first discovery only once and preserves catches and inventory on repeated fishing', async () => {
  const { useWorldActivities } = await import('./world-activities');
  function Scene() {
    const { action, overlay } = useWorldActivities((notice) => mocks.notices.push(notice));
    return createElement('div', null,
      action ? createElement('button', { 'data-testid': 'action', onClick: action.run }, action.label) : null,
      overlay);
  }
  const press = async (id: string) => {
    const button = container.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
    expect(button, id).not.toBeNull();
    await act(async () => button!.click());
  };
  await act(async () => root.render(createElement(Scene)));
  await press('action');
  await press('btn-cast-line');
  await act(async () => vi.advanceTimersByTime(2000));
  await press('btn-pull-line');
  expect(container.textContent).toContain('도감에 새로 등록');
  expect(mocks.state.life.fishLog.minnow).toBe(1);
  expect(mocks.state.life.items.minnow).toBe(1);
  await press('btn-cast-again');
  await press('btn-cast-line');
  await act(async () => vi.advanceTimersByTime(2000));
  await press('btn-pull-line');
  expect(container.textContent).not.toContain('도감에 새로 등록');
  expect(mocks.state.life.fishLog.minnow).toBe(2);
  expect(mocks.state.life.items.minnow).toBe(2);
});

it('allows a relaxed response to a bite and lets the player try again after a missed fish', async () => {
  const { useWorldActivities } = await import('./world-activities');
  function Scene() {
    const { action, overlay } = useWorldActivities((notice) => mocks.notices.push(notice));
    return createElement('div', null,
      action ? createElement('button', { 'data-testid': 'action', onClick: action.run }, action.label) : null,
      overlay);
  }
  const press = async (id: string) => {
    const button = container.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
    expect(button, id).not.toBeNull();
    await act(async () => button!.click());
  };
  await act(async () => root.render(createElement(Scene)));
  await press('action');
  await press('btn-cast-line');
  await act(async () => vi.advanceTimersByTime(2000));
  expect(container.textContent).toContain('천천히 당겨 보세요');
  await act(async () => vi.advanceTimersByTime(4000));
  await press('btn-pull-line');
  expect(mocks.state.life.fishLog.minnow).toBe(1);
  await press('btn-cast-again');
  await press('btn-cast-line');
  await act(async () => vi.advanceTimersByTime(2000));
  await act(async () => vi.advanceTimersByTime(15_000));
  expect(container.textContent).toContain('물고기는 또 옵니다');
  expect(mocks.state.life.fishLog.minnow).toBe(1);
  expect(container.querySelector('[data-testid="btn-cast-again"]')).not.toBeNull();
});

it('pauses the bite window while the village is not active', async () => {
  const { useWorldActivities } = await import('./world-activities');
  function Scene() {
    const { action, overlay } = useWorldActivities((notice) => mocks.notices.push(notice));
    return createElement('div', null,
      action ? createElement('button', { 'data-testid': 'action', onClick: action.run }, action.label) : null,
      overlay);
  }
  const render = async () => act(async () => root.render(createElement(Scene)));
  const press = async (id: string) => {
    const button = container.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
    expect(button, id).not.toBeNull();
    await act(async () => button!.click());
  };
  await render();
  await press('action');
  await press('btn-cast-line');
  await act(async () => vi.advanceTimersByTime(2000));
  await act(async () => vi.advanceTimersByTime(1000));
  mocks.active = false;
  await render();
  await act(async () => vi.advanceTimersByTime(60_000));
  expect(container.textContent).toContain('천천히 당겨 보세요');
  mocks.active = true;
  await render();
  await act(async () => vi.advanceTimersByTime(4000));
  await press('btn-pull-line');
  expect(mocks.state.life.fishLog.minnow).toBe(1);
});

it('offers both fishing and a photograph when they share the same dock', async () => {
  const { useWorldActivities } = await import('./world-activities');
  mocks.spot = { id: 'pond', mapId: 'field', x: 1, y: 1, name: '연못', caption: '물결' };
  function Scene() {
    const { actions, overlay } = useWorldActivities((notice) => mocks.notices.push(notice));
    return createElement('div', null,
      ...actions.map((action) => createElement('button', { key: action.label, onClick: action.run }, action.label)),
      overlay);
  }
  await act(async () => root.render(createElement(Scene)));
  const fishing = [...container.querySelectorAll('button')].find((button) => button.textContent === '낚싯대 던지기');
  expect([...container.querySelectorAll('button')].some((button) => button.textContent === '사진 찍기')).toBe(true);
  expect(fishing).toBeDefined();
  await act(async () => fishing!.click());
  expect(container.querySelector('[data-testid="btn-cast-line"]')).not.toBeNull();
  expect([...container.querySelectorAll('button')].some((button) => button.textContent === '사진 찍기')).toBe(false);
});

it('explains a failed photograph save and allows a retry', async () => {
  const { useWorldActivities } = await import('./world-activities');
  mocks.spot = { id: 'pond', mapId: 'field', x: 1, y: 1, name: '연못', caption: '물결' };
  function Scene() {
    const { actions, overlay } = useWorldActivities((notice) => mocks.notices.push(notice));
    return createElement('div', null,
      ...actions.map((action) => createElement('button', { key: action.label, onClick: action.run }, action.label)),
      overlay);
  }
  await act(async () => root.render(createElement(Scene)));
  const photo = [...container.querySelectorAll('button')].find((button) => button.textContent === '사진 찍기')!;
  mocks.failSave = true;
  await act(async () => photo.click());
  expect(mocks.notices.at(-1)).toContain('사진을 저장하지 못했어요');
  expect(container.textContent).not.toContain('앨범에 새 사진을 붙였어요');
  mocks.failSave = false;
  await act(async () => photo.click());
  expect(container.textContent).toContain('앨범에 새 사진을 붙였어요');
  expect(mocks.state.life.photos.length).toBe(1);
});

it('allows resting without silently claiming a reward when saving fails', async () => {
  const { useWorldActivities } = await import('./world-activities');
  mocks.bench = true;
  function Scene() {
    const { actions, overlay } = useWorldActivities((notice) => mocks.notices.push(notice));
    return createElement('div', null,
      ...actions.map((action) => createElement('button', { key: action.label, onClick: action.run }, action.label)),
      overlay);
  }
  await act(async () => root.render(createElement(Scene)));
  mocks.failSave = true;
  await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === '앉아 쉬기')!.click());
  expect(container.textContent).toContain('잠시 쉬어 가요');
  expect(mocks.state.life.lastRestDay).toBeNull();
  expect(mocks.notices.at(-1)).toContain('쉬기 보상을 저장하지 못했어요');
  await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="btn-end-activity"]')!.click());
  mocks.failSave = false;
  await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === '앉아 쉬기')!.click());
  expect(mocks.state.life.lastRestDay).not.toBeNull();
  expect(mocks.notices.at(-1)).toContain('한숨 돌렸어요');
});

function PlayScene({ useWorldActivities }: { useWorldActivities: typeof import('./world-activities').useWorldActivities }) {
  const { actions, overlay, pose } = useWorldActivities((notice) => mocks.notices.push(notice));
  return createElement('div', null,
    ...actions.map((action) => createElement('button', { key: action.label, 'data-testid': 'action', onClick: action.run }, action.label)),
    createElement('span', { 'data-testid': 'pose' }, String(pose)),
    overlay);
}
const find = (id: string) => container.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
const tap = async (id: string) => {
  expect(find(id), id).not.toBeNull();
  await act(async () => find(id)!.click());
};

it('plays fishing by casting on the water, hooking the bite and holding the reel', async () => {
  const { useWorldActivities } = await import('./world-activities');
  mocks.simple = false;
  await act(async () => root.render(createElement(PlayScene, { useWorldActivities })));
  await tap('action');
  expect(find('btn-cast-line')).toBeNull();
  await tap('fishing-water');
  await tap('btn-pull-line');
  expect(mocks.notices.at(-1)).toContain('아직이에요');
  await act(async () => vi.advanceTimersByTime(6000));
  await tap('btn-pull-line');
  // 챔질만으로는 끝나지 않고, 릴을 감아야 낚입니다.
  expect(mocks.state.life.fishLog.minnow).toBeUndefined();
  await act(async () => vi.advanceTimersByTime(2000));
  expect(mocks.state.life.fishLog.minnow).toBeUndefined();
  await act(async () => { find('btn-reel')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await act(async () => vi.advanceTimersByTime(4000));
  expect(mocks.state.life.fishLog.minnow).toBe(1);
  expect(container.textContent).toContain('낚았어요');
});

it('keeps a landed fish retryable when saving fails', async () => {
  const { useWorldActivities } = await import('./world-activities');
  await act(async () => root.render(createElement(PlayScene, { useWorldActivities })));
  await tap('action');
  await tap('btn-cast-line');
  await act(async () => vi.advanceTimersByTime(2000));
  mocks.failSave = true;
  await tap('btn-pull-line');
  expect(mocks.state.life.fishLog.minnow).toBeUndefined();
  expect(mocks.notices.at(-1)).toContain('저장이 잠시 막혀');
  expect(container.textContent).toContain('담지 못했어요');
  mocks.failSave = false;
  await tap('btn-keep-fish');
  expect(mocks.state.life.fishLog.minnow).toBe(1);
  expect(container.textContent).toContain('도감에 새로 등록');
  expect(find('btn-keep-fish')).toBeNull();
});

it('offers fishing beside a water tile on any map, not only on a dock', async () => {
  const { useWorldActivities } = await import('./world-activities');
  mocks.state.playerPos = { x: 20, y: 20 };
  await act(async () => root.render(createElement(PlayScene, { useWorldActivities })));
  expect(find('action')).toBeNull();
  mocks.water = true;
  await act(async () => root.render(createElement(PlayScene, { useWorldActivities })));
  expect(find('action')?.textContent).toBe('낚싯대 던지기');
});

it('finds a foraged item by parting bushes, with a bonus pile and a retryable save', async () => {
  const { useWorldActivities } = await import('./world-activities');
  mocks.state.playerPos = { x: 5, y: 6 };
  mocks.spawns = [{ key: '5,5', x: 5, y: 5, itemId: 'pebble' }];
  await act(async () => root.render(createElement(PlayScene, { useWorldActivities })));
  expect(find('action')?.textContent).toBe('풀숲 헤치기');
  await tap('action');
  // 누르는 것만으로는 얻지 못하고, 덤불을 헤쳐야 합니다.
  expect(mocks.state.life.items.pebble).toBeUndefined();
  expect(find('pose')?.textContent).toBe('harvest');
  await tap('forage-bush-3');
  expect(container.textContent).toContain('빈 덤불이에요');
  await tap('forage-bush-1');
  expect(container.textContent).toContain('도토리 더미를 찾았어요');
  mocks.failSave = true;
  await tap('forage-bush-0');
  expect(mocks.state.life.items.pebble).toBeUndefined();
  expect(mocks.notices.at(-1)).toContain('채집을 저장하지 못했어요');
  mocks.failSave = false;
  await tap('btn-keep-forage');
  expect(mocks.state.life.items.pebble).toBe(1);
  expect(mocks.acorns).toBe(6);
  expect(mocks.state.life.foraged.keys).toContain('field:5,5');
  expect(mocks.notices.at(-1)).toContain('도감에 새로 등록');
  await act(async () => vi.advanceTimersByTime(2000));
  expect(find('forage-bush-0')).toBeNull();
});
