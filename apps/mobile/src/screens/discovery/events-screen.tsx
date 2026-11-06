import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { HomeBannerAd } from '@/ads/HomeBannerAd';
import { mergeEventPages } from '@/api/events-api';
import { AppText, EmptyState, EventCard, SeniorButton } from '@/components/ui';
import { FontWeights, Layout, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';
import { useEffectiveSafeAreaInsets } from '@/hooks/use-effective-safe-area-insets';
import { useTheme } from '@/hooks/use-theme';
import type { EventListView } from '@/types';

import {
  filterDiscoveryEvents,
  isEventSearchComplete,
  normalizeEventCategory,
  type EventFilter,
} from './event-discovery-filters';
import { FilterChip } from './filter-chip';

const eventFilters: { id: EventFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'upcoming', label: '예정' },
  { id: 'completed', label: '지난 모임' },
];

export function EventsScreen() {
  const router = useRouter();
  const { category: categoryParam } = useLocalSearchParams<{ category?: string | string[] }>();
  const category = normalizeEventCategory(categoryParam);
  const theme = useTheme();
  const insets = useEffectiveSafeAreaInsets();
  const {
    participations,
    interests,
    largeTextEnabled,
    eventFeeds,
    ensureEventView,
    loadMoreEventView,
    reloadEventView,
  } = useAppState();
  const { width } = useWindowDimensions();
  const [activeFilter, setActiveFilter] = useState<EventFilter>('upcoming');
  const [query, setQuery] = useState('');
  const [previousCategory, setPreviousCategory] = useState(category);
  const columns = width >= 760 ? 2 : 1;
  const selectedInterest = interests.find((interest) => interest.id === category);

  // A retained tab must not apply the previous hobby's search to a new recommendation.
  if (previousCategory !== category) {
    setPreviousCategory(category);
    if (category) {
      setQuery('');
      setActiveFilter('upcoming');
    }
  }

  useEffect(() => {
    if (activeFilter !== 'upcoming') {
      void ensureEventView('past');
    }
  }, [activeFilter, ensureEventView]);

  const visibleFeedViews: EventListView[] =
    activeFilter === 'all'
      ? ['upcoming', 'past']
      : [activeFilter === 'upcoming' ? 'upcoming' : 'past'];

  const sourceEvents = useMemo(() => {
    if (activeFilter === 'upcoming') return eventFeeds.upcoming.events;
    if (activeFilter === 'completed') return eventFeeds.past.events;
    return mergeEventPages(eventFeeds.upcoming.events, eventFeeds.past.events);
  }, [activeFilter, eventFeeds.past.events, eventFeeds.upcoming.events]);

  const visibleEvents = useMemo(
    () => filterDiscoveryEvents(sourceEvents, { lifecycle: activeFilter, category, query }),
    [activeFilter, category, query, sourceEvents],
  );
  const searchComplete = isEventSearchComplete(visibleFeedViews.map((view) => eventFeeds[view]));

  const hasRelevantData = sourceEvents.length > 0;
  const initialLoading = visibleFeedViews.some(
    (view) => !eventFeeds[view].loaded && !eventFeeds[view].error,
  );
  const visibleErrors = visibleFeedViews
    .map((view) => eventFeeds[view].error)
    .filter((error): error is string => Boolean(error));

  const retryFailedViews = () =>
    Promise.all(
      visibleFeedViews
        .filter((view) => Boolean(eventFeeds[view].error))
        .map((view) => reloadEventView(view)),
    ).then(() => undefined);

  const renderFeedControl = (view: EventListView) => {
    const feed = eventFeeds[view];
    const label = view === 'upcoming' ? '예정 모임' : '지난 모임';

    if (!feed.loaded && !feed.error) {
      if (!hasRelevantData) return null;
      return (
        <View
          key={view}
          accessibilityRole="progressbar"
          accessibilityLabel={`${label}을 불러오고 있습니다`}
          style={{ alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md }}>
          <ActivityIndicator color={theme.primary} />
          <AppText variant="caption" color="textSecondary">
            {label}을 불러오고 있어요
          </AppText>
        </View>
      );
    }

    if (feed.loading || feed.loadingMore) {
      return (
        <View
          key={view}
          accessibilityRole="progressbar"
          accessibilityLabel={`${label}을 불러오고 있습니다`}
          style={{ alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md }}>
          <ActivityIndicator color={theme.primary} />
          <AppText variant="caption" color="textSecondary">
            {feed.loadingMore ? `${label}을 더 불러오고 있어요` : `${label}을 새로 불러오고 있어요`}
          </AppText>
        </View>
      );
    }

    if (feed.error) {
      if (!hasRelevantData) return null;
      return (
        <View
          key={view}
          style={{
            gap: Spacing.md,
            padding: Spacing.lg,
            borderWidth: 1,
            borderColor: theme.danger,
            borderRadius: Radius.lg,
            backgroundColor: theme.dangerSurface,
          }}>
          <AppText variant="bodyStrong" color="danger" accessibilityLiveRegion="polite">
            {feed.error}
          </AppText>
          <SeniorButton
            label={feed.errorMode === 'append' ? `${label} 더 보기 다시 시도` : `${label} 다시 시도`}
            variant="outline"
            onPress={() =>
              void (feed.errorMode === 'append'
                ? loadMoreEventView(view)
                : reloadEventView(view))
            }
          />
        </View>
      );
    }

    if (!feed.hasNextPage) return null;
    return (
      <SeniorButton
        key={view}
        label={`${label} 더 보기`}
        variant="outline"
        onPress={() => void loadMoreEventView(view)}
        accessibilityHint={`${label}의 다음 목록을 불러옵니다`}
      />
    );
  };

  const hasFeedControls = visibleFeedViews.some((view) => {
    const feed = eventFeeds[view];
    return !feed.loaded || feed.loading || feed.loadingMore || Boolean(feed.error) || feed.hasNextPage;
  });
  const showBanner = visibleEvents.length > 0 && visibleFeedViews.every((view) => {
    const feed = eventFeeds[view];
    return feed.loaded && !feed.loading && !feed.loadingMore && !feed.error;
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      <Stack.Screen options={{ title: '모임', headerBackTitle: '뒤로' }} />
      <FlatList
        key={`event-grid-${columns}`}
        data={visibleEvents}
        numColumns={columns}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        style={{ flex: 1, backgroundColor: theme.background, overflow: 'hidden' }}
        contentContainerStyle={{
          width: '100%',
          maxWidth: 980,
          alignSelf: 'center',
          paddingHorizontal: width < 360 ? Spacing.lg : Layout.screenPadding,
          paddingTop: Spacing.lg,
          paddingBottom: Spacing.xxxl,
          gap: Spacing.lg,
        }}
        columnWrapperStyle={columns > 1 ? { gap: Spacing.lg, alignItems: 'flex-start' } : undefined}
        ListHeaderComponent={
          <View style={{ gap: Spacing.xxl, paddingBottom: Spacing.sm }}>
            <View style={{ gap: Spacing.sm }}>
              <AppText variant="display">함께할 모임 찾기</AppText>
              <AppText variant="body" color="textSecondary">
                일정과 장소, 난이도를 살펴보고 내게 편안한 활동을 골라보세요.
              </AppText>
            </View>

            <View style={{ gap: Spacing.md }}>
              <AppText variant="bodyStrong" nativeID="event-search-label">
                모임 검색
              </AppText>
              <TextInput
                accessibilityLabel="모임 검색"
                accessibilityLabelledBy="event-search-label"
                value={query}
                onChangeText={setQuery}
                placeholder="제목, 장소, 커뮤니티 이름"
                placeholderTextColor={theme.textMuted}
                returnKeyType="search"
                clearButtonMode="while-editing"
                allowFontScaling
                style={{
                  minHeight: TouchTarget.minimum,
                  borderWidth: 2,
                  borderColor: theme.border,
                  borderRadius: Radius.md,
                  backgroundColor: theme.surface,
                  color: theme.text,
                  fontFamily: FontWeights.body,
                  fontSize: largeTextEnabled ? 18 : 16,
                  lineHeight: largeTextEnabled ? 28 : 24,
                  paddingHorizontal: Spacing.lg,
                  paddingVertical: Spacing.md,
                }}
              />
            </View>

            <ScrollView
              horizontal
              contentInsetAdjustmentBehavior="automatic"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: Spacing.sm, paddingRight: Spacing.xl }}>
              {eventFilters.map((filter) => (
                <FilterChip
                  key={filter.id}
                  label={filter.label}
                  selected={activeFilter === filter.id}
                  onPress={() => setActiveFilter(filter.id)}
                  accessibilityLabel={`${filter.label}${filter.label.endsWith('모임') ? '' : ' 모임'}만 보기`}
                />
              ))}
            </ScrollView>

            <View style={{ gap: Spacing.md }}>
              <AppText variant="bodyStrong">관심사별로 보기</AppText>
              <ScrollView
                horizontal
                contentInsetAdjustmentBehavior="automatic"
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: Spacing.sm, paddingRight: Spacing.xl }}>
                <FilterChip
                  label="전체 관심사"
                  selected={!category}
                  onPress={() => router.setParams({ category: '' })}
                  accessibilityLabel="모든 관심사의 모임 보기"
                />
                {category && !selectedInterest ? (
                  <FilterChip
                    label="선택한 관심사"
                    selected
                    onPress={() => router.setParams({ category: '' })}
                    accessibilityLabel="선택한 관심사 필터 해제"
                  />
                ) : null}
                {interests.map((interest) => (
                  <FilterChip
                    key={interest.id}
                    label={`${interest.emoji} ${interest.name}`}
                    selected={category === interest.id}
                    onPress={() => router.setParams({ category: interest.id })}
                    accessibilityLabel={`${interest.name} 모임만 보기`}
                  />
                ))}
              </ScrollView>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: Spacing.sm }}>
              <AppText variant="sectionTitle">
                {searchComplete ? '모임' : '현재까지 찾은 모임'} {visibleEvents.length}개
              </AppText>
              <AppText variant="caption" color="textSecondary">카드를 눌러 자세한 일정과 신청 방법을 확인하세요.</AppText>
              {category ? (
                <AppText variant="caption" color="textSecondary">
                  {selectedInterest?.name ?? '선택한 관심사'} 모임만 보고 있어요
                </AppText>
              ) : null}
              {query.trim() ? (
                <AppText variant="caption" color="textSecondary">
                  ‘{query.trim()}’ 검색 결과
                </AppText>
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const status = participations.find((participation) => participation.eventId === item.id)?.status;
          return (
            <View style={{ flex: columns > 1 ? 1 : undefined, minWidth: 0, paddingBottom: columns > 1 ? 0 : Spacing.xs }}>
              <EventCard
                event={item}
                participationStatus={status}
                onPress={(event) =>
                  router.push({ pathname: '/event/[id]', params: { id: event.id } })
                }
              />
            </View>
          );
        }}
        ListEmptyComponent={
          !hasRelevantData && initialLoading ? (
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="모임 목록을 불러오고 있습니다"
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md }}>
              <ActivityIndicator size="large" color={theme.primary} />
              <AppText variant="bodyStrong">모임을 불러오고 있어요</AppText>
            </View>
          ) : !hasRelevantData && visibleErrors.length ? (
            <EmptyState
              emoji="📡"
              title="모임을 불러오지 못했어요"
              description={visibleErrors.join('\n')}
              actionLabel="다시 시도"
              onActionPress={() => void retryFailedViews()}
            />
          ) : (
            <EmptyState
              emoji="🗓️"
              title={searchComplete ? '조건에 맞는 모임이 없어요' : '불러온 목록에는 조건에 맞는 모임이 없어요'}
              description={searchComplete
                ? '검색 조건을 지우거나 전체 모임에서 다시 찾아보세요.'
                : '아래에서 남은 목록을 불러오거나 오류를 다시 시도해 보세요. 검색 조건을 지워도 좋아요.'}
              actionLabel="검색 조건 지우기"
              onActionPress={() => {
                setQuery('');
                setActiveFilter('all');
                router.setParams({ category: '' });
              }}
            />
          )
        }
        ListFooterComponent={
          hasFeedControls || showBanner ? (
            <View style={{ gap: Layout.sectionGap, paddingTop: Spacing.md }}>
              {hasFeedControls ? (
                <View style={{ gap: Spacing.md }}>{visibleFeedViews.map(renderFeedControl)}</View>
              ) : null}
              {showBanner ? <HomeBannerAd /> : null}
            </View>
          ) : null
        }
        keyExtractor={(item) => item.id}
      />
    </View>
  );
}
