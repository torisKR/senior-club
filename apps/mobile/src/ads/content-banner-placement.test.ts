// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { demoUser, events, interests } from '@/data/sample-data';
import { EventsScreen } from '@/screens/discovery/events-screen';
import { HomeScreen } from '@/screens/home/home-screen';
import type { Event, EventFeedState } from '@/types';

const state = vi.hoisted(() => ({
  width: 393,
  category: '',
  interestIds: ['hiking'],
  feeds: {} as Record<'upcoming' | 'past', EventFeedState>,
  search: undefined as ((query: string) => void) | undefined,
  loadMore: vi.fn(),
  reload: vi.fn(),
}));

type ChildrenProps = { children?: ReactNode };

vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => ({ category: state.category }),
  useRouter: () => ({ push: vi.fn(), setParams: ({ category }: { category: string }) => { state.category = category; } }),
}));
vi.mock('react-native', () => ({
  Platform: { select: (options: { default: unknown }) => options.default },
  View: ({ children }: ChildrenProps) => createElement('div', null, children),
  Pressable: ({ children }: ChildrenProps) => createElement('div', null, children),
  Switch: () => null,
  ActivityIndicator: () => createElement('span', null, 'loading'),
  ScrollView: ({ children }: ChildrenProps) => createElement('div', null, children),
  useWindowDimensions: () => ({ width: state.width, height: 852 }),
  TextInput: ({ value, onChangeText }: { value: string; onChangeText: (query: string) => void }) => {
    state.search = onChangeText;
    return createElement('input', { value, readOnly: true, 'aria-label': '모임 검색' });
  },
  FlatList: ({ data, ListHeaderComponent, ListFooterComponent, ListEmptyComponent, renderItem, numColumns }: {
    data: Event[];
    ListHeaderComponent: ReactNode;
    ListFooterComponent: ReactNode;
    ListEmptyComponent: ReactNode;
    renderItem: (item: { item: Event }) => ReactNode;
    numColumns: number;
  }) => createElement('div', { 'data-testid': 'event-list', 'data-columns': numColumns },
    createElement('header', null, ListHeaderComponent),
    data.length ? data.map((item) => createElement('div', { key: item.id }, renderItem({ item }))) : ListEmptyComponent,
    createElement('footer', null, ListFooterComponent)),
}));
vi.mock('@/hooks/use-theme', () => ({ useTheme: () => ({}) }));
vi.mock('@/hooks/use-effective-safe-area-insets', () => ({ useEffectiveSafeAreaInsets: () => ({ top: 24 }) }));
vi.mock('@/hooks/use-app-state', () => ({ useAppState: () => ({
  user: demoUser, session: null, upcomingEvents: state.feeds.upcoming.events,
  selectedInterestIds: state.interestIds, participations: [], interests,
  largeTextEnabled: false, toggleLargeText: vi.fn(), getParticipationStatus: vi.fn(),
  eventFeeds: state.feeds, ensureEventView: vi.fn(), loadMoreEventView: state.loadMore, reloadEventView: state.reload,
}) }));
vi.mock('@/api/notifications-api', () => ({ notificationsApi: { unreadCount: vi.fn() } }));
vi.mock('@/data/image-assets', () => ({ selectCoverImage: () => 1 }));
vi.mock('@/auth/auth-session-manager', () => ({ getAuthenticatedHttpClient: vi.fn() }));
vi.mock('@/config/env', () => ({ getMobileEnvironment: vi.fn() }));
vi.mock('@/api/http-client', () => ({ createHttpClient: vi.fn() }));
vi.mock('@/ads/HomeBannerAd', () => ({
  HomeBannerAd: () => createElement('aside', { 'data-testid': 'banner' }, '광고'),
}));
vi.mock('@/components/ui', () => ({
  AppText: ({ children }: ChildrenProps) => createElement('span', null, children),
  Card: ({ children }: ChildrenProps) => createElement('div', null, children),
  Screen: ({ children }: ChildrenProps) => createElement('main', null, children),
  SectionHeader: ({ title }: { title: string }) => createElement('h2', null, title),
  InterestChip: () => null,
  SeniorButton: ({ label, onPress }: { label: string; onPress: () => void }) => createElement('button', { onClick: onPress }, label),
  EventCard: ({ event }: { event: Event }) => createElement('article', { 'data-testid': 'event-card' }, event.title),
  EmptyState: ({ title, actionLabel, onActionPress }: { title: string; actionLabel: string; onActionPress: () => void }) =>
    createElement('div', { 'data-testid': 'empty-state' }, title, createElement('button', { onClick: onActionPress }, actionLabel)),
}));
vi.mock('@/components/ui/app-icon', () => ({ AppIcon: () => null }));
vi.mock('@/components/ui/cover-image', () => ({ CoverImage: () => null, CoverImageRatios: {} }));
vi.mock('@/screens/home/home-event-card', () => ({
  HomeEventCard: ({ event }: { event: Event }) => createElement('article', { 'data-testid': 'home-event-card' }, event.title),
}));
vi.mock('@/screens/home/senior-hobby-course-section', () => ({
  SeniorHobbyCourseSection: () => createElement('section', { 'data-testid': 'editorial' }, '취미생활 추천'),
}));
vi.mock('@/screens/discovery/filter-chip', () => ({
  FilterChip: ({ label, onPress }: { label: string; onPress: () => void }) => createElement('button', { onClick: onPress }, label),
}));

let root: Root;
let container: HTMLDivElement;

async function render(Screen: typeof EventsScreen | typeof HomeScreen) {
  await act(async () => root.render(createElement(Screen)));
}

function banner() { return container.querySelector('[data-testid="banner"]'); }
function cards(id = 'event-card') { return Array.from(container.querySelectorAll(`[data-testid="${id}"]`)); }
function before(first: Element, second: Element) {
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}
async function press(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === label);
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.width = 393;
  state.category = '';
  state.interestIds = ['hiking'];
  state.loadMore.mockReset();
  state.reload.mockReset();
  const feed: EventFeedState = {
    events: [], loaded: true, loading: false, loadingMore: false, error: null,
    errorMode: null, nextCursor: null, hasNextPage: false,
  };
  state.feeds = {
    upcoming: { ...feed, events: [0, 1, 2].map((index) => ({
      ...events[0], id: `event-${index}`, title: `산책 모임 ${index + 1}`, interestId: 'hiking', lifecycle: 'upcoming',
    })) },
    past: { ...feed },
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('Home content banner placement', () => {
  it('places one banner after all recommendation cards and before the following editorial', async () => {
    await render(HomeScreen);
    expect(cards('home-event-card')).toHaveLength(2);
    expect(container.querySelectorAll('[data-testid="banner"]')).toHaveLength(1);
    for (const card of cards('home-event-card')) before(card, banner()!);
    before(banner()!, container.querySelector('[data-testid="editorial"]')!);
    expect(banner()!.parentElement!.tagName).toBe('MAIN');
  });

  it('keeps empty recommendations ad-free even when other events exist', async () => {
    state.interestIds = ['gardening'];
    await render(HomeScreen);
    expect(container.textContent).toContain('새로운 모임 일정을 준비하고 있어요');
    expect(banner()).toBeNull();
    expect(container.querySelector('[data-testid="editorial"]')).not.toBeNull();
  });

  it.each([
    { loaded: false }, { loading: true }, { loadingMore: true }, { error: '새로고침 오류' },
  ])('suppresses a banner with retained cards during an unsettled recommendation feed: %j', async (patch) => {
    Object.assign(state.feeds.upcoming, patch);
    await render(HomeScreen);
    expect(cards('home-event-card')).toHaveLength(2);
    expect(banner()).toBeNull();
  });
});

describe('Events content banner placement', () => {
  it.each([393, 900])('places one footer banner after all %idp list content and pagination controls', async (width) => {
    state.width = width;
    state.feeds.upcoming.hasNextPage = true;
    await render(EventsScreen);
    expect(cards()).toHaveLength(3);
    expect(container.querySelector('[data-testid="event-list"]')!.getAttribute('data-columns')).toBe(width === 900 ? '2' : '1');
    expect(container.querySelector('header [data-testid="banner"]')).toBeNull();
    expect(container.querySelectorAll('footer [data-testid="banner"]')).toHaveLength(1);
    for (const card of cards()) before(card, banner()!);
    const control = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === '예정 모임 더 보기')!;
    before(control, banner()!);
    await press('예정 모임 더 보기');
    expect(state.loadMore).toHaveBeenCalledWith('upcoming');
  });

  it('removes the banner for an empty search and restores it after clearing the search', async () => {
    await render(EventsScreen);
    expect(banner()).not.toBeNull();
    await act(async () => state.search!('없는 제목'));
    expect(cards()).toHaveLength(0);
    expect(container.querySelector('[data-testid="empty-state"]')).not.toBeNull();
    expect(banner()).toBeNull();
    await press('검색 조건 지우기');
    expect(cards()).toHaveLength(3);
    expect(container.querySelectorAll('[data-testid="banner"]')).toHaveLength(1);
  });

  it('hides the banner when the selected category has no matching content', async () => {
    state.category = 'gardening';
    await render(EventsScreen);
    expect(cards()).toHaveLength(0);
    expect(banner()).toBeNull();
  });

  it.each([
    { loaded: false }, { loading: true }, { loadingMore: true }, { error: '목록 오류' },
  ])('hides the banner alongside cached cards during loading or failure: %j', async (patch) => {
    Object.assign(state.feeds.upcoming, patch);
    await render(EventsScreen);
    expect(cards()).toHaveLength(3);
    expect(banner()).toBeNull();
  });

  it('does not advertise on an empty, initially loading, or failed list', async () => {
    state.feeds.upcoming.events = [];
    await render(EventsScreen);
    expect(banner()).toBeNull();
    Object.assign(state.feeds.upcoming, { loaded: false, loading: true });
    await render(EventsScreen);
    expect(container.textContent).toContain('모임을 불러오고 있어요');
    expect(banner()).toBeNull();
    Object.assign(state.feeds.upcoming, { loading: false, error: '서버 오류' });
    await render(EventsScreen);
    expect(container.textContent).toContain('모임을 불러오지 못했어요');
    expect(banner()).toBeNull();
  });

  it('waits for both feeds in the all filter and preserves append retry on errors', async () => {
    state.feeds.past.loaded = false;
    await render(EventsScreen);
    await press('전체');
    expect(cards()).toHaveLength(3);
    expect(banner()).toBeNull();
    state.feeds.past.loaded = true;
    await render(EventsScreen);
    expect(banner()).not.toBeNull();
    Object.assign(state.feeds.past, { error: '다음 목록 오류', errorMode: 'append' });
    await render(EventsScreen);
    expect(banner()).toBeNull();
    await press('지난 모임 더 보기 다시 시도');
    expect(state.loadMore).toHaveBeenCalledWith('past');
    expect(state.reload).not.toHaveBeenCalled();
  });
});
