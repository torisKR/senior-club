// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { buyFurniture, createLife, type LifeState } from './life';

const mocks = vi.hoisted(() => ({
  life: null as unknown as LifeState,
  fail: false,
}));
vi.mock('react-native', () => ({
  StyleSheet: { create: <T,>(styles: T) => styles },
  useWindowDimensions: () => ({ width: 393, fontScale: 1 }),
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Pressable: ({ children, testID, onPress, accessibilityState }: { children?: ReactNode; testID?: string; onPress: () => void; accessibilityState?: { selected: boolean } }) =>
    createElement('button', { 'data-testid': testID, 'aria-pressed': accessibilityState?.selected, onClick: onPress }, children),
}));
vi.mock('@/hooks/use-app-state', () => ({ useAppState: () => ({ largeTextEnabled: false }) }));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('@/audio/bgm', () => ({ BGM_CLUB_LOUNGE: 1 }));
vi.mock('@/audio/focused-background-audio', () => ({ FocusedBackgroundAudio: () => null }));
vi.mock('@/audio/sound-manager', () => ({ playSfx: vi.fn() }));
vi.mock('@/fx/pixel-fx', () => ({ PixelFx: () => null }));
vi.mock('@/arcade/arcade-quick-settings', () => ({ ArcadeQuickSettings: () => null }));
vi.mock('@/arcade/arcade-store', () => ({ useArcade: () => ({ state: { soundEnabled: false }, triggerHaptic: vi.fn() }) }));
vi.mock('@/components/ui', () => ({
  AppText: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
  Screen: ({ children }: { children?: ReactNode }) => createElement('main', null, children),
  SectionHeader: ({ title }: { title: string }) => createElement('h2', null, title),
  SeniorButton: ({ label, testID, onPress, disabled }: { label: string; testID?: string; onPress: () => void; disabled?: boolean }) =>
    createElement('button', { 'data-testid': testID, onClick: onPress, disabled }, label),
}));
vi.mock('@/constants/theme', () => ({ FontWeights: { strong: 'bold' }, Radius: { lg: 12, md: 8 }, Spacing: { sm: 8 } }));
vi.mock('@/rpg/rpg-sprites', () => ({ FURNITURE_SPRITES: {} }));
vi.mock('@/rpg/rpg-store', () => ({ useRpg: () => ({
  state: { life: mocks.life, stats: { acorns: 500, dailyMedicationTaken: false } },
  applyLife: (change: (current: { life: LifeState; acorns: number }) => { life: LifeState } | null) => {
    if (mocks.fail) return false;
    const next = change({ life: mocks.life, acorns: 500 });
    if (!next) return false;
    mocks.life = next.life;
    return true;
  },
  takeMedication: vi.fn(),
}) }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.life = buyFurniture(createLife(), 'radio', 500)!.life;
  mocks.fail = false;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('keeps the selected slot open after a save failure and places the owned item on retry', async () => {
  const { HouseScreen } = await import('./house-screen');
  await act(async () => root.render(createElement(HouseScreen)));
  const press = async (id: string) => {
    const button = container.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
    expect(button, id).not.toBeNull();
    await act(async () => button!.click());
  };
  await press('house-slot-0');
  expect(container.querySelector('[data-testid="house-slot-0"]')?.getAttribute('aria-pressed')).toBe('true');
  mocks.fail = true;
  await press('place-radio');
  expect(container.textContent).toContain('가구 배치를 저장하지 못했어요');
  expect(container.querySelector('[data-testid="place-radio"]')).not.toBeNull();
  expect(mocks.life.houseSlots[0]).toBeNull();
  mocks.fail = false;
  await press('place-radio');
  expect(mocks.life.houseSlots[0]).toBe('radio');
  expect(container.querySelector('[data-testid="place-radio"]')).toBeNull();
  expect(container.textContent).toContain('놓았어요');
});
