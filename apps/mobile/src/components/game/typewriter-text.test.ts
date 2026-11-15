// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { TypewriterText } from './typewriter-text';

vi.mock('react-native', () => ({
  StyleSheet: { create: <T,>(styles: T) => styles },
  Pressable: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) => createElement('button', { onClick: onPress }, children),
}));
vi.mock('@/components/ui', () => ({
  AppText: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));


beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function mount(reduceMotion: boolean) {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(createElement(TypewriterText, { text: '안녕하세요', reduceMotion })));
  return { container, root };
}

it('shows the whole line with the next marker when motion is reduced', () => {
  const { container, root } = mount(true);
  expect(container.textContent).toBe('안녕하세요 ▼');
  act(() => root.unmount());
});

it('reveals letters over time and completes on tap', () => {
  const { container, root } = mount(false);
  // 남은 글자는 투명하게 깔려 있어 전체 길이는 같고, 끝 표시는 아직 없습니다.
  expect(container.textContent).toBe('안녕하세요');
  act(() => { container.querySelector('button')?.click(); });
  expect(container.textContent).toBe('안녕하세요 ▼');
  act(() => root.unmount());
});
