// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const motion = vi.hoisted(() => ({
  query: vi.fn<() => Promise<boolean>>(),
  listeners: new Set<(enabled: boolean) => void>(),
  withoutSubscription: false,
}));

vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: motion.query,
    addEventListener: (_event: string, listener: (enabled: boolean) => void) => {
      if (motion.withoutSubscription) return undefined;
      motion.listeners.add(listener);
      return { remove: () => motion.listeners.delete(listener) };
    },
  },
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));
vi.mock('expo-image', () => ({
  Image: ({ style }: { style: unknown }) => createElement('div', { 'data-image-style': JSON.stringify(style) }),
}));

let PixelFx: typeof import('./pixel-fx').PixelFx;
let root: Root;
let container: HTMLDivElement;

const imageStyle = () => JSON.parse(container.querySelector('[data-image-style]')!.getAttribute('data-image-style')!);
const emit = (enabled: boolean) => motion.listeners.forEach((listener) => listener(enabled));

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('require', () => 1);
  motion.listeners.clear();
  motion.withoutSubscription = false;
  motion.query.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  PixelFx = (await import('./pixel-fx')).PixelFx;
});

afterEach(async () => {
  await act(async () => root.unmount());
  expect(motion.listeners.size).toBe(0);
  container.parentNode?.removeChild(container);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('pixel effects and OS reduce motion', () => {
  it('stays static while loading and completes a reduced one-shot exactly once', async () => {
    let resolvePreference!: (enabled: boolean) => void;
    motion.query.mockReturnValue(new Promise((resolve) => { resolvePreference = resolve; }));
    const onDone = vi.fn();
    await act(async () => root.render(createElement(PixelFx, { name: 'impact', onDone })));
    const staticFrame = imageStyle();
    expect(vi.getTimerCount()).toBe(0);
    expect(onDone).not.toHaveBeenCalled();

    await act(async () => resolvePreference(true));
    await act(async () => vi.advanceTimersByTime(399));
    expect(imageStyle()).toEqual(staticFrame);
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(5000));
    expect(imageStyle()).toEqual(staticFrame);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('animates normally, uses the latest callback, and can stop mid-playback', async () => {
    motion.query.mockResolvedValue(false);
    const oldDone = vi.fn();
    const latestDone = vi.fn();
    await act(async () => root.render(createElement(PixelFx, { name: 'impact', onDone: oldDone })));
    const firstFrame = imageStyle();
    await act(async () => vi.advanceTimersByTime(160));
    expect(imageStyle()).not.toEqual(firstFrame);
    await act(async () => root.render(createElement(PixelFx, { name: 'impact', onDone: latestDone })));
    await act(async () => emit(true));
    const staticFrame = imageStyle();
    await act(async () => vi.advanceTimersByTime(400));
    expect(imageStyle()).toEqual(staticFrame);
    expect(oldDone).not.toHaveBeenCalled();
    expect(latestDone).toHaveBeenCalledTimes(1);
    await act(async () => emit(false));
    await act(async () => vi.advanceTimersByTime(3000));
    expect(latestDone).toHaveBeenCalledTimes(1);
  });

  it('honors the latest change event over a delayed query and does not complete loops', async () => {
    let resolvePreference!: (enabled: boolean) => void;
    motion.query.mockReturnValue(new Promise((resolve) => { resolvePreference = resolve; }));
    const onDone = vi.fn();
    await act(async () => root.render(createElement(PixelFx, { name: 'match', loop: true, onDone })));
    await act(async () => emit(false));
    const firstFrame = imageStyle();
    await act(async () => resolvePreference(true));
    await act(async () => vi.advanceTimersByTime(160));
    expect(imageStyle()).not.toEqual(firstFrame);
    await act(async () => emit(true));
    const staticFrame = imageStyle();
    await act(async () => vi.advanceTimersByTime(3000));
    expect(imageStyle()).toEqual(staticFrame);
    expect(vi.getTimerCount()).toBe(0);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('completes normal one-shots and fails safe if the preference query fails', async () => {
    motion.query.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('unavailable'));
    const onDone = vi.fn();
    await act(async () => root.render(createElement(PixelFx, { name: 'impact', onDone })));
    await act(async () => vi.advanceTimersByTime(1200));
    expect(onDone).toHaveBeenCalledTimes(1);
    await act(async () => root.render(createElement(PixelFx, { name: 'match', onDone, key: 'new' })));
    const staticFrame = imageStyle();
    await act(async () => vi.advanceTimersByTime(400));
    expect(imageStyle()).toEqual(staticFrame);
    expect(onDone).toHaveBeenCalledTimes(2);
  });

  it('starts a fresh one-shot when the effect name changes on the same component', async () => {
    motion.query.mockResolvedValue(true);
    const onDone = vi.fn();
    await act(async () => root.render(createElement(PixelFx, { name: 'impact', onDone })));
    await act(async () => vi.advanceTimersByTime(400));
    expect(onDone).toHaveBeenCalledTimes(1);
    await act(async () => root.render(createElement(PixelFx, { name: 'match', onDone })));
    await act(async () => vi.advanceTimersByTime(400));
    expect(onDone).toHaveBeenCalledTimes(2);
  });

  it('can clean up on platforms that cannot subscribe to preference changes', async () => {
    motion.withoutSubscription = true;
    motion.query.mockResolvedValue(true);
    const onDone = vi.fn();
    await act(async () => root.render(createElement(PixelFx, { name: 'impact', onDone })));
    await act(async () => vi.advanceTimersByTime(400));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
