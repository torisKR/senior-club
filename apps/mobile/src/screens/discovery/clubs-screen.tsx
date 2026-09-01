import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { apiErrorMessage } from '@/api/error-message';
import {
  clubsApi,
  mergeClubPages,
  type ClubListPage,
  type PublicClub,
} from '@/api/clubs-api';
import { AppText, EmptyState } from '@/components/ui';
import { Layout, Radius, Spacing, TouchTarget, FontWeights } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';
import { useEffectiveSafeAreaInsets } from '@/hooks/use-effective-safe-area-insets';
import { useTheme } from '@/hooks/use-theme';

import { ClubCard } from './club-card';
import { FilterChip } from './filter-chip';

const ALL_INTERESTS = 'all';
const EMPTY_PAGE: ClubListPage['page'] = { hasNextPage: false, nextCursor: null };

export function ClubsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useEffectiveSafeAreaInsets();
  const { interests, selectedInterestIds } = useAppState();
  const { width } = useWindowDimensions();
  const columns = width >= 760 ? 2 : 1;

  const [activeInterestId, setActiveInterestId] = useState(ALL_INTERESTS);
  const [searchDraft, setSearchDraft] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [clubs, setClubs] = useState<PublicClub[]>([]);
  const [page, setPage] = useState<ClubListPage['page']>(EMPTY_PAGE);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const requestGeneration = useRef(0);
  const firstPageController = useRef<AbortController | null>(null);
  const moreController = useRef<AbortController | null>(null);
  const moreInFlight = useRef(false);
  const failedMoreRequest = useRef<string | null>(null);
  const category = activeInterestId === ALL_INTERESTS ? undefined : activeInterestId;
  const query = submittedQuery || undefined;
  const criteriaKey = `${category ?? ALL_INTERESTS}\u0000${query ?? ''}`;
  const [resultKey, setResultKey] = useState<string | null>(null);

  const settleFirstPage = useCallback(
    async ({
      controller,
      generation,
      key,
      preserveDataOnError,
    }: {
      controller: AbortController;
      generation: number;
      key: string;
      preserveDataOnError: boolean;
    }) => {
      try {
        const response = await clubsApi.list({ category, q: query, signal: controller.signal });
        if (controller.signal.aborted || requestGeneration.current !== generation) return;
        setClubs(mergeClubPages([], response.data));
        setPage(response.page);
        setError(null);
        setLoadMoreError(null);
        setResultKey(key);
      } catch (requestError) {
        if (controller.signal.aborted || requestGeneration.current !== generation) return;
        if (!preserveDataOnError) {
          setClubs([]);
          setPage(EMPTY_PAGE);
        }
        setError(apiErrorMessage(requestError, '커뮤니티 목록을 불러오지 못했습니다.'));
        setLoadMoreError(null);
        setResultKey(key);
      } finally {
        if (!controller.signal.aborted && requestGeneration.current === generation) {
          setInitialLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [category, query],
  );

  const loadFirstPage = useCallback(
    (mode: 'initial' | 'refresh') => {
      const generation = ++requestGeneration.current;
      firstPageController.current?.abort();
      moreController.current?.abort();
      moreInFlight.current = false;
      failedMoreRequest.current = null;
      setLoadingMore(false);
      setLoadMoreError(null);
      setError(null);
      setResultKey(criteriaKey);
      if (mode === 'initial') {
        setInitialLoading(true);
        setClubs([]);
        setPage(EMPTY_PAGE);
      } else {
        setRefreshing(true);
      }

      const controller = new AbortController();
      firstPageController.current = controller;
      void settleFirstPage({
        controller,
        generation,
        key: criteriaKey,
        preserveDataOnError: mode === 'refresh',
      });
    },
    [criteriaKey, settleFirstPage],
  );

  useEffect(() => {
    const generation = ++requestGeneration.current;
    firstPageController.current?.abort();
    moreController.current?.abort();
    moreInFlight.current = false;
    failedMoreRequest.current = null;
    const controller = new AbortController();
    firstPageController.current = controller;
    void settleFirstPage({
      controller,
      generation,
      key: criteriaKey,
      preserveDataOnError: false,
    });

    return () => {
      controller.abort();
    };
  }, [criteriaKey, settleFirstPage]);

  const hasCurrentResult = resultKey === criteriaKey;
  const visibleClubs = hasCurrentResult ? clubs : [];
  const visiblePage = hasCurrentResult ? page : EMPTY_PAGE;
  const visibleError = hasCurrentResult ? error : null;
  const visibleLoadMoreError = hasCurrentResult ? loadMoreError : null;
  const isInitialLoading = !hasCurrentResult || initialLoading;
  const isRefreshing = hasCurrentResult && refreshing;
  const isLoadingMore = hasCurrentResult && loadingMore;

  const loadMore = useCallback(async (retryAfterError = false) => {
    if (
      isInitialLoading ||
      isRefreshing ||
      moreInFlight.current ||
      !visiblePage.hasNextPage ||
      !visiblePage.nextCursor
    ) {
      return;
    }

    const generation = requestGeneration.current;
    const cursor = visiblePage.nextCursor;
    const requestKey = `${criteriaKey}\u0000${cursor}`;
    if (
      !retryAfterError &&
      (visibleLoadMoreError !== null || failedMoreRequest.current === requestKey)
    ) {
      return;
    }

    const controller = new AbortController();
    moreController.current?.abort();
    moreController.current = controller;
    moreInFlight.current = true;
    failedMoreRequest.current = null;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const response = await clubsApi.list({
        category,
        q: query,
        cursor,
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestGeneration.current !== generation) return;
      setClubs((current) => mergeClubPages(current, response.data));
      setPage(response.page);
      failedMoreRequest.current = null;
    } catch (requestError) {
      if (controller.signal.aborted || requestGeneration.current !== generation) return;
      failedMoreRequest.current = requestKey;
      setLoadMoreError(apiErrorMessage(requestError, '다음 커뮤니티를 불러오지 못했습니다.'));
    } finally {
      if (moreController.current === controller) {
        moreController.current = null;
        moreInFlight.current = false;
        if (!controller.signal.aborted && requestGeneration.current === generation) {
          setLoadingMore(false);
        }
      }
    }
  }, [
    category,
    criteriaKey,
    isInitialLoading,
    isRefreshing,
    query,
    visibleLoadMoreError,
    visiblePage.hasNextPage,
    visiblePage.nextCursor,
  ]);

  const submitSearch = () => {
    const normalized = searchDraft.trim().replace(/\s+/g, ' ');
    if (normalized.length === 1) {
      setSearchError('검색어는 두 글자 이상 입력해 주세요.');
      return;
    }
    setSearchError(null);
    if (normalized === submittedQuery) {
      void loadFirstPage('refresh');
    } else {
      setSubmittedQuery(normalized);
    }
  };

  const selectInterest = (interestId: string) => {
    if (interestId === activeInterestId) {
      void loadFirstPage('refresh');
      return;
    }
    setActiveInterestId(interestId);
  };

  return (
    <>
      <Stack.Screen options={{ title: '커뮤니티', headerBackTitle: '뒤로' }} />
      <FlatList
        key={`club-grid-${columns}`}
        data={visibleClubs}
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
          flexGrow: 1,
          alignSelf: 'center',
          paddingHorizontal: width < 360 ? Spacing.lg : Layout.screenPadding,
          paddingTop: insets.top + Spacing.lg,
          paddingBottom: 120,
          gap: Spacing.lg,
        }}
        columnWrapperStyle={columns > 1 ? { gap: Spacing.lg, alignItems: 'stretch' } : undefined}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadFirstPage('refresh')}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: Spacing.xxl, paddingBottom: Spacing.sm }}>
            <View style={{ gap: Spacing.sm }}>
              <AppText variant="display">관심사로 만나는 우리</AppText>
              <AppText variant="body" color="textSecondary">
                현재 공개된 커뮤니티를 관심사와 검색어로 찾아보세요.
              </AppText>
            </View>

            <View style={{ gap: Spacing.sm }}>
              <AppText variant="sectionTitle">커뮤니티 검색</AppText>
              <View style={styles.searchRow}>
                <TextInput
                  value={searchDraft}
                  onChangeText={(value) => {
                    setSearchDraft(value);
                    if (searchError) setSearchError(null);
                  }}
                  onSubmitEditing={submitSearch}
                  placeholder="예: 둘레길, 사진"
                  placeholderTextColor={theme.textMuted}
                  returnKeyType="search"
                  maxLength={80}
                  style={[
                    styles.searchInput,
                    {
                      color: theme.text,
                      backgroundColor: theme.surface,
                      borderColor: searchError ? theme.danger : theme.border,
                    },
                  ]}
                  accessibilityLabel="커뮤니티 검색어"
                  accessibilityHint="두 글자 이상 입력하고 검색 버튼을 누르세요"
                />
                <Pressable
                  onPress={submitSearch}
                  style={({ pressed }) => [
                    styles.searchButton,
                    { backgroundColor: pressed ? theme.primaryPressed : theme.primary },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="커뮤니티 검색"
                >
                  <AppText variant="button" color={theme.inverseText} selectable={false}>
                    검색
                  </AppText>
                </Pressable>
              </View>
              {searchError ? (
                <AppText color="danger" accessibilityLiveRegion="polite">
                  {searchError}
                </AppText>
              ) : null}
              {submittedQuery ? (
                <View style={styles.searchSummary}>
                  <AppText variant="caption" color="textSecondary">
                    ‘{submittedQuery}’ 검색 결과
                  </AppText>
                  <Pressable
                    onPress={() => {
                      setSearchDraft('');
                      setSubmittedQuery('');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="검색어 지우기"
                    hitSlop={8}
                  >
                    <AppText variant="caption" color="primary" selectable={false}>
                      검색 해제
                    </AppText>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <View style={{ gap: Spacing.md }}>
              <AppText variant="sectionTitle">관심사별로 보기</AppText>
              <ScrollView
                horizontal
                contentInsetAdjustmentBehavior="automatic"
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: Spacing.sm, paddingRight: Spacing.xl }}>
                <FilterChip
                  label="전체"
                  selected={activeInterestId === ALL_INTERESTS}
                  onPress={() => selectInterest(ALL_INTERESTS)}
                />
                {interests.map((interest) => (
                  <FilterChip
                    key={interest.id}
                    label={`${interest.emoji} ${interest.name}`}
                    selected={activeInterestId === interest.id}
                    onPress={() => selectInterest(interest.id)}
                    accessibilityLabel={`${interest.name} 커뮤니티만 보기`}
                  />
                ))}
              </ScrollView>
            </View>

            <View style={{ gap: Spacing.xs }}>
              <AppText variant="sectionTitle">커뮤니티</AppText>
              <AppText variant="caption" color="textSecondary">
                {submittedQuery || activeInterestId !== ALL_INTERESTS
                  ? '선택한 조건과 일치하는 커뮤니티입니다.'
                  : '최근 등록된 커뮤니티부터 보여드려요.'}
              </AppText>
            </View>

            {visibleError && visibleClubs.length > 0 ? (
              <View
                style={[
                  styles.inlineError,
                  { backgroundColor: theme.dangerSurface, borderColor: theme.danger },
                ]}
                accessibilityLiveRegion="polite"
              >
                <AppText variant="caption" color="danger" style={{ flex: 1 }}>
                  {visibleError}
                </AppText>
                <Pressable
                  onPress={() => void loadFirstPage('refresh')}
                  accessibilityRole="button"
                  accessibilityLabel="커뮤니티 목록 새로고침 다시 시도"
                  hitSlop={8}
                >
                  <AppText variant="caption" color="danger" selectable={false}>
                    다시 시도
                  </AppText>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ flex: 1, minWidth: 0, paddingBottom: columns > 1 ? 0 : Spacing.xs }}>
            <ClubCard
              club={item}
              recommended={selectedInterestIds.includes(item.interest.slug)}
              onPress={() =>
                router.push({ pathname: '/club/[slug]', params: { slug: item.slug } })
              }
            />
          </View>
        )}
        ListEmptyComponent={
          isInitialLoading ? (
            <View style={styles.loadingState} accessibilityRole="progressbar" accessibilityLabel="커뮤니티 목록을 불러오는 중">
              <ActivityIndicator color={theme.primary} size="large" />
              <AppText variant="bodyStrong">커뮤니티를 불러오고 있어요</AppText>
            </View>
          ) : visibleError ? (
            <EmptyState
              emoji="📡"
              title="커뮤니티를 불러오지 못했어요"
              description={visibleError}
              actionLabel="다시 시도"
              onActionPress={() => void loadFirstPage('initial')}
            />
          ) : (
            <EmptyState
              emoji="🔎"
              title="조건에 맞는 커뮤니티가 없어요"
              description="검색어나 관심사를 바꿔 다시 찾아보세요."
              actionLabel="전체 커뮤니티 보기"
              onActionPress={() => {
                setSearchDraft('');
                setSubmittedQuery('');
                setActiveInterestId(ALL_INTERESTS);
              }}
            />
          )
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.footerStatus} accessibilityRole="progressbar" accessibilityLabel="다음 커뮤니티를 불러오는 중">
              <ActivityIndicator color={theme.primary} />
              <AppText variant="caption" color="textSecondary">더 불러오고 있어요</AppText>
            </View>
          ) : visibleLoadMoreError ? (
            <View style={styles.footerStatus} accessibilityLiveRegion="polite">
              <AppText variant="caption" color="danger" align="center">{visibleLoadMoreError}</AppText>
              <Pressable
                onPress={() => void loadMore(true)}
                style={({ pressed }) => [
                  styles.retryButton,
                  { borderColor: theme.primary, opacity: pressed ? 0.7 : 1 },
                ]}
                accessibilityRole="button"
              >
                <AppText variant="bodyStrong" color="primary" selectable={false}>다시 불러오기</AppText>
              </Pressable>
            </View>
          ) : null
        }
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.35}
        keyExtractor={(item) => item.id}
      />
    </>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.sm },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: TouchTarget.minimum,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    fontSize: 18,
    fontFamily: FontWeights.emphasis,
  },
  searchButton: {
    minWidth: 76,
    minHeight: TouchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
  },
  searchSummary: {
    minHeight: TouchTarget.compact,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  loadingState: {
    flex: 1,
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  inlineError: {
    minHeight: TouchTarget.minimum,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  footerStatus: {
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  retryButton: {
    minHeight: TouchTarget.minimum,
    borderWidth: 1.5,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
});
