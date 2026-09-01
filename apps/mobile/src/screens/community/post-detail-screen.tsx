import { Stack, type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ApiError } from '@/api/api-error';
import { apiErrorMessage } from '@/api/error-message';
import {
  POST_CONTENT_MAX_LENGTH,
  POST_CONTENT_MIN_LENGTH,
  POST_TITLE_MAX_LENGTH,
  POST_TITLE_MIN_LENGTH,
  isSafePostClubSlug,
  isSafePostId,
  mergeComments,
  postsApi,
  type CommunityComment,
  type CommunityPostDetail,
  type CursorPage,
} from '@/api/posts-api';
import { safetyApi } from '@/api/safety-api';
import { ContentSafetyActions } from '@/components/safety';
import { AppText, Card, EmptyState, Screen, SectionHeader, SeniorButton } from '@/components/ui';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';
import { useTheme } from '@/hooks/use-theme';
import {
  replaceBlockedUserIds,
  useBlockedUserIds,
} from '@/safety/blocked-users-store';
import { buildLoginHref } from '@/utils/auth-routing';

import { CommentCard } from './comment-card';
import { CommentComposer } from './comment-composer';
import { formatCommunityDate } from './post-card';

const EMPTY_PAGE: CursorPage = { hasNextPage: false, nextCursor: null };

export function PostDetailScreen({ slug, postId }: { slug?: string; postId?: string }) {
  const router = useRouter();
  const theme = useTheme();
  const { session } = useAppState();
  const sessionUserId = session?.userId;
  const blockedUserIds = useBlockedUserIds(sessionUserId);
  const safeSlug = isSafePostClubSlug(slug) ? slug : null;
  const safePostId = isSafePostId(postId) ? postId : null;
  const routeKey = safeSlug && safePostId ? `${safeSlug}\u0000${safePostId}` : null;
  const [post, setPost] = useState<CommunityPostDetail | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentPage, setCommentPage] = useState<CursorPage>(EMPTY_PAGE);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [contentDraft, setContentDraft] = useState('');
  const [postMutation, setPostMutation] = useState<'update' | 'delete' | null>(null);
  const [postMutationError, setPostMutationError] = useState('');
  const resultKeyRef = useRef<string | null>(null);
  const requestGeneration = useRef(0);
  const firstController = useRef<AbortController | null>(null);
  const moreController = useRef<AbortController | null>(null);
  const moreInFlight = useRef(false);
  const failedMoreRequest = useRef<string | null>(null);
  const mutationController = useRef<AbortController | null>(null);
  const safetyRefreshController = useRef<AbortController | null>(null);
  const safetyRequestVersion = useRef(0);
  const mutationInFlight = useRef(false);

  useEffect(
    () => () => {
      mutationController.current?.abort();
      safetyRefreshController.current?.abort();
    },
    [],
  );

  const settleFirstPage = useCallback(
    async ({
      targetSlug,
      targetPostId,
      targetKey,
      generation,
      controller,
      preserveDataOnError,
    }: {
      targetSlug: string;
      targetPostId: string;
      targetKey: string;
      generation: number;
      controller: AbortController;
      preserveDataOnError: boolean;
    }) => {
      const [postResult, commentsResult] = await Promise.allSettled([
        postsApi.detail(targetSlug, targetPostId, controller.signal),
        postsApi.comments(targetPostId, { signal: controller.signal }),
      ]);
      if (controller.signal.aborted || requestGeneration.current !== generation) return;

      if (postResult.status === 'rejected') {
        const missing = postResult.reason instanceof ApiError && postResult.reason.status === 404;
        if (!preserveDataOnError || missing) {
          setPost(null);
          setComments([]);
          setCommentPage(EMPTY_PAGE);
        }
        setNotFound(missing);
        setError(
          missing
            ? null
            : apiErrorMessage(postResult.reason, '게시글을 불러오지 못했습니다.'),
        );
      } else {
        setPost(postResult.value);
        setNotFound(false);
        setError(null);
        if (commentsResult.status === 'fulfilled') {
          setComments(mergeComments([], commentsResult.value.data));
          setCommentPage(commentsResult.value.page);
          setCommentsError(null);
          setLoadMoreError(null);
        } else {
          if (!preserveDataOnError) {
            setComments([]);
            setCommentPage(EMPTY_PAGE);
          }
          setCommentsError(
            apiErrorMessage(commentsResult.reason, '댓글 목록을 불러오지 못했습니다.'),
          );
        }
      }
      resultKeyRef.current = targetKey;
      setResultKey(targetKey);
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    },
    [],
  );

  const startFirstPage = useCallback(
    (mode: 'retry' | 'refresh') => {
      if (!safeSlug || !safePostId || !routeKey) return;
      const generation = ++requestGeneration.current;
      firstController.current?.abort();
      moreController.current?.abort();
      moreInFlight.current = false;
      failedMoreRequest.current = null;
      setNotFound(false);
      setError(null);
      setCommentsError(null);
      setLoadMoreError(null);
      setLoadingMore(false);
      if (mode === 'retry') {
        setPost(null);
        setComments([]);
        setCommentPage(EMPTY_PAGE);
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      resultKeyRef.current = routeKey;
      setResultKey(routeKey);
      const controller = new AbortController();
      firstController.current = controller;
      void settleFirstPage({
        targetSlug: safeSlug,
        targetPostId: safePostId,
        targetKey: routeKey,
        generation,
        controller,
        preserveDataOnError: mode === 'refresh',
      });
    },
    [routeKey, safePostId, safeSlug, settleFirstPage],
  );

  useFocusEffect(
    useCallback(() => {
      if (!safeSlug || !safePostId || !routeKey) return;
      const generation = ++requestGeneration.current;
      firstController.current?.abort();
      moreController.current?.abort();
      moreInFlight.current = false;
      failedMoreRequest.current = null;
      const controller = new AbortController();
      firstController.current = controller;
      void settleFirstPage({
        targetSlug: safeSlug,
        targetPostId: safePostId,
        targetKey: routeKey,
        generation,
        controller,
        preserveDataOnError: resultKeyRef.current === routeKey,
      });
      return () => {
        controller.abort();
        firstController.current?.abort();
        moreController.current?.abort();
      };
    }, [routeKey, safePostId, safeSlug, settleFirstPage]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!sessionUserId) return;
      const currentUserId = sessionUserId;
      const version = ++safetyRequestVersion.current;
      const controller = new AbortController();
      void safetyApi
        .blocks(controller.signal)
        .then((blocks) => {
          if (
            !controller.signal.aborted &&
            safetyRequestVersion.current === version
          ) {
            replaceBlockedUserIds(
              currentUserId,
              blocks.map((block) => block.blockedUser.id),
            );
          }
        })
        .catch(() => {
          // Keep locally hidden authors hidden if this non-blocking refresh fails.
        });
      return () => {
        controller.abort();
        if (safetyRequestVersion.current === version) {
          safetyRequestVersion.current += 1;
        }
      };
    }, [sessionUserId]),
  );

  const hasCurrentResult = routeKey !== null && resultKey === routeKey;
  const visiblePost = hasCurrentResult ? post : null;
  const visibleComments = hasCurrentResult
    ? comments.filter((comment) => !blockedUserIds.has(comment.author.id))
    : [];
  const visibleCommentPage = hasCurrentResult ? commentPage : EMPTY_PAGE;
  const visibleError = hasCurrentResult ? error : null;
  const visibleCommentsError = hasCurrentResult ? commentsError : null;
  const visibleLoadMoreError = hasCurrentResult ? loadMoreError : null;
  const isInitialLoading = routeKey !== null && (!hasCurrentResult || loading);
  const isRefreshing = hasCurrentResult && refreshing;
  const isLoadingMore = hasCurrentResult && loadingMore;

  const loadMoreComments = useCallback(
    async (retryAfterError = false) => {
      if (
        !safePostId ||
        !routeKey ||
        isInitialLoading ||
        isRefreshing ||
        moreInFlight.current ||
        !visibleCommentPage.hasNextPage ||
        !visibleCommentPage.nextCursor
      ) {
        return;
      }
      const cursor = visibleCommentPage.nextCursor;
      const requestKey = `${routeKey}\u0000${cursor}`;
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
        const response = await postsApi.comments(safePostId, {
          cursor,
          signal: controller.signal,
        });
        if (controller.signal.aborted || requestGeneration.current !== generation) return;
        setComments((current) => mergeComments(current, response.data));
        setCommentPage(response.page);
      } catch (caught) {
        if (controller.signal.aborted || requestGeneration.current !== generation) return;
        failedMoreRequest.current = requestKey;
        setLoadMoreError(apiErrorMessage(caught, '다음 댓글을 불러오지 못했습니다.'));
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
      routeKey,
      safePostId,
      visibleCommentPage.hasNextPage,
      visibleCommentPage.nextCursor,
      visibleLoadMoreError,
    ],
  );

  const savePost = async () => {
    if (!visiblePost || !safeSlug || mutationInFlight.current) return;
    const normalizedTitle = titleDraft.trim().replace(/\s+/g, ' ');
    const normalizedContent = contentDraft.trim();
    if (
      normalizedTitle.length < POST_TITLE_MIN_LENGTH ||
      normalizedTitle.length > POST_TITLE_MAX_LENGTH
    ) {
      setPostMutationError('제목은 2자 이상 100자 이하로 입력해 주세요.');
      return;
    }
    if (
      normalizedContent.length < POST_CONTENT_MIN_LENGTH ||
      normalizedContent.length > POST_CONTENT_MAX_LENGTH
    ) {
      setPostMutationError('본문은 10자 이상 5000자 이하로 입력해 주세요.');
      return;
    }
    const controller = new AbortController();
    mutationController.current?.abort();
    mutationController.current = controller;
    mutationInFlight.current = true;
    setPostMutation('update');
    setPostMutationError('');
    try {
      const updated = await postsApi.updatePost(
        safeSlug,
        visiblePost.id,
        { title: normalizedTitle, content: normalizedContent },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setPost(updated);
      setEditingPost(false);
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError && caught.status === 401) {
        router.push(buildLoginHref(`/club/${safeSlug}/post/${visiblePost.id}`));
        return;
      }
      setPostMutationError(
        apiErrorMessage(caught, '게시글을 수정하지 못했습니다. 새로고침 후 확인해 주세요.'),
      );
    } finally {
      if (mutationController.current === controller) mutationController.current = null;
      mutationInFlight.current = false;
      if (!controller.signal.aborted) setPostMutation(null);
    }
  };

  const confirmDeletePost = () => {
    if (!visiblePost || !safeSlug || mutationInFlight.current) return;
    Alert.alert('게시글을 삭제할까요?', '삭제한 게시글과 댓글은 게시판에서 더 이상 보이지 않습니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          if (mutationInFlight.current) return;
          const controller = new AbortController();
          mutationController.current?.abort();
          mutationController.current = controller;
          mutationInFlight.current = true;
          setPostMutation('delete');
          setPostMutationError('');
          try {
            await postsApi.deletePost(visiblePost.id, controller.signal);
            if (!controller.signal.aborted) {
              router.replace(`/club/${safeSlug}/posts` as Href);
            }
          } catch (caught) {
            if (controller.signal.aborted) return;
            if (caught instanceof ApiError && caught.status === 401) {
              router.push(buildLoginHref(`/club/${safeSlug}/post/${visiblePost.id}`));
              return;
            }
            setPostMutationError(
              apiErrorMessage(caught, '게시글을 삭제하지 못했습니다. 새로고침 후 확인해 주세요.'),
            );
          } finally {
            if (mutationController.current === controller) mutationController.current = null;
            mutationInFlight.current = false;
            if (!controller.signal.aborted) setPostMutation(null);
          }
        },
      },
    ]);
  };

  const refreshAfterAuthorBlocked = useCallback(
    async (blockedAuthorUserId: string) => {
      if (!sessionUserId || !safeSlug || !safePostId || !routeKey) return;
      const currentUserId = sessionUserId;
      const generation = requestGeneration.current;
      const safetyVersion = ++safetyRequestVersion.current;

      // ContentSafetyActions has already updated the local block store. Filter the
      // backing list too so every comment from this author disappears immediately.
      setComments((current) =>
        current.filter((comment) => comment.author.id !== blockedAuthorUserId),
      );

      const controller = new AbortController();
      safetyRefreshController.current?.abort();
      safetyRefreshController.current = controller;

      try {
        const blocks = await safetyApi.blocks(controller.signal);
        if (
          controller.signal.aborted ||
          requestGeneration.current !== generation ||
          safetyRequestVersion.current !== safetyVersion
        ) {
          return;
        }
        const authoritativeBlockedUserIds = new Set(
          blocks.map((block) => block.blockedUser.id),
        );
        if (!authoritativeBlockedUserIds.has(blockedAuthorUserId)) {
          throw new Error('차단 상태가 서버 목록에 반영되지 않았습니다.');
        }
        replaceBlockedUserIds(currentUserId, authoritativeBlockedUserIds);

        const [nextPost, nextComments] = await Promise.all([
          postsApi.detail(safeSlug, safePostId, controller.signal),
          postsApi.comments(safePostId, { signal: controller.signal }),
        ]);
        if (
          controller.signal.aborted ||
          requestGeneration.current !== generation ||
          safetyRequestVersion.current !== safetyVersion
        ) {
          return;
        }
        setPost(nextPost);
        setComments(
          mergeComments([], nextComments.data).filter(
            (comment) => !authoritativeBlockedUserIds.has(comment.author.id),
          ),
        );
        setCommentPage(nextComments.page);
        setCommentsError(null);
        setLoadMoreError(null);
      } finally {
        if (safetyRefreshController.current === controller) {
          safetyRefreshController.current = null;
        }
      }
    },
    [routeKey, safePostId, safeSlug, sessionUserId],
  );

  if (routeKey === null || (hasCurrentResult && notFound)) {
    return (
      <>
        <Stack.Screen options={{ title: '게시글', headerBackTitle: '게시판' }} />
        <Screen contentContainerStyle={{ justifyContent: 'center', flexGrow: 1 }}>
          <EmptyState
            emoji="🔎"
            title="게시글을 찾지 못했어요"
            description="삭제되었거나 공개되지 않은 게시글일 수 있어요."
            actionLabel="커뮤니티 목록으로"
            onActionPress={() => router.replace('/clubs')}
          />
        </Screen>
      </>
    );
  }

  if (isInitialLoading) {
    return (
      <>
        <Stack.Screen options={{ title: '게시글', headerBackTitle: '게시판' }} />
        <Screen contentContainerStyle={{ justifyContent: 'center', flexGrow: 1 }}>
          <View style={styles.loading} accessibilityRole="progressbar">
            <ActivityIndicator color={theme.primary} size="large" />
            <AppText variant="bodyStrong">게시글과 댓글을 불러오고 있어요</AppText>
          </View>
        </Screen>
      </>
    );
  }

  if (!visiblePost) {
    return (
      <>
        <Stack.Screen options={{ title: '게시글', headerBackTitle: '게시판' }} />
        <Screen contentContainerStyle={{ justifyContent: 'center', flexGrow: 1 }}>
          <EmptyState
            emoji="📡"
            title="게시글을 불러오지 못했어요"
            description={visibleError ?? '잠시 뒤 다시 시도해 주세요.'}
            actionLabel="다시 시도"
            onActionPress={() => startFirstPage('retry')}
          />
        </Screen>
      </>
    );
  }

  if (sessionUserId && blockedUserIds.has(visiblePost.author.id)) {
    return (
      <>
        <Stack.Screen options={{ title: '숨긴 게시글', headerBackTitle: '게시판' }} />
        <Screen contentContainerStyle={{ justifyContent: 'center', flexGrow: 1 }}>
          <EmptyState
            emoji="🛡️"
            title="차단한 사용자의 게시글을 숨겼어요"
            description="차단한 사용자의 게시글과 댓글은 이 계정에서 표시하지 않습니다."
            actionLabel="게시판으로 돌아가기"
            onActionPress={() => router.replace(`/club/${safeSlug}/posts` as Href)}
          />
        </Screen>
      </>
    );
  }

  const returnTo = `/club/${safeSlug}/post/${visiblePost.id}`;
  const isPostAuthor = sessionUserId === visiblePost.author.id;

  return (
    <>
      <Stack.Screen options={{ title: visiblePost.title, headerBackTitle: '게시판' }} />
      <Screen
        contentContainerStyle={{ maxWidth: 820 }}
        scrollViewProps={{
          refreshControl: (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => startFirstPage('refresh')}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          ),
        }}
      >
        {visibleError ? (
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
              style={styles.textAction}
            >
              <AppText variant="bodyStrong" color="danger" selectable={false}>
                다시 시도
              </AppText>
            </Pressable>
          </View>
        ) : null}

        <Card style={{ gap: Spacing.lg }}>
          <View style={{ gap: Spacing.xs }}>
            <AppText variant="caption" color="primary">
              {visiblePost.club.title} · {visiblePost.author.name}
            </AppText>
            <AppText variant="caption" color="textSecondary">
              {formatCommunityDate(visiblePost.createdAt)}
              {visiblePost.updatedAt !== visiblePost.createdAt ? ' · 수정됨' : ''}
            </AppText>
          </View>

          {editingPost ? (
            <View style={{ gap: Spacing.lg }}>
              <View style={{ gap: Spacing.sm }}>
                <AppText variant="bodyStrong">제목</AppText>
                <TextInput
                  value={titleDraft}
                  onChangeText={(value) => {
                    setTitleDraft(value);
                    setPostMutationError('');
                  }}
                  editable={!postMutation}
                  maxLength={POST_TITLE_MAX_LENGTH}
                  style={[
                    styles.input,
                    { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                  accessibilityLabel="수정할 게시글 제목"
                />
              </View>
              <View style={{ gap: Spacing.sm }}>
                <AppText variant="bodyStrong">본문</AppText>
                <TextInput
                  value={contentDraft}
                  onChangeText={(value) => {
                    setContentDraft(value);
                    setPostMutationError('');
                  }}
                  editable={!postMutation}
                  maxLength={POST_CONTENT_MAX_LENGTH}
                  multiline
                  textAlignVertical="top"
                  style={[
                    styles.input,
                    styles.postContentInput,
                    { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                  accessibilityLabel="수정할 게시글 본문"
                />
                <AppText variant="caption" color="textSecondary" align="right">
                  {contentDraft.length} / {POST_CONTENT_MAX_LENGTH}자
                </AppText>
              </View>
              <View style={styles.buttonRow}>
                <SeniorButton
                  label="수정 취소"
                  variant="outline"
                  fullWidth={false}
                  disabled={Boolean(postMutation)}
                  onPress={() => {
                    setEditingPost(false);
                    setPostMutationError('');
                  }}
                />
                <SeniorButton
                  label="수정 저장"
                  fullWidth={false}
                  loading={postMutation === 'update'}
                  disabled={postMutation === 'delete'}
                  onPress={savePost}
                />
              </View>
            </View>
          ) : (
            <>
              <AppText variant="title">{visiblePost.title}</AppText>
              <AppText variant="body" style={{ lineHeight: 30 }}>
                {visiblePost.content}
              </AppText>
            </>
          )}

          {postMutationError ? (
            <AppText color="danger" accessibilityRole="alert">
              {postMutationError}
            </AppText>
          ) : null}

          {isPostAuthor && !editingPost ? (
            <View style={styles.ownerActions} accessibilityLabel="내 게시글 관리">
              <Pressable
                onPress={() => {
                  setTitleDraft(visiblePost.title);
                  setContentDraft(visiblePost.content);
                  setEditingPost(true);
                  setPostMutationError('');
                }}
                disabled={Boolean(postMutation)}
                accessibilityRole="button"
                accessibilityLabel="게시글 수정"
                style={styles.textAction}
              >
                <AppText variant="bodyStrong" color="primary" selectable={false}>
                  수정
                </AppText>
              </Pressable>
              <Pressable
                onPress={confirmDeletePost}
                disabled={Boolean(postMutation)}
                accessibilityRole="button"
                accessibilityLabel="게시글 삭제"
                style={styles.textAction}
              >
                <AppText variant="bodyStrong" color="danger" selectable={false}>
                  {postMutation === 'delete' ? '삭제 중' : '삭제'}
                </AppText>
              </Pressable>
            </View>
          ) : null}

          {sessionUserId && !isPostAuthor && !editingPost ? (
            <ContentSafetyActions
              targetType="POST"
              targetId={visiblePost.id}
              targetLabel="게시글"
              authorUserId={visiblePost.author.id}
              authorName={visiblePost.author.name}
              currentUserId={sessionUserId}
              onBlocked={refreshAfterAuthorBlocked}
            />
          ) : null}
        </Card>

        <CommentComposer
          postId={visiblePost.id}
          returnTo={returnTo}
          onCreated={(comment) => {
            setComments((current) => mergeComments(current, [comment]));
            setPost((current) =>
              current ? { ...current, commentCount: current.commentCount + 1 } : current,
            );
          }}
          onVerifyAmbiguousResult={() => startFirstPage('refresh')}
        />

        <View style={{ gap: Spacing.lg }}>
          <SectionHeader
            title={`댓글 ${visiblePost.commentCount.toLocaleString('ko-KR')}개`}
            description="공개된 댓글을 오래된 순서부터 보여드려요."
          />

          {visibleCommentsError && visibleComments.length > 0 ? (
            <View
              style={[
                styles.inlineError,
                { backgroundColor: theme.dangerSurface, borderColor: theme.danger },
              ]}
              accessibilityRole="alert"
            >
              <AppText color="danger" style={{ flex: 1 }}>
                {visibleCommentsError}
              </AppText>
              <Pressable
                onPress={() => startFirstPage('refresh')}
                accessibilityRole="button"
                style={styles.textAction}
              >
                <AppText variant="bodyStrong" color="danger" selectable={false}>
                  다시 시도
                </AppText>
              </Pressable>
            </View>
          ) : null}

          {visibleCommentsError && visibleComments.length === 0 ? (
            <EmptyState
              emoji="📡"
              title="댓글을 불러오지 못했어요"
              description={visibleCommentsError}
              actionLabel="댓글 다시 불러오기"
              onActionPress={() => startFirstPage('refresh')}
            />
          ) : visibleComments.length === 0 ? (
            <EmptyState
              emoji="💬"
              title="아직 공개된 댓글이 없어요"
              description="첫 댓글로 따뜻한 대화를 시작해 보세요."
            />
          ) : (
            visibleComments.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                currentUserId={sessionUserId}
                returnTo={returnTo}
                onUpdated={(updated) =>
                  setComments((current) => mergeComments(current, [updated]))
                }
                onDeleted={(commentId) => {
                  setComments((current) => current.filter(({ id }) => id !== commentId));
                  setPost((current) =>
                    current
                      ? { ...current, commentCount: Math.max(0, current.commentCount - 1) }
                      : current,
                  );
                }}
                onAuthorBlocked={refreshAfterAuthorBlocked}
              />
            ))
          )}

          {isLoadingMore ? (
            <View style={styles.loadingMore} accessibilityRole="progressbar">
              <ActivityIndicator color={theme.primary} />
              <AppText variant="caption" color="textSecondary">
                다음 댓글을 불러오고 있어요
              </AppText>
            </View>
          ) : visibleLoadMoreError ? (
            <View style={{ gap: Spacing.sm }} accessibilityRole="alert">
              <AppText color="danger" align="center">
                {visibleLoadMoreError}
              </AppText>
              <SeniorButton
                label="다음 댓글 다시 불러오기"
                variant="outline"
                onPress={() => void loadMoreComments(true)}
              />
            </View>
          ) : visibleCommentPage.hasNextPage ? (
            <SeniorButton
              label="댓글 더 보기"
              variant="outline"
              onPress={() => void loadMoreComments()}
            />
          ) : null}
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  inlineError: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  input: {
    minHeight: TouchTarget.minimum,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 18,
    lineHeight: 27,
  },
  postContentInput: { minHeight: 220 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: Spacing.sm },
  ownerActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
  textAction: {
    minWidth: TouchTarget.compact,
    minHeight: TouchTarget.compact,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  loadingMore: { minHeight: 80, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
});
