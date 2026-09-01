import { Stack, type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { ApiError } from '@/api/api-error';
import { apiErrorMessage } from '@/api/error-message';
import {
  isSafePostClubSlug,
  mergePosts,
  postsApi,
  type CursorPage,
  type PostClubSummary,
  type CommunityPost,
} from '@/api/posts-api';
import { safetyApi } from '@/api/safety-api';
import { AppText, EmptyState } from '@/components/ui';
import { Layout, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useEffectiveSafeAreaInsets } from '@/hooks/use-effective-safe-area-insets';
import { useAppState } from '@/hooks/use-app-state';
import { useTheme } from '@/hooks/use-theme';
import {
  replaceBlockedUserIds,
  useBlockedUserIds,
} from '@/safety/blocked-users-store';

import { PostCard } from './post-card';
import { PostComposer } from './post-composer';

const EMPTY_PAGE: CursorPage = { hasNextPage: false, nextCursor: null };

export function PostsScreen({ slug }: { slug?: string }) {
  const router = useRouter();
  const theme = useTheme();
  const insets = useEffectiveSafeAreaInsets();
  const { session } = useAppState();
  const sessionUserId = session?.userId;
  const blockedUserIds = useBlockedUserIds(sessionUserId);
  const { width } = useWindowDimensions();
  const columns = width >= 760 ? 2 : 1;
  const safeSlug = isSafePostClubSlug(slug) ? slug : null;
  const [club, setClub] = useState<PostClubSummary | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [page, setPage] = useState<CursorPage>(EMPTY_PAGE);
  const [resultSlug, setResultSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const resultSlugRef = useRef<string | null>(null);
  const requestGeneration = useRef(0);
  const firstController = useRef<AbortController | null>(null);
  const moreController = useRef<AbortController | null>(null);
  const moreInFlight = useRef(false);
  const failedMoreRequest = useRef<string | null>(null);

  const settleFirstPage = useCallback(
    async ({
      targetSlug,
      generation,
      controller,
      preserveDataOnError,
    }: {
      targetSlug: string;
      generation: number;
      controller: AbortController;
      preserveDataOnError: boolean;
    }) => {
      try {
        const response = await postsApi.list(targetSlug, { signal: controller.signal });
        if (controller.signal.aborted || requestGeneration.current !== generation) return;
        setClub(response.club);
        setPosts(mergePosts([], response.data));
        setPage(response.page);
        setNotFound(false);
        setError(null);
        setLoadMoreError(null);
        resultSlugRef.current = targetSlug;
        setResultSlug(targetSlug);
      } catch (caught) {
        if (controller.signal.aborted || requestGeneration.current !== generation) return;
        const missing = caught instanceof ApiError && caught.status === 404;
        if (!preserveDataOnError || missing) {
          setClub(null);
          setPosts([]);
          setPage(EMPTY_PAGE);
        }
        setNotFound(missing);
        setError(
          missing ? null : apiErrorMessage(caught, '게시글 목록을 불러오지 못했습니다.'),
        );
        setLoadMoreError(null);
        resultSlugRef.current = targetSlug;
        setResultSlug(targetSlug);
      } finally {
        if (!controller.signal.aborted && requestGeneration.current === generation) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  const startFirstPage = useCallback(
    (mode: 'retry' | 'refresh') => {
      if (!safeSlug) return;
      const generation = ++requestGeneration.current;
      firstController.current?.abort();
      moreController.current?.abort();
      moreInFlight.current = false;
      failedMoreRequest.current = null;
      setLoadMoreError(null);
      setError(null);
      setNotFound(false);
      setLoadingMore(false);
      if (mode === 'retry') {
        setClub(null);
        setPosts([]);
        setPage(EMPTY_PAGE);
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      resultSlugRef.current = safeSlug;
      setResultSlug(safeSlug);
      const controller = new AbortController();
      firstController.current = controller;
      void settleFirstPage({
        targetSlug: safeSlug,
        generation,
        controller,
        preserveDataOnError: mode === 'refresh',
      });
    },
    [safeSlug, settleFirstPage],
  );

  useFocusEffect(
    useCallback(() => {
      if (!safeSlug) return;
      const generation = ++requestGeneration.current;
      firstController.current?.abort();
      moreController.current?.abort();
      moreInFlight.current = false;
      failedMoreRequest.current = null;
      const controller = new AbortController();
      firstController.current = controller;
      void settleFirstPage({
        targetSlug: safeSlug,
        generation,
        controller,
        preserveDataOnError: resultSlugRef.current === safeSlug,
      });
      return () => {
        controller.abort();
        firstController.current?.abort();
        moreController.current?.abort();
      };
    }, [safeSlug, settleFirstPage]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!sessionUserId) return;
      const currentUserId = sessionUserId;
      const controller = new AbortController();
      void safetyApi
        .blocks(controller.signal)
        .then((blocks) => {
          if (!controller.signal.aborted) {
            replaceBlockedUserIds(
              currentUserId,
              blocks.map((block) => block.blockedUser.id),
            );
          }
        })
        .catch(() => {
          // Keep the current in-memory block set if the authoritative refresh is unavailable.
        });
      return () => controller.abort();
    }, [sessionUserId]),
  );

  const hasCurrentResult = safeSlug !== null && resultSlug === safeSlug;
  const visibleClub = hasCurrentResult ? club : null;
  const visiblePosts = hasCurrentResult
    ? posts.filter((post) => !blockedUserIds.has(post.author.id))
    : [];
  const visiblePage = hasCurrentResult ? page : EMPTY_PAGE;
  const visibleError = hasCurrentResult ? error : null;
  const visibleLoadMoreError = hasCurrentResult ? loadMoreError : null;
  const isInitialLoading = safeSlug !== null && (!hasCurrentResult || loading);
  const isRefreshing = hasCurrentResult && refreshing;
  const isLoadingMore = hasCurrentResult && loadingMore;

  const loadMore = useCallback(
    async (retryAfterError = false) => {
      if (
        !safeSlug ||
        isInitialLoading ||
        isRefreshing ||
        moreInFlight.current ||
        !visiblePage.hasNextPage ||
        !visiblePage.nextCursor
      ) {
        return;
      }
      const cursor = visiblePage.nextCursor;
      const requestKey = `${safeSlug}\u0000${cursor}`;
      if (
        !retryAfterError &&
        (visibleLoadMoreError !== null || failedMoreRequest.current === requestKey)
      ) {
        return;
      }

      const generation = requestGeneration.current;
      const controller = new AbortController();
      moreController.current?.abort();
      moreController.current = controller;
      moreInFlight.current = true;
      failedMoreRequest.current = null;
      setLoadingMore(true);
      setLoadMoreError(null);
      try {
        const response = await postsApi.list(safeSlug, { cursor, signal: controller.signal });
        if (controller.signal.aborted || requestGeneration.current !== generation) return;
        setPosts((current) => mergePosts(current, response.data));
        setPage(response.page);
      } catch (caught) {
        if (controller.signal.aborted || requestGeneration.current !== generation) return;
        failedMoreRequest.current = requestKey;
        setLoadMoreError(apiErrorMessage(caught, '다음 게시글을 불러오지 못했습니다.'));
      } finally {
        if (moreController.current === controller) {
          moreController.current = null;
          moreInFlight.current = false;
          if (!controller.signal.aborted && requestGeneration.current === generation) {
            setLoadingMore(false);
          }
        }
      }
    },
    [
      isInitialLoading,
      isRefreshing,
      safeSlug,
      visibleLoadMoreError,
      visiblePage.hasNextPage,
      visiblePage.nextCursor,
    ],
  );

  if (safeSlug === null || (hasCurrentResult && notFound)) {
    return (
      <>
        <Stack.Screen options={{ title: '게시판', headerBackTitle: '커뮤니티' }} />
        <View style={[styles.centered, { backgroundColor: theme.background }]}>
          <EmptyState
            emoji="🔎"
            title="커뮤니티 게시판을 찾지 못했어요"
            description="삭제되었거나 공개되지 않은 커뮤니티일 수 있어요."
            actionLabel="커뮤니티 목록으로"
            onActionPress={() => router.replace('/clubs')}
          />
        </View>
      </>
    );
  }

  const title = visibleClub ? `${visibleClub.title} 게시판` : '커뮤니티 게시판';
  const returnTo = `/club/${safeSlug}/posts`;

  return (
    <>
      <Stack.Screen options={{ title, headerBackTitle: '커뮤니티' }} />
      <FlatList
        key={`post-grid-${columns}`}
        data={visiblePosts}
        numColumns={columns}
        keyExtractor={(item) => item.id}
        style={{ flex: 1, backgroundColor: theme.background }}
        contentInsetAdjustmentBehavior="never"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          width: '100%',
          maxWidth: Layout.maxContentWidth,
          flexGrow: 1,
          alignSelf: 'center',
          gap: Spacing.lg,
          paddingHorizontal: width < 360 ? Spacing.lg : Layout.screenPadding,
          paddingTop: insets.top + Spacing.lg,
          paddingBottom: Math.max(Spacing.huge, insets.bottom + Spacing.xl),
        }}
        columnWrapperStyle={columns > 1 ? { gap: Spacing.lg, alignItems: 'stretch' } : undefined}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => startFirstPage('refresh')}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: Spacing.xxl, paddingBottom: Spacing.sm }}>
            <View style={{ gap: Spacing.sm }}>
              <AppText variant="display">{title}</AppText>
              <AppText variant="body" color="textSecondary">
                질문과 경험을 나누고, 다음 활동으로 관계를 이어가 보세요.
              </AppText>
            </View>

            {visibleClub ? (
              <PostComposer
                clubSlug={safeSlug}
                returnTo={returnTo}
                onCreated={(post) =>
                  router.push(`/club/${safeSlug}/post/${post.id}` as Href)
                }
                onVerifyAmbiguousResult={() => startFirstPage('refresh')}
              />
            ) : null}

            {visibleError && visiblePosts.length > 0 ? (
              <View
                style={[
                  styles.inlineError,
                  { backgroundColor: theme.dangerSurface, borderColor: theme.danger },
                ]}
                accessibilityRole="alert"
              >
                <AppText color="danger" style={{ flex: 1 }}>
                  {visibleError}
                </AppText>
                <Pressable
                  onPress={() => startFirstPage('refresh')}
                  accessibilityRole="button"
                  accessibilityLabel="게시글 목록 다시 불러오기"
                  style={styles.inlineAction}
                >
                  <AppText variant="bodyStrong" color="danger" selectable={false}>
                    다시 시도
                  </AppText>
                </Pressable>
              </View>
            ) : null}

            {visibleClub ? <AppText variant="sectionTitle">공개 게시글</AppText> : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ flex: 1, minWidth: 0, paddingBottom: columns > 1 ? 0 : Spacing.xs }}>
            <PostCard
              post={item}
              onPress={() =>
                router.push(`/club/${safeSlug}/post/${item.id}` as Href)
              }
            />
          </View>
        )}
        ListEmptyComponent={
          isInitialLoading ? (
            <View
              style={styles.loading}
              accessibilityRole="progressbar"
              accessibilityLabel="게시글 목록을 불러오는 중"
            >
              <ActivityIndicator color={theme.primary} size="large" />
              <AppText variant="bodyStrong">게시글을 불러오고 있어요</AppText>
            </View>
          ) : visibleError ? (
            <EmptyState
              emoji="📡"
              title="게시글을 불러오지 못했어요"
              description={visibleError}
              actionLabel="다시 시도"
              onActionPress={() => startFirstPage('retry')}
            />
          ) : (
            <EmptyState
              emoji="📝"
              title="아직 공개된 게시글이 없어요"
              description="첫 이야기를 남겨 커뮤니티 대화를 시작해 보세요."
            />
          )
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.footer} accessibilityRole="progressbar">
              <ActivityIndicator color={theme.primary} />
              <AppText variant="caption" color="textSecondary">
                다음 게시글을 불러오고 있어요
              </AppText>
            </View>
          ) : visibleLoadMoreError ? (
            <View style={styles.footer} accessibilityRole="alert">
              <AppText color="danger" align="center">
                {visibleLoadMoreError}
              </AppText>
              <Pressable
                onPress={() => void loadMore(true)}
                accessibilityRole="button"
                accessibilityLabel="다음 게시글 다시 불러오기"
                style={[
                  styles.retryButton,
                  { borderColor: theme.primary, backgroundColor: theme.surface },
                ]}
              >
                <AppText variant="bodyStrong" color="primary" selectable={false}>
                  다시 불러오기
                </AppText>
              </Pressable>
            </View>
          ) : null
        }
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.3}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', padding: Spacing.xl },
  loading: {
    minHeight: 240,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  inlineError: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  inlineAction: {
    minWidth: TouchTarget.minimum,
    minHeight: TouchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
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
