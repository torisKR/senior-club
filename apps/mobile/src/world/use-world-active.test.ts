// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ focused: true, listener: null as null | ((state: string) => void) }));
vi.mock('expo-router', () => ({ useIsFocused: () => mocks.focused }));
vi.mock('react-native', () => ({ AppState: {
  currentState: 'active',
  addEventListener: (_event: string, listener: (state: string) => void) => {
    mocks.listener = listener;
    return { remove: () => { mocks.listener = null; } };
  },
} }));

it('runs only while the village is focused and the app is foregrounded', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { useWorldActive } = await import('./use-world-active');
  function Probe() { return createElement('span', null, String(useWorldActive())); }
  const container = document.createElement('div');
  const root = createRoot(container);
  mocks.focused = true;
  await act(async () => root.render(createElement(Probe)));
  expect(container.textContent).toBe('true');
  await act(async () => mocks.listener!('background'));
  expect(container.textContent).toBe('false');
  mocks.focused = false;
  await act(async () => { mocks.listener!('active'); root.render(createElement(Probe)); });
  expect(container.textContent).toBe('false');
  mocks.focused = true;
  await act(async () => root.render(createElement(Probe)));
  expect(container.textContent).toBe('true');
  await act(async () => root.unmount());
  expect(mocks.listener).toBeNull();
  vi.unstubAllGlobals();
});
