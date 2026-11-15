// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
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
}));
vi.mock('react-native', () => ({
  StyleSheet: { create: <T,>(styles: T) => styles },
  useWindowDimensions: () => ({ height: 568 }),
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  ScrollView: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  TextInput: () => null,
}));
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
  getVillageTile: (x: number, y: number) => ({ type: mocks.bench && x === 2 && y === 1 ? 'bench' : x === 1 && y === 1 ? 'dock' : 'grass' }),
}));
vi.mock('@/world/maps', () => ({ getMap: () => ({ id: 'field', buildings: [] }) }));
vi.mock('@/rpg/rpg-sprites', () => ({ FISH_SPRITES: {}, LIFE_PROP_SPRITES: {}, POSTCARDS: {} }));
vi.mock('./explore', () => ({ FORAGE: {}, forageSpawns: () => [], photoSpotAt: () => mocks.spot }));
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
  await act(async () => vi.advanceTimersByTime(2000));
  await press('btn-pull-line');
  expect(container.textContent).toContain('도감에 새로 등록');
  expect(mocks.state.life.fishLog.minnow).toBe(1);
  expect(mocks.state.life.items.minnow).toBe(1);
  await press('btn-cast-again');
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
  await act(async () => vi.advanceTimersByTime(2000));
  expect(container.textContent).toContain('천천히 당겨 보세요');
  await act(async () => vi.advanceTimersByTime(4000));
  await press('btn-pull-line');
  expect(mocks.state.life.fishLog.minnow).toBe(1);
  await press('btn-cast-again');
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
  expect(container.querySelector('[data-testid="btn-pull-line"]')).not.toBeNull();
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
