// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  responder: null as null | {
    onPanResponderGrant: (event: { nativeEvent: { pageX: number; pageY: number } }) => void;
    onPanResponderMove: (event: null, gesture: { dx: number; dy: number }) => void;
    onPanResponderRelease: () => void;
    onPanResponderTerminate: () => void;
  },
  listener: null as null | ((state: string) => void),
  layout: null as null | ((event: unknown) => void),
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
  View: ({ children, testID, style, onLayout }: { children?: unknown; testID?: string; style?: unknown; onLayout?: (event: unknown) => void }) => {
    if (testID === 'joystick-area' && onLayout) mocks.layout = onLayout;
    const flat = Object.assign({}, ...[style].flat(3).filter(Boolean));
    return createElement('div', { 'data-testid': testID, 'data-left': flat.left, 'data-top': flat.top }, children as never);
  },
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
  mocks.responder!.onPanResponderGrant({ nativeEvent: { pageX: 120, pageY: 640 } });
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
  mocks.responder!.onPanResponderGrant({ nativeEvent: { pageX: 120, pageY: 640 } });
  mocks.responder!.onPanResponderMove(null, { dx: 0, dy: 30 });
  await act(async () => root.render(null));
  expect(onVector.mock.lastCall).toEqual([0, 0]);
  expect(onRelease).toHaveBeenCalledTimes(1);
  expect(mocks.listener).toBeNull();
});

it('rests bottom-left and jumps to wherever the player touches', async () => {
  const { VirtualJoystick } = await import('./virtual-joystick');
  await act(async () => root.render(createElement(VirtualJoystick, { onVector: vi.fn(), onRelease: vi.fn(), onStep: vi.fn(), restLeft: 16, restBottom: 20 })));
  await act(async () => mocks.layout!({ nativeEvent: { layout: { width: 400, height: 800 } } }));
  const base = () => container.querySelector('[data-testid="virtual-joystick"]')!;
  // 쉼 자리: 왼쪽 16dp, 아래 20dp (조이스틱 지름 136dp)
  expect(Number(base().getAttribute('data-left'))).toBe(16);
  expect(Number(base().getAttribute('data-top'))).toBe(800 - 20 - 136);
  await act(async () => mocks.responder!.onPanResponderGrant({ nativeEvent: { pageX: 300, pageY: 400 } }));
  expect(Number(base().getAttribute('data-left'))).toBe(300 - 68);
  expect(Number(base().getAttribute('data-top'))).toBe(400 - 68);
  await act(async () => mocks.responder!.onPanResponderRelease());
  expect(Number(base().getAttribute('data-left'))).toBe(16);
});
