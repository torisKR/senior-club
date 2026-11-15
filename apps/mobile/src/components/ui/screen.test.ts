import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from './screen';

const state = vi.hoisted(() => ({ top: 24, bottom: 48, segments: ['event', '[id]'] }));
const flatten = (style: unknown): Record<string, unknown> => Array.isArray(style)
  ? Object.assign({}, ...style.map(flatten))
  : typeof style === 'object' && style !== null ? style as Record<string, unknown> : {};
vi.mock('react-native', () => ({
  ScrollView: 'ScrollView', View: 'View', StyleSheet: { flatten: (style: unknown) => flatten(style) },
  Platform: { select: (options: { default: unknown }) => options.default },
}));
vi.mock('expo-router', () => ({ useSegments: () => state.segments }));
vi.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ background: '#eef2e9' }) }));
vi.mock('@/hooks/use-effective-safe-area-insets', () => ({ useEffectiveSafeAreaInsets: () => ({ top: state.top, bottom: state.bottom }) }));
vi.mock('@/components/game/game-skin', () => ({ useGameSkin: () => false }));

describe('native screen insets', () => {
  beforeEach(() => Object.assign(state, { top: 24, bottom: 48, segments: ['event', '[id]'] }));
  it('keeps the status-bar inset outside scrolling content so scrolled controls cannot cover it', () => {
    const screen = Screen({ contentContainerStyle: { paddingTop: 8 }, children: 'Content' });
    expect(screen.type).toBe('View');
    expect(flatten(screen.props.style)).toMatchObject({ paddingTop: 24, backgroundColor: '#eef2e9' });
    const scroller = screen.props.children;
    expect(scroller.type).toBe('ScrollView');
    expect(flatten(scroller.props.style).overflow).toBe('hidden');
    expect(flatten(scroller.props.contentContainerStyle)).toMatchObject({ paddingTop: 8, paddingHorizontal: 16, gap: 24 });
    expect(scroller.props.contentInsetAdjustmentBehavior).toBe('never');
  });
  it('preserves scrolling handlers and uses the normal top gap once', () => {
    const onScroll = vi.fn();
    const screen = Screen({ testID: 'home-screen', scrollViewProps: { onScroll, keyboardDismissMode: 'on-drag' } });
    expect(screen.props.testID).toBe('home-screen');
    expect(screen.props.children.props.onScroll).toBe(onScroll);
    expect(screen.props.children.props.keyboardDismissMode).toBe('on-drag');
    expect(flatten(screen.props.children.props.contentContainerStyle).paddingTop).toBe(16);
  });
  it('reserves the bottom system inset now that no tab bar owns it', () => {
    state.bottom = 80;
    expect(flatten(Screen({}).props.children.props.contentContainerStyle).paddingBottom).toBe(96);
    expect(flatten(Screen({ includeBottomInset: false }).props.children.props.contentContainerStyle).paddingBottom).toBe(32);
  });
  it('retains a fixed top inset for non-scrolling scenes', () => {
    const screen = Screen({ scroll: false, contentContainerStyle: { paddingTop: 8 } });
    expect(screen.type).toBe('View');
    expect(flatten(screen.props.children.props.style).paddingTop).toBe(24);
    expect(flatten(screen.props.children.props.children.props.style).paddingTop).toBe(8);
  });
  it('leaves the status bar to the stack header on places entered from the village', () => {
    state.segments = ['(game)', 'clubs'];
    expect(flatten(Screen({}).props.style).paddingTop).toBe(0);
  });
});
