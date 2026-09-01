import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { mergeEventPages } from '@/api/events-api';
import { AppText, EmptyState, EventCard, SeniorButton } from '@/components/ui';
import { Layout, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';
import { useEffectiveSafeAreaInsets } from '@/hooks/use-effective-safe-area-insets';
import { useTheme } from '@/hooks/use-theme';
import type { EventListView } from '@/types';

import { matchesEventQuery } from './discovery-utils';
import { FilterChip } from './filter-chip';

type EventFilter = 'all' | 'upcoming' | 'completed';

const eventFilters: { id: EventFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'upcoming', label: '예정' },
  { id: 'completed', label: '지난 모임' },
];

export function EventsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useEffectiveSafeAreaInsets();
  const {
    participations,
    largeTextEnabled,
    eventFeeds,
    ensureEventView,
    loadMoreEventView,
    reloadEventView,
  } = useAppState();
  const { width } = useWindowDimensions();
  const [activeFilter, setActiveFilter] = useState<EventFilter>('upcoming');
  const [query, setQuery] = useState('');
  const columns = width >= 760 ? 2 : 1;

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

  const visibleEvents = useMemo(() => {
    return sourceEvents
      .filter((event) => {
        const lifecycleMatches =
          activeFilter === 'all' ||
          (activeFilter === 'upcoming'
            ? event.lifecycle === 'upcoming' || event.lifecycle === 'full'
            : event.lifecycle === 'completed' || event.lifecycle === 'cancelled');
        return lifecycleMatches && matchesEventQuery(event, query, event.clubTitle);
      })
      .sort((left, right) => {
        const leftPast = left.lifecycle === 'completed' || left.lifecycle === 'cancelled';
        const rightPast = right.lifecycle === 'completed' || right.lifecycle === 'cancelled';
        if (leftPast !== rightPast) return leftPast ? 1 : -1;
        return leftPast
          ? new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime()
          : new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
      });
  }, [activeFilter, query, sourceEvents]);

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

  return (
    <>
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
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{
          width: '100%',
          maxWidth: 980,
          alignSelf: 'center',
          paddingHorizontal: width < 360 ? Spacing.lg : Layout.screenPadding,
          paddingTop: insets.top + Spacing.lg,
          paddingBottom: 120,
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
                  fontSize: largeTextEnabled ? 20 : 18,
                  lineHeight: largeTextEnabled ? 30 : 26,
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
                  accessibilityLabel={`${filter.label} 모임만 보기`}
                />
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: Spacing.sm }}>
              <AppText variant="sectionTitle">모임 {visibleEvents.length}개</AppText>
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
            <View style={{ flex: 1, minWidth: 0, paddingBottom: columns > 1 ? 0 : Spacing.xs }}>
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
              title="조건에 맞는 모임이 없어요"
              description="검색어를 지우거나 전체 모임에서 다시 찾아보세요."
              actionLabel="검색 조건 지우기"
              onActionPress={() => {
                setQuery('');
                setActiveFilter('all');
              }}
            />
          )
        }
        ListFooterComponent={
          hasFeedControls ? (
            <View style={{ gap: Spacing.md, paddingTop: Spacing.md }}>
              {visibleFeedViews.map(renderFeedControl)}
            </View>
          ) : null
        }
        keyExtractor={(item) => item.id}
      />
    </>
  );
}
