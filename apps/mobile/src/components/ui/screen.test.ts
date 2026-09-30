import { describe, expect, it, vi } from 'vitest';

import { Screen } from './screen';

const state = vi.hoisted(() => ({ tabs: true, top: 24, bottom: 48 }));
const flatten = (style: unknown): Record<string, unknown> => Array.isArray(style)
  ? Object.assign({}, ...style.map(flatten))
  : typeof style === 'object' && style !== null ? style as Record<string, unknown> : {};
vi.mock('react-native', () => ({
  ScrollView: 'ScrollView', View: 'View', StyleSheet: { flatten: (style: unknown) => flatten(style) },
  Platform: { select: (options: { default: unknown }) => options.default },
}));
vi.mock('expo-router', () => ({ useSegments: () => state.tabs ? ['(tabs)', 'home'] : ['event', '[id]'] }));
vi.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ background: '#eef2e9' }) }));
vi.mock('@/hooks/use-effective-safe-area-insets', () => ({ useEffectiveSafeAreaInsets: () => ({ top: state.top, bottom: state.bottom }) }));

describe('native screen insets', () => {
  it('adds status-bar inset to caller spacing instead of replacing it', () => {
    state.tabs = true;
    const screen = Screen({ contentContainerStyle: { paddingTop: 8 }, children: 'Content' });
    expect(flatten(screen.props.contentContainerStyle)).toMatchObject({ paddingTop: 32, paddingHorizontal: 16, gap: 24 });
  });
  it('lets the tab bar own the bottom system inset', () => {
    state.tabs = true;
    state.bottom = 80;
    expect(flatten(Screen({}).props.contentContainerStyle).paddingBottom).toBe(32);
  });
  it('reserves the bottom inset on a screen outside the tab navigator', () => {
    state.tabs = false;
    expect(flatten(Screen({}).props.contentContainerStyle).paddingBottom).toBe(96);
    expect(flatten(Screen({ includeBottomInset: false }).props.contentContainerStyle).paddingBottom).toBe(32);
    state.tabs = true;
  });
});
