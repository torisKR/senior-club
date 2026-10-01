import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { events as fixtureEvents, interests } from '@/data/sample-data';
import { SeniorHobbyCourseSection } from '@/screens/home/senior-hobby-course-section';
import type { EventFeedState } from '@/types';

import { EventsScreen } from './events-screen';

const state = vi.hoisted(() => ({
  category: undefined as string | string[] | undefined,
  values: [] as unknown[],
  hookIndex: 0,
  dirty: false,
  feeds: {} as Record<'upcoming' | 'past', EventFeedState>,
  push: vi.fn(),
  loadMore: vi.fn(),
  reload: vi.fn(),
}));

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: <T,>(initial: T | (() => T)) => {
    const index = state.hookIndex++;
    if (!(index in state.values)) state.values[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
    return [state.values[index], (next: T | ((previous: T) => T)) => {
      const value = typeof next === 'function' ? (next as (previous: T) => T)(state.values[index] as T) : next;
      if (!Object.is(value, state.values[index])) state.dirty = true;
      state.values[index] = value;
    }];
  },
  useMemo: <T,>(factory: () => T) => factory(),
  useEffect: vi.fn(),
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator', FlatList: 'FlatList', ScrollView: 'ScrollView',
  Pressable: 'Pressable', TextInput: 'TextInput', View: 'View',
  Platform: { select: (options: { default: unknown }) => options.default },
  useWindowDimensions: () => ({ width: 393 }),
}));
vi.mock('expo-router', () => ({
  Stack: { Screen: 'StackScreen' },
  useLocalSearchParams: () => ({ category: state.category }),
  useRouter: () => ({ push: state.push, setParams: ({ category }: { category: string }) => { state.category = category; } }),
}));
vi.mock('@/hooks/use-theme', () => ({ useTheme: () => ({}) }));
vi.mock('@/hooks/use-effective-safe-area-insets', () => ({ useEffectiveSafeAreaInsets: () => ({ top: 24 }) }));
vi.mock('@/hooks/use-app-state', () => ({ useAppState: () => ({
  interests, participations: [], largeTextEnabled: false, eventFeeds: state.feeds,
  ensureEventView: vi.fn(), loadMoreEventView: state.loadMore, reloadEventView: state.reload,
}) }));
vi.mock('@/auth/auth-session-manager', () => ({ getAuthenticatedHttpClient: vi.fn() }));
vi.mock('@/config/env', () => ({ getMobileEnvironment: vi.fn() }));
vi.mock('@/api/http-client', () => ({ createHttpClient: vi.fn() }));
vi.mock('@/ads/HomeBannerAd', () => ({ HomeBannerAd: 'HomeBannerAd' }));
vi.mock('@/components/ui', () => ({
  AppText: 'AppText', Card: 'Card', SectionHeader: 'SectionHeader',
  EmptyState: 'EmptyState', EventCard: 'EventCard', SeniorButton: 'SeniorButton',
}));
vi.mock('@/components/ui/app-icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('./filter-chip', () => ({ FilterChip: 'FilterChip' }));

type Element = ReactElement<Record<string, unknown> & { children?: ReactNode }>;

function render(Scene: () => ReactElement): Element {
  for (let attempt = 0; attempt < 5; attempt++) {
    state.hookIndex = 0;
    state.dirty = false;
    const tree = Scene() as Element;
    if (!state.dirty) return tree;
  }
  throw new Error('Screen did not settle its route change');
}

function elements(node: ReactNode): Element[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Record<string, unknown> & { children?: ReactNode }>(child)
    ? [child, ...elements(child.props.children), ...elements(child.props.ListHeaderComponent as ReactNode), ...elements(child.props.ListFooterComponent as ReactNode)]
    : []);
}

function find(tree: ReactNode, type: string, label?: string): Element {
  const element = elements(tree).find((candidate) => candidate.type === type && (!label || candidate.props.label === label));
  if (!element) throw new Error(`Missing ${type} ${label ?? ''}`);
  return element;
}

function press(element: Element) { (element.props.onPress as () => void)(); }
function eventIds(tree: Element) { return (find(tree, 'FlatList').props.data as { id: string }[]).map(({ id }) => id); }
function empty(tree: Element) { return find(find(tree, 'FlatList').props.ListEmptyComponent as ReactNode, 'EmptyState'); }

beforeEach(() => {
  state.category = undefined;
  state.values = [];
  state.push.mockReset(); state.loadMore.mockReset(); state.reload.mockReset();
  const feed: EventFeedState = {
    events: [], loaded: true, loading: false, loadingMore: false,
    error: null, errorMode: null, nextCursor: null, hasNextPage: false,
  };
  state.feeds = {
    upcoming: { ...feed, events: ['photo', 'gardening', 'hiking'].map((interestId) => ({
      ...fixtureEvents[0], id: interestId, interestId, lifecycle: 'upcoming',
    })) },
    past: { ...feed, events: [{ ...fixtureEvents[0], id: 'past-photo', interestId: 'photo', lifecycle: 'completed' }] },
  };
});

describe('home hobby navigation and retained event tab', () => {
  it('sends the photo and gardening recommendation slugs with their actual home button actions', () => {
    const home = render(SeniorHobbyCourseSection);
    const tab = elements(home).find((element) => element.props.accessibilityLabel === '추천 취미생활 탭')!;
    press(tab);
    const hobbies = render(SeniorHobbyCourseSection);
    press(find(hobbies, 'SeniorButton', '사진 모임 찾아보기'));
    press(find(hobbies, 'SeniorButton', '원예 모임 찾아보기'));
    expect(state.push.mock.calls).toEqual([
      [{ pathname: '/events', params: { category: 'photo' } }],
      [{ pathname: '/events', params: { category: 'gardening' } }],
    ]);
  });

  it('updates a retained tab from photo to gardening, resets the old search and clears all filters', () => {
    state.category = 'photo';
    let tree = render(EventsScreen);
    expect(eventIds(tree)).toEqual(['photo']);
    expect(find(tree, 'FilterChip', '📷 사진').props.selected).toBe(true);
    (find(tree, 'TextInput').props.onChangeText as (value: string) => void)('없는 검색어');
    press(find(tree, 'FilterChip', '지난 모임'));
    expect(eventIds(render(EventsScreen))).toEqual([]);
    state.category = 'gardening';
    tree = render(EventsScreen);
    expect(eventIds(tree)).toEqual(['gardening']);
    expect(find(tree, 'TextInput').props.value).toBe('');
    expect(find(tree, 'FilterChip', '🌿 원예').props.selected).toBe(true);
    expect(find(tree, 'FilterChip', '예정').props.selected).toBe(true);
    (find(tree, 'TextInput').props.onChangeText as (value: string) => void)('없는 검색어');
    tree = render(EventsScreen);
    expect(eventIds(tree)).toEqual([]);
    (empty(tree).props.onActionPress as () => void)();
    tree = render(EventsScreen);
    expect(state.category).toBe('');
    expect(eventIds(tree)).toEqual(['photo', 'gardening', 'hiking', 'past-photo']);
    expect(find(tree, 'FilterChip', '전체 관심사').props.selected).toBe(true);
    expect(find(tree, 'FilterChip', '전체').props.selected).toBe(true);
  });

  it('keeps pagination and append retry available when the first page has no selected category', () => {
    state.category = 'gardening';
    state.feeds.upcoming.events = [{ ...fixtureEvents[0], id: 'walk', interestId: 'hiking', lifecycle: 'upcoming' }];
    state.feeds.upcoming.hasNextPage = true;
    state.feeds.upcoming.nextCursor = 'cursor_NEXT_123';
    let tree = render(EventsScreen);
    expect(eventIds(tree)).toEqual([]);
    expect(empty(tree).props.title).toBe('불러온 목록에는 조건에 맞는 모임이 없어요');
    press(find(tree, 'SeniorButton', '예정 모임 더 보기'));
    expect(state.loadMore).toHaveBeenLastCalledWith('upcoming');
    state.feeds.upcoming.error = '네트워크 오류';
    state.feeds.upcoming.errorMode = 'append';
    tree = render(EventsScreen);
    press(find(tree, 'SeniorButton', '예정 모임 더 보기 다시 시도'));
    expect(state.loadMore).toHaveBeenLastCalledWith('upcoming');
    expect(state.reload).not.toHaveBeenCalled();
    state.feeds.upcoming = { ...state.feeds.upcoming, hasNextPage: false, error: null, errorMode: null, nextCursor: null,
      events: [...state.feeds.upcoming.events, { ...fixtureEvents[0], id: 'garden-next', interestId: 'gardening', lifecycle: 'upcoming' }] };
    expect(eventIds(render(EventsScreen))).toEqual(['garden-next']);
  });
});
