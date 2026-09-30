import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import type { FlatListProps, ViewStyle } from 'react-native';
import { View } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Layout, Spacing } from '@/constants/theme';

import { ClubsScreen } from './clubs-screen';
import { EventsScreen } from './events-screen';

const state = vi.hoisted(() => ({
  top: 24,
  bottom: 80,
  width: 393,
  background: '#eef2e9',
}));

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: <T,>(initial: T | (() => T)) => [
    typeof initial === 'function' ? (initial as () => T)() : initial,
    vi.fn(),
  ],
  useMemo: <T,>(factory: () => T) => factory(),
  useCallback: <T,>(callback: T) => callback,
  useRef: <T,>(current: T) => ({ current }),
  useEffect: vi.fn(),
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  FlatList: 'FlatList',
  Pressable: 'Pressable',
  RefreshControl: 'RefreshControl',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles },
  Platform: { select: (options: { default: unknown }) => options.default },
  useWindowDimensions: () => ({ width: state.width }),
}));
vi.mock('expo-router', () => ({
  Stack: { Screen: 'StackScreen' },
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ background: state.background }) }));
vi.mock('@/hooks/use-effective-safe-area-insets', () => ({
  useEffectiveSafeAreaInsets: () => ({ top: state.top, bottom: state.bottom }),
}));
vi.mock('@/hooks/use-app-state', () => ({
  useAppState: () => ({
    interests: [],
    selectedInterestIds: [],
    participations: [],
    largeTextEnabled: false,
    eventFeeds: {
      upcoming: { events: [], loaded: true, hasNextPage: false },
      past: { events: [], loaded: true, hasNextPage: false },
    },
    ensureEventView: vi.fn(),
    loadMoreEventView: vi.fn(),
    reloadEventView: vi.fn(),
  }),
}));
vi.mock('@/api/clubs-api', () => ({ clubsApi: { list: vi.fn() }, mergeClubPages: vi.fn() }));
vi.mock('@/api/events-api', () => ({ mergeEventPages: vi.fn() }));
vi.mock('@/ads/HomeBannerAd', () => ({ HomeBannerAd: 'HomeBannerAd' }));
vi.mock('@/components/ui', () => ({
  AppText: 'AppText', EmptyState: 'EmptyState', EventCard: 'EventCard', SeniorButton: 'SeniorButton',
}));
vi.mock('./club-card', () => ({ ClubCard: 'ClubCard' }));
vi.mock('./filter-chip', () => ({ FilterChip: 'FilterChip' }));

function flatten(style: unknown): ViewStyle {
  return Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : typeof style === 'object' && style !== null ? style as ViewStyle : {};
}

function listIn(screen: ReactElement<{ children?: ReactNode }>) {
  const list = Children.toArray(screen.props.children).find(
    (child): child is ReactElement<FlatListProps<unknown>> =>
      isValidElement<FlatListProps<unknown>>(child) && child.type === 'FlatList',
  );
  if (!list) throw new Error('Expected a FlatList directly inside the fixed scene viewport');
  return list;
}

beforeEach(() => {
  Object.assign(state, { top: 24, bottom: 80, width: 393, background: '#eef2e9' });
});

describe.each([
  ['events', EventsScreen],
  ['clubs', ClubsScreen],
] as const)('%s discovery viewport', (_name, Scene) => {
  it('keeps scrolling headers clipped below a themed fixed top inset without adding the inset twice', () => {
    for (const background of ['#eef2e9', '#0A1E19']) {
      for (const top of [0, 24, 48]) {
        Object.assign(state, { top, background });
        const screen = Scene();
        expect(screen.type).toBe(View);
        const viewport = flatten(screen.props.style);
        expect(viewport).toMatchObject({ flex: 1, backgroundColor: background, paddingTop: top });
        // The reserved status-bar band spans the scene; only the list content has a max width.
        expect(viewport.maxWidth).toBeUndefined();
        expect(viewport.paddingBottom).toBeUndefined();

        const list = listIn(screen);
        const scrollStyle = flatten(list.props.style);
        expect(scrollStyle).toMatchObject({ flex: 1, backgroundColor: background, overflow: 'hidden' });
        expect(scrollStyle.paddingTop).toBeUndefined();
        expect(list.props.contentInsetAdjustmentBehavior).toBe('never');
        expect(list.props.contentInset).toBeUndefined();
        expect(flatten(list.props.contentContainerStyle).paddingTop).toBe(Spacing.lg);
      }
    }
  });

  it('preserves responsive list widths, columns, keyboard handling and tab-owned bottom inset', () => {
    for (const width of [320, 393, 759, 760, 980]) {
      state.width = width;
      const list = listIn(Scene());
      const columns = width >= 760 ? 2 : 1;
      expect(list.props.numColumns).toBe(columns);
      expect(list.key).toContain(`grid-${columns}`);
      expect(flatten(list.props.contentContainerStyle)).toMatchObject({
        width: '100%',
        maxWidth: 980,
        alignSelf: 'center',
        paddingHorizontal: width < 360 ? Spacing.lg : Layout.screenPadding,
        paddingBottom: Spacing.xxxl,
      });
      expect(list.props.keyboardShouldPersistTaps).toBe('handled');
      expect(list.props.keyboardDismissMode).toBe('on-drag');
      expect(list.props.removeClippedSubviews).toBe(false);
    }
  });
});
