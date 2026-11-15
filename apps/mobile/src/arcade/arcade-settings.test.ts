// @vitest-environment jsdom
import { act, createElement, StrictMode, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  saved: {} as Record<string, unknown>,
  rawOverride: null as string | null,
  readFails: false,
  writeFails: false,
  writes: 0,
  impact: vi.fn(async () => {}),
}));

vi.mock('@/audio/sound-manager', () => ({ playSfx: vi.fn(), stopAllSfx: vi.fn() }));
vi.mock('expo-haptics', () => ({
  impactAsync: mocks.impact,
  notificationAsync: vi.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));
vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: () => {} }) } }));
vi.mock('@/utils/storage', () => ({ storage: {
  get: () => mocks.saved,
  getRaw: () => {
    if (mocks.readFails) throw new Error('read failed');
    return mocks.rawOverride ?? JSON.stringify(mocks.saved);
  },
  set: (_key: string, value: Record<string, unknown>) => {
    mocks.writes += 1;
    if (mocks.writeFails) throw new Error('write failed');
    mocks.saved = value;
  },
} }));
vi.mock('@/billing/CosmeticBillingProvider', () => ({ useCosmeticBilling: () => ({ items: {} }) }));
vi.mock('@/billing/cosmetic-products', () => ({ COSMETIC_PRODUCTS: [] }));
vi.mock('./cosmetic-equipment', () => ({ availableEquipment: (skins: unknown) => skins, requiredCosmetic: () => null }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.saved = { soundEnabled: false, cp: 350, seals: 3 };
  mocks.rawOverride = null;
  mocks.readFails = false;
  mocks.writeFails = false;
  mocks.writes = 0;
  mocks.impact.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

it('does not overwrite an unreadable arcade record when settings or results change', async () => {
  mocks.rawOverride = '{broken';
  const { ArcadeProvider, useArcade } = await import('./arcade-store');
  let current: ReturnType<typeof useArcade>;
  function Probe() { current = useArcade(); return null; }
  await act(async () => root.render(createElement(ArcadeProvider, null, createElement(Probe))));
  expect(current!.saveReadProtected).toBe(true);
  await act(async () => { current!.toggleSound(); current!.recordParkGolfClear(0); });
  expect(mocks.writes).toBe(0);
  expect(mocks.rawOverride).toBe('{broken');
});

it('keeps the existing record untouched after a storage read error', async () => {
  mocks.readFails = true;
  const { ArcadeProvider, useArcade } = await import('./arcade-store');
  let current: ReturnType<typeof useArcade>;
  function Probe() { current = useArcade(); return null; }
  await act(async () => root.render(createElement(ArcadeProvider, null, createElement(Probe))));
  await act(async () => { current!.toggleHaptic(); current!.recordAlkkagiWin(1); });
  expect(current!.saveReadProtected).toBe(true);
  expect(mocks.writes).toBe(0);
  expect(mocks.saved).toMatchObject({ cp: 350, seals: 3 });
});

it('retains multiple in-memory updates after a write failure and saves them on retry', async () => {
  const { ArcadeProvider, useArcade } = await import('./arcade-store');
  let current: ReturnType<typeof useArcade>;
  function Probe() { current = useArcade(); return null; }
  await act(async () => root.render(createElement(ArcadeProvider, null, createElement(Probe))));
  mocks.writeFails = true;
  await act(async () => { current!.toggleSound(); current!.recordParkGolfClear(0); });
  expect(current!.saveWriteFailed).toBe(true);
  expect(current!.state).toMatchObject({ soundEnabled: true, cp: 530, seals: 4 });
  expect(mocks.saved).toMatchObject({ soundEnabled: false, cp: 350, seals: 3 });
  mocks.writeFails = false;
  await act(async () => { expect(current!.retrySave()).toBe(true); });
  expect(current!.saveWriteFailed).toBe(false);
  expect(mocks.saved).toMatchObject({ soundEnabled: true, cp: 530, seals: 4 });
});

it('does not overwrite a record changed after a failed save', async () => {
  const { ArcadeProvider, useArcade } = await import('./arcade-store');
  let current: ReturnType<typeof useArcade>;
  function Probe() { current = useArcade(); return null; }
  await act(async () => root.render(createElement(ArcadeProvider, null, createElement(Probe))));
  mocks.writeFails = true;
  await act(async () => current!.recordParkGolfClear(0));
  expect(current!.saveWriteFailed).toBe(true);
  mocks.writeFails = false;
  mocks.saved = { cp: 900, seals: 10, soundEnabled: false };
  const writesBefore = mocks.writes;
  await act(async () => { expect(current!.retrySave()).toBe(false); });
  expect(current!.saveConflict).toBe(true);
  expect(mocks.saved).toMatchObject({ cp: 900, seals: 10 });
  expect(mocks.writes).toBe(writesBefore);
  await act(async () => current!.toggleSound());
  expect(mocks.writes).toBe(writesBefore);
});

it('restores all saved results and accessibility choices after retry and restart', async () => {
  const { ArcadeProvider, useArcade } = await import('./arcade-store');
  let current: ReturnType<typeof useArcade>;
  function Probe() { current = useArcade(); return null; }
  const mount = async () => act(async () => root.render(createElement(StrictMode, null,
    createElement(ArcadeProvider, null, createElement(Probe)))));
  await mount();
  mocks.writeFails = true;
  await act(async () => {
    current!.recordAlkkagiWin(1);
    current!.recordSacheonseongClear(3);
    current!.toggleHaptic();
    current!.toggleReduceMotion();
  });
  expect(current!.saveWriteFailed).toBe(true);
  mocks.writeFails = false;
  await act(async () => { expect(current!.retrySave()).toBe(true); });
  await act(async () => root.unmount());
  root = createRoot(container);
  await mount();
  expect(current!.state).toMatchObject({
    cp: 760, seals: 5, alkkagiWins: 1, alkkagiDoubleKnockouts: 1,
    sacheonseongClears: 1, sacheonseongMaxCombo: 3, soundEnabled: false,
    hapticEnabled: true, reduceMotion: true,
  });
  expect(current!.saveWriteFailed).toBe(false);
  expect(current!.saveConflict).toBe(false);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('sound and vibration settings', () => {
  it('migrates the old choice and independently persists vibration without altering progress', async () => {
    const { ArcadeProvider, useArcade } = await import('./arcade-store');
    function Controls(): ReactNode {
      const { state, toggleSound, toggleHaptic, toggleReduceMotion, triggerHaptic } = useArcade();
      return createElement('div', null,
        createElement('span', { id: 'settings' }, `${state.soundEnabled}/${state.hapticEnabled}`),
        createElement('button', { id: 'sound', onClick: toggleSound }),
        createElement('button', { id: 'haptic', onClick: toggleHaptic }),
        createElement('button', { id: 'motion', onClick: toggleReduceMotion }),
        createElement('button', { id: 'feedback', onClick: () => triggerHaptic() }),
      );
    }
    await act(async () => root.render(createElement(ArcadeProvider, null, createElement(Controls))));
    expect(container.querySelector('#settings')?.textContent).toBe('false/false');
    await act(async () => container.querySelector<HTMLButtonElement>('#feedback')!.click());
    expect(mocks.impact).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLButtonElement>('#haptic')!.click());
    await act(async () => container.querySelector<HTMLButtonElement>('#feedback')!.click());
    expect(mocks.impact).toHaveBeenCalledTimes(1);
    expect(mocks.saved).toMatchObject({ soundEnabled: false, hapticEnabled: true, cp: 350, seals: 3 });
    await act(async () => container.querySelector<HTMLButtonElement>('#sound')!.click());
    expect(mocks.saved).toMatchObject({ soundEnabled: true, hapticEnabled: true, cp: 350, seals: 3 });
    await act(async () => container.querySelector<HTMLButtonElement>('#motion')!.click());
    expect(mocks.saved).toMatchObject({ reduceMotion: true, cp: 350, seals: 3 });
  });
});
