// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PressableProps, TextProps, ViewProps } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BottomNavigation } from './bottom-navigation';
import { BottomDestinations } from './bottom-navigation-layout';

const ui = vi.hoisted(() => ({
  width: 393, fontScale: 1, large: false, bottom: 24, prevented: false,
  buttons: [] as PressableProps[], texts: [] as TextProps[], views: [] as ViewProps[],
  listeners: new Map<string, () => void>(),
  navigate: vi.fn(), emit: vi.fn(),
}));
vi.mock('react-native', () => ({
  Platform: { select: (options: { default: unknown }) => options.default },
  StyleSheet: { hairlineWidth: 0.5 },
  useWindowDimensions: () => ({ width: ui.width, fontScale: ui.fontScale }),
  Keyboard: {
    isVisible: () => false,
    addListener: (event: string, listener: () => void) => {
      ui.listeners.set(event, listener);
      return { remove: () => ui.listeners.delete(event) };
    },
  },
  View: (props: ViewProps & { children?: ReactNode }) => {
    ui.views.push(props);
    return createElement('div', { 'data-testid': props.testID }, props.children);
  },
  Text: (props: TextProps & { children?: ReactNode }) => {
    ui.texts.push(props);
    return createElement('span', {}, props.children);
  },
  Pressable: (props: PressableProps & { children?: ReactNode }) => {
    ui.buttons.push(props);
    return createElement('button', {
      'data-testid': props.testID, 'aria-label': props.accessibilityLabel,
      'aria-selected': props.accessibilityState?.selected,
      onClick: () => props.onPress?.({} as never),
    }, props.children as ReactNode);
  },
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: ui.bottom, left: 0, right: 0, top: 24 }) }));
vi.mock('@/hooks/use-app-state', () => ({ useAppState: () => ({ largeTextEnabled: ui.large }) }));
vi.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ surface: '#fff', primary: '#356347', textSecondary: '#526451', backgroundSelected: '#dfe7d8', divider: '#d0daca' }) }));
vi.mock('@/components/ui/app-icon', () => ({ AppIcon: ({ name }: { name: string }) => createElement('i', { 'data-icon': name }) }));

let root: Root;
let container: HTMLDivElement;
const render = async () => {
  const routes = BottomDestinations.map(({ name }) => ({ name, key: `key-${name}`, params: name === 'chat' ? { thread: 'local-fixture' } : undefined }));
  const descriptors = Object.fromEntries(routes.map((route) => [route.key, { options: {
    tabBarButtonTestID: `tab-${route.name}`, tabBarAccessibilityLabel: `${BottomDestinations.find((tab) => tab.name === route.name)!.label} 탭`,
    tabBarHideOnKeyboard: true,
  } }]));
  await act(async () => root.render(createElement(BottomNavigation, {
    state: { routes, index: 0 }, descriptors, navigation: { navigate: ui.navigate, emit: ui.emit },
  } as unknown as Parameters<typeof BottomNavigation>[0])));
};
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.assign(ui, { width: 393, fontScale: 1, large: false, bottom: 24, prevented: false, buttons: [], texts: [], views: [] });
  ui.listeners.clear();
  ui.navigate.mockReset();
  ui.emit.mockReset().mockImplementation(() => ({ defaultPrevented: ui.prevented }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  expect(ui.listeners.size).toBe(0);
  container.remove();
  vi.unstubAllGlobals();
});

describe('Android bottom navigation interactions and readability', () => {
  it('exposes five equal touch targets and marks the selected destination with an icon pill', async () => {
    await render();
    expect(container.querySelectorAll('button')).toHaveLength(5);
    expect(container.querySelector('[data-testid="tab-home"]')?.getAttribute('aria-selected')).toBe('true');
    const pressState = { pressed: false, hovered: false };
    for (const button of ui.buttons) {
      expect(button.accessibilityRole).toBe('tab');
      const style = typeof button.style === 'function' ? button.style(pressState) : button.style;
      expect(style).toMatchObject({ flex: 1, minWidth: 48, minHeight: 48 });
      expect(style).not.toHaveProperty('backgroundColor');
    }
    expect(ui.views.filter((view) => (view.style as { backgroundColor?: string })?.backgroundColor === '#dfe7d8')).toHaveLength(1);
    expect(ui.views[0].style).toMatchObject({ paddingBottom: 24 });
    expect(ui.views[1].style).toMatchObject({ minHeight: 60 });
    expect(ui.views.slice(1).every((view) => !(view.style as { paddingBottom?: number })?.paddingBottom)).toBe(true);
  });
  it('emits cancellable tab presses before navigation and preserves destination parameters', async () => {
    await render();
    const chat = container.querySelector('[data-testid="tab-chat"]') as HTMLButtonElement;
    ui.prevented = true;
    await act(async () => chat.click());
    expect(ui.emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'key-chat', canPreventDefault: true });
    expect(ui.navigate).not.toHaveBeenCalled();
    ui.prevented = false;
    await act(async () => chat.click());
    expect(ui.navigate).toHaveBeenCalledWith('chat', { thread: 'local-fixture' });
  });
  it('retains reselect and long-press events without navigating twice', async () => {
    await render();
    await act(async () => (container.querySelector('[data-testid="tab-home"]') as HTMLButtonElement).click());
    expect(ui.navigate).not.toHaveBeenCalled();
    ui.buttons[0].onLongPress?.({} as never);
    expect(ui.emit).toHaveBeenCalledWith({ type: 'tabLongPress', target: 'key-home' });
  });
  it('preserves label scaling and wrap space at system scale 2 plus the large-text option', async () => {
    Object.assign(ui, { width: 360, fontScale: 2, large: true });
    await render();
    expect(ui.views[1].style).toMatchObject({ minHeight: 116 });
    for (const text of ui.texts) {
      expect(text.allowFontScaling).toBe(true);
      expect(text.style).toMatchObject({ fontSize: 13, lineHeight: 18, alignSelf: 'stretch' });
      expect(text.numberOfLines).toBeUndefined();
      expect(text.maxFontSizeMultiplier).toBeUndefined();
    }
  });
  it('hides on keyboard show and restores after keyboard hide', async () => {
    await render();
    await act(async () => ui.listeners.get('keyboardDidShow')?.());
    expect(container.querySelector('[data-testid="bottom-navigation"]')).toBeNull();
    await act(async () => ui.listeners.get('keyboardDidHide')?.());
    expect(container.querySelectorAll('button')).toHaveLength(5);
  });
});
