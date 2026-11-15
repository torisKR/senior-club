// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  responder: null as null | {
    onPanResponderGrant: () => void;
    onPanResponderMove: (event: null, gesture: { dx: number; dy: number }) => void;
    onPanResponderRelease: () => void;
    onPanResponderTerminate: () => void;
  },
  listener: null as null | ((state: string) => void),
}));
vi.mock('react-native', () => ({
  AppState: { addEventListener: (_event: string, listener: (state: string) => void) => {
    mocks.listener = listener;
    return { remove: () => { mocks.listener = null; } };
  } },
  Animated: {
    ValueXY: class {
      setValue() {}
      stopAnimation() {}
      getTranslateTransform() { return []; }
    },
    View: () => null,
    spring: () => ({ start: () => {} }),
  },
  PanResponder: { create: (handlers: typeof mocks.responder) => { mocks.responder = handlers; return { panHandlers: {} }; } },
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: () => createElement('div'),
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.responder = null;
  mocks.listener = null;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('stops and saves once on background, ignoring a late gesture event', async () => {
  const { VirtualJoystick } = await import('./virtual-joystick');
  const onVector = vi.fn();
  const onRelease = vi.fn();
  await act(async () => root.render(createElement(VirtualJoystick, { onVector, onRelease, onStep: vi.fn() })));
  mocks.responder!.onPanResponderGrant();
  mocks.responder!.onPanResponderMove(null, { dx: 30, dy: 0 });
  expect(onVector.mock.lastCall?.[0]).toBeGreaterThan(0);
  mocks.listener!('background');
  expect(onVector.mock.lastCall).toEqual([0, 0]);
  expect(onRelease).toHaveBeenCalledTimes(1);
  mocks.responder!.onPanResponderMove(null, { dx: 30, dy: 0 });
  mocks.responder!.onPanResponderTerminate();
  expect(onVector).toHaveBeenCalledTimes(2);
  expect(onRelease).toHaveBeenCalledTimes(1);
});

it('stops and saves an active gesture when the joystick unmounts', async () => {
  const { VirtualJoystick } = await import('./virtual-joystick');
  const onVector = vi.fn();
  const onRelease = vi.fn();
  await act(async () => root.render(createElement(VirtualJoystick, { onVector, onRelease, onStep: vi.fn() })));
  mocks.responder!.onPanResponderGrant();
  mocks.responder!.onPanResponderMove(null, { dx: 0, dy: 30 });
  await act(async () => root.render(null));
  expect(onVector.mock.lastCall).toEqual([0, 0]);
  expect(onRelease).toHaveBeenCalledTimes(1);
  expect(mocks.listener).toBeNull();
});
