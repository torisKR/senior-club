import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { ApiError, isRetryableApiError } from '@/api/api-error';
import { apiErrorMessage } from '@/api/error-message';
import { eventsApi } from '@/api/events-api';
import {
  REVIEW_CONTENT_MAX_LENGTH,
  REVIEW_CONTENT_MIN_LENGTH,
  mergeReviews,
  parseReviewEventIdParam,
  reviewsApi,
  type MyReviewState,
} from '@/api/reviews-api';
import { safetyApi } from '@/api/safety-api';
import { ContentSafetyActions, SafetyTermsLink } from '@/components/safety';
import { AppText, Card, EmptyState, Screen, SeniorButton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';
import { useTheme } from '@/hooks/use-theme';
import {
  addBlockedUserId,
  getBlockedUserIds,
  replaceBlockedUserIds,
  useBlockedUserIds,
} from '@/safety/blocked-users-store';
import type { Event, Review } from '@/types';

const RATING_OPTIONS: { value: Review['rating']; label: string; description: string }[] = [
  { value: 1, label: '아쉬웠어요', description: '불편한 점이 많았어요' },
  { value: 2, label: '조금 아쉬워요', description: '보완되면 더 좋겠어요' },
  { value: 3, label: '괜찮았어요', description: '편안하게 참여했어요' },
  { value: 4, label: '좋았어요', description: '다음에도 참여하고 싶어요' },
  { value: 5, label: '꼭 추천해요', description: '주변에도 권하고 싶어요' },
];

interface ReviewAggregate {
  averageRating: number | null;
  count: number;
}

function roundedRating(value: number) {
  return Math.round(value * 100) / 100;
}

function aggregateAfterCreate(current: ReviewAggregate, rating: Review['rating']) {
  const count = current.count + 1;
  const total = (current.averageRating ?? 0) * current.count + rating;
  return { count, averageRating: roundedRating(total / count) };
}

function aggregateAfterUpdate(
  current: ReviewAggregate,
  previousRating: Review['rating'],
  nextRating: Review['rating'],
) {
  if (!current.count || current.averageRating === null) return current;
  return {
    ...current,
    averageRating: roundedRating(
      (current.averageRating * current.count - previousRating + nextRating) / current.count,
    ),
  };
}

function aggregateAfterDelete(current: ReviewAggregate, rating: Review['rating']) {
  if (current.count <= 1 || current.averageRating === null) {
    return { count: 0, averageRating: null };
  }
  const count = current.count - 1;
  return {
    count,
    averageRating: roundedRating((current.averageRating * current.count - rating) / count),
  };
}

function eligibilityDescription(eligibility: MyReviewState['eligibility'] | undefined) {
  if (!eligibility) return '후기 작성 자격을 확인하지 못했습니다.';
  if (eligibility.code === 'REVIEW_NOT_OPEN') {
    const opensAt = new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(eligibility.reviewsOpenAt));
    return `모임이 끝나는 ${opensAt} 이후에 후기를 작성할 수 있습니다.`;
  }
  if (eligibility.code === 'REVIEW_ALREADY_EXISTS') {
    return '이미 작성한 후기가 있습니다. 서버에서 내 후기 정보를 다시 확인해 주세요.';
  }
  return '서버에서 승인된 참여와 출석 완료가 모두 확인된 뒤 작성할 수 있습니다.';
}

export function ReviewScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { eventId: eventIdParam } = useLocalSearchParams<{ eventId?: string | string[] }>();
  const {
    events,
    session,
    largeTextEnabled,
    refreshEventParticipation,
  } = useAppState();
  const eventId = parseReviewEventIdParam(eventIdParam);
  const cachedEvent = events.find((candidate) => candidate.id === eventId);
  const sessionUserId = session?.userId;
  const blockedUserIds = useBlockedUserIds(sessionUserId);

  const requestVersion = useRef(0);
  const savingRef = useRef(false);
  const moreController = useRef<AbortController | null>(null);
  const safetyRefreshController = useRef<AbortController | null>(null);
  const activeRequestKey = useRef<string | undefined>(undefined);
  const [loadedEvent, setLoadedEvent] = useState<Event>();
  const [eligibility, setEligibility] = useState<MyReviewState['eligibility']>();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [aggregate, setAggregate] = useState<ReviewAggregate>({
    averageRating: null,
    count: 0,
  });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [ownReview, setOwnReview] = useState<Review>();
  const [rating, setRating] = useState<Review['rating']>();
  const [content, setContent] = useState('');
  const [loadRetry, setLoadRetry] = useState(0);
  const [initialLoading, setInitialLoading] = useState(Boolean(eventId && sessionUserId));
  const [loadError, setLoadError] = useState('');
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [mutation, setMutation] = useState<'save' | 'delete' | null>(null);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [deleted, setDeleted] = useState(false);
  const [safetyError, setSafetyError] = useState('');
  const [loadedRequestKey, setLoadedRequestKey] = useState<string>();

  const event = loadedEvent?.id === eventId ? loadedEvent : cachedEvent;
  const isEligibleToCreate = eligibility?.canCreate === true;
  const optionWidth = width < 390 ? '100%' : '48%';
  const currentRequestKey =
    eventId && sessionUserId
      ? `${sessionUserId}:${eventId}:${loadRetry}`
      : undefined;

  useEffect(() => {
    if (!eventId || !sessionUserId) {
      activeRequestKey.current = undefined;
      safetyRefreshController.current?.abort();
      safetyRefreshController.current = null;
      return;
    }

    const selectedEventId = eventId;
    const selectedRequestKey = `${sessionUserId}:${selectedEventId}:${loadRetry}`;
    activeRequestKey.current = selectedRequestKey;
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    const controller = new AbortController();
    moreController.current?.abort();

    const task = setTimeout(() => {
      setInitialLoading(true);
      setLoadError('');
      setMoreError('');
      setSuccessMessage('');
      setSafetyError('');
      setDeleted(false);
      setLoadedEvent(cachedEvent);
      setEligibility(undefined);
      setReviews([]);
      setAggregate({ averageRating: null, count: 0 });
      setNextCursor(null);
      setHasNextPage(false);
      setOwnReview(undefined);
      setRating(undefined);
      setContent('');

      void Promise.all([
        eventsApi.detail(selectedEventId, controller.signal),
        reviewsApi.mine(selectedEventId, controller.signal),
        reviewsApi.listForCurrentUser(selectedEventId, { signal: controller.signal }),
        safetyApi.blocks(controller.signal),
        refreshEventParticipation(selectedEventId, controller.signal).catch(() => undefined),
      ])
        .then(([nextEvent, myReviewState, page, blocks]) => {
          if (controller.signal.aborted || requestVersion.current !== version) return;
          const mine = myReviewState.review;
          const nextBlockedUserIds = new Set(
            blocks.map((block) => block.blockedUser.id),
          );
          setLoadedEvent(nextEvent);
          setLoadedRequestKey(selectedRequestKey);
          setEligibility(myReviewState.eligibility);
          replaceBlockedUserIds(sessionUserId, nextBlockedUserIds);
          setReviews(
            mine
              ? [
                  mine,
                  ...page.data.filter(
                    (review) =>
                      review.id !== mine.id &&
                      !nextBlockedUserIds.has(review.author.id),
                  ),
                ]
              : page.data.filter(
                  (review) => !nextBlockedUserIds.has(review.author.id),
                ),
          );
          setAggregate(page.aggregate);
          setNextCursor(page.page.nextCursor);
          setHasNextPage(page.page.hasNextPage);
          setOwnReview(mine ?? undefined);
          setDeleted(myReviewState.eligibility.code === 'REVIEW_DELETED');
          if (mine) {
            setRating(mine.rating);
            setContent(mine.content);
          }
        })
        .catch((error) => {
          if (controller.signal.aborted || requestVersion.current !== version) return;
          setLoadedRequestKey(selectedRequestKey);
          setLoadError(apiErrorMessage(error, '후기 작성 정보를 불러오지 못했습니다.'));
        })
        .finally(() => {
          if (!controller.signal.aborted && requestVersion.current === version) {
            setInitialLoading(false);
          }
        });
    }, 0);

    return () => {
      clearTimeout(task);
      controller.abort();
      moreController.current?.abort();
      safetyRefreshController.current?.abort();
      safetyRefreshController.current = null;
      if (activeRequestKey.current === selectedRequestKey) {
        activeRequestKey.current = undefined;
      }
      requestVersion.current += 1;
    };
  }, [cachedEvent, eventId, loadRetry, refreshEventParticipation, sessionUserId]);

  async function loadMoreReviews() {
    if (!eventId || !sessionUserId || !nextCursor || !hasNextPage || moreLoading) return;
    const cursor = nextCursor;
    const version = requestVersion.current;
    const controller = new AbortController();
    moreController.current?.abort();
    moreController.current = controller;
    setMoreLoading(true);
    setMoreError('');

    try {
      const page = await reviewsApi.listForCurrentUser(eventId, {
        cursor,
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestVersion.current !== version) return;
      const latestBlockedUserIds = getBlockedUserIds(sessionUserId);
      setReviews((current) =>
        mergeReviews(
          current,
          page.data.filter((review) => !latestBlockedUserIds.has(review.author.id)),
        ),
      );
      setAggregate(page.aggregate);
      setNextCursor(page.page.nextCursor);
      setHasNextPage(page.page.hasNextPage);
    } catch (error) {
      if (!controller.signal.aborted && requestVersion.current === version) {
        setMoreError(apiErrorMessage(error, '후기를 더 불러오지 못했습니다.'));
      }
    } finally {
      if (!controller.signal.aborted && requestVersion.current === version) {
        setMoreLoading(false);
      }
    }
  }

  async function handleReviewAuthorBlocked(
    blockedUserId: string,
    expectedRequestKey: string,
  ) {
    if (
      !eventId ||
      !sessionUserId ||
      activeRequestKey.current !== expectedRequestKey
    ) {
      return;
    }
    const selectedEventId = eventId;
    const version = requestVersion.current;
    const controller = new AbortController();
    safetyRefreshController.current?.abort();
    safetyRefreshController.current = controller;

    moreController.current?.abort();
    moreController.current = null;
    setMoreLoading(false);
    setMoreError('');
    setSafetyError('');
    addBlockedUserId(sessionUserId, blockedUserId);
    setReviews((current) =>
      current.filter((review) => review.author.id !== blockedUserId),
    );

    try {
      const [blocks, page] = await Promise.all([
        safetyApi.blocks(controller.signal),
        reviewsApi.listForCurrentUser(selectedEventId, { signal: controller.signal }),
      ]);
      if (
        controller.signal.aborted ||
        requestVersion.current !== version ||
        activeRequestKey.current !== expectedRequestKey
      ) {
        return;
      }
      const authoritativeBlockedUserIds = new Set(
        blocks.map((block) => block.blockedUser.id),
      );
      if (!authoritativeBlockedUserIds.has(blockedUserId)) {
        throw new Error('차단 상태가 서버 목록에 반영되지 않았습니다.');
      }
      replaceBlockedUserIds(sessionUserId, authoritativeBlockedUserIds);
      const visibleReviews = page.data.filter(
        (review) => !authoritativeBlockedUserIds.has(review.author.id),
      );
      setReviews(
        ownReview
          ? [
              ownReview,
              ...visibleReviews.filter((review) => review.id !== ownReview.id),
            ]
          : visibleReviews,
      );
      setAggregate(page.aggregate);
      setNextCursor(page.page.nextCursor);
      setHasNextPage(page.page.hasNextPage);
    } catch (error) {
      if (
        controller.signal.aborted ||
        requestVersion.current !== version ||
        activeRequestKey.current !== expectedRequestKey
      ) {
        return;
      }
      setSafetyError(
        apiErrorMessage(
          error,
          '사용자 차단은 완료됐지만 최신 후기 목록을 확인하지 못했습니다. 차단한 후기는 계속 숨깁니다.',
        ),
      );
    } finally {
      if (safetyRefreshController.current === controller) {
        safetyRefreshController.current = null;
      }
    }
  }

  async function saveReview() {
    if (savingRef.current || mutation) return;
    if (!event || !sessionUserId) {
      setFormError('로그인 후 모임 정보를 다시 확인해 주세요.');
      return;
    }
    if (!ownReview && !isEligibleToCreate) {
      setFormError('출석과 참여 승인이 확인된 모임만 후기를 작성할 수 있어요.');
      return;
    }
    if (!rating) {
      setFormError('모임이 어땠는지 1점부터 5점 중에서 선택해 주세요.');
      return;
    }
    const normalizedContent = content.trim();
    if (
      normalizedContent.length < REVIEW_CONTENT_MIN_LENGTH ||
      normalizedContent.length > REVIEW_CONTENT_MAX_LENGTH
    ) {
      setFormError(
        `후기 내용을 ${REVIEW_CONTENT_MIN_LENGTH}자 이상 ${REVIEW_CONTENT_MAX_LENGTH}자 이하로 적어 주세요.`,
      );
      return;
    }

    const previousReview = ownReview;
    const payload = { rating, content: normalizedContent };
    savingRef.current = true;
    setMutation('save');
    setFormError('');
    setSuccessMessage('');

    try {
      const saved = previousReview
        ? await reviewsApi.update(previousReview.id, payload)
        : await reviewsApi.create(event.id, payload);
      setOwnReview(saved);
      setEligibility((current) =>
        current
          ? { ...current, canCreate: false, code: 'REVIEW_ALREADY_EXISTS' }
          : current,
      );
      setRating(saved.rating);
      setContent(saved.content);
      setReviews((current) => [saved, ...current.filter((review) => review.id !== saved.id)]);
      setAggregate((current) =>
        previousReview
          ? aggregateAfterUpdate(current, previousReview.rating, saved.rating)
          : aggregateAfterCreate(current, saved.rating),
      );
      setSuccessMessage(previousReview ? '후기를 수정했습니다.' : '후기를 저장했습니다.');
    } catch (error) {
      const message = apiErrorMessage(error, '후기를 저장하지 못했습니다.');
      setFormError(
        isRetryableApiError(error)
          ? `${message} 입력 내용은 유지됩니다. 같은 내용으로 다시 시도해도 후기가 중복 생성되지 않습니다.`
          : message,
      );
    } finally {
      savingRef.current = false;
      setMutation(null);
    }
  }

  function confirmDelete() {
    if (!ownReview || mutation) return;
    const reviewToDelete = ownReview;
    Alert.alert(
      '후기를 삭제할까요?',
      '삭제한 후기는 복구하거나 같은 모임에 다시 작성할 수 없습니다.',
      [
        { text: '계속 보관', style: 'cancel' },
        {
          text: '후기 삭제',
          style: 'destructive',
          onPress: async () => {
            if (savingRef.current) return;
            savingRef.current = true;
            setMutation('delete');
            setFormError('');
            setSuccessMessage('');
            try {
              await reviewsApi.remove(reviewToDelete.id);
              setReviews((current) =>
                current.filter((review) => review.id !== reviewToDelete.id),
              );
              setAggregate((current) =>
                aggregateAfterDelete(current, reviewToDelete.rating),
              );
              setOwnReview(undefined);
              setEligibility((current) =>
                current ? { ...current, canCreate: false, code: 'REVIEW_DELETED' } : current,
              );
              setDeleted(true);
            } catch (error) {
              if (error instanceof ApiError && error.code === 'REVIEW_NOT_FOUND') {
                setOwnReview(undefined);
                setEligibility((current) =>
                  current ? { ...current, canCreate: false, code: 'REVIEW_DELETED' } : current,
                );
                setDeleted(true);
              } else {
                setFormError(apiErrorMessage(error, '후기를 삭제하지 못했습니다.'));
              }
            } finally {
              savingRef.current = false;
              setMutation(null);
            }
          },
        },
      ],
      { cancelable: true },
    );
  }

  if (!eventId) {
    return (
      <Screen contentContainerStyle={{ justifyContent: 'center', flexGrow: 1 }}>
        <EmptyState
          emoji="📝"
          title="작성할 수 있는 후기가 없어요"
          description="출석이 확인된 모임의 상세 화면이나 내 정보에서 다시 열어 주세요."
          actionLabel="내 정보로 돌아가기"
          onActionPress={() => router.replace('/me')}
        />
      </Screen>
    );
  }

  if (!sessionUserId) {
    return (
      <Screen contentContainerStyle={{ justifyContent: 'center', flexGrow: 1 }}>
        <EmptyState
          emoji="🔐"
          title="로그인이 필요해요"
          description="후기를 작성하거나 신고·차단 기능을 이용하려면 로그인해 주세요."
          actionLabel="로그인하기"
          onActionPress={() => router.replace('/login')}
        />
      </Screen>
    );
  }

  if (!currentRequestKey || initialLoading || loadedRequestKey !== currentRequestKey) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="후기 작성 정보를 불러오고 있습니다"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md }}>
        <ActivityIndicator size="large" color={theme.primary} />
        <AppText variant="bodyStrong">참여 내역과 후기를 확인하고 있어요</AppText>
      </View>
    );
  }

  if (loadError || !event) {
    return (
      <Screen contentContainerStyle={{ justifyContent: 'center', flexGrow: 1 }}>
        <EmptyState
          emoji="📡"
          title="후기 정보를 불러오지 못했어요"
          description={loadError || '모임 정보를 확인하지 못했습니다.'}
          actionLabel="다시 시도"
          onActionPress={() => setLoadRetry((current) => current + 1)}
        />
      </Screen>
    );
  }

  if (deleted) {
    return (
      <Screen contentContainerStyle={{ justifyContent: 'center', flexGrow: 1 }}>
        <EmptyState
          emoji="✓"
          title="후기를 삭제했어요"
          description="삭제한 후기는 복구하거나 같은 모임에 다시 작성할 수 없습니다."
          actionLabel="내 정보로 돌아가기"
          onActionPress={() => router.replace('/me')}
        />
      </Screen>
    );
  }

  if (!ownReview && !isEligibleToCreate) {
    return (
      <Screen contentContainerStyle={{ justifyContent: 'center', flexGrow: 1 }}>
        <EmptyState
          emoji="📝"
          title="아직 후기를 작성할 수 없어요"
          description={eligibilityDescription(eligibility)}
          actionLabel="내 정보로 돌아가기"
          onActionPress={() => router.replace('/me')}
        />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={process.env.EXPO_OS === 'ios' ? 12 : 0}
      style={{ flex: 1, backgroundColor: theme.background }}>
      <Screen
        contentContainerStyle={{ gap: Spacing.xxl }}
        scrollViewProps={{ keyboardDismissMode: 'interactive' }}>
        <View style={{ gap: Spacing.xs }}>
          <AppText variant="title">{ownReview ? '내 후기 수정' : '모임 후기'}</AppText>
          <AppText color="textSecondary">함께한 시간을 솔직하고 따뜻하게 들려주세요.</AppText>
        </View>

        <Card>
          <View style={{ gap: Spacing.sm }}>
            <AppText variant="sectionTitle">{event.title}</AppText>
            <AppText color="textSecondary">{event.location}</AppText>
            <AppText variant="caption" color="success">
              {ownReview ? '서버에 저장된 내 후기' : '승인된 참여 · 출석 완료 확인됨'}
            </AppText>
          </View>
        </Card>

        {successMessage ? (
          <View
            accessibilityRole="summary"
            accessibilityLiveRegion="polite"
            style={{
              padding: Spacing.lg,
              borderWidth: 1,
              borderColor: theme.success,
              borderRadius: Radius.lg,
              backgroundColor: theme.successSurface,
            }}>
            <AppText variant="bodyStrong" color="success">
              {successMessage}
            </AppText>
          </View>
        ) : null}

        <View style={{ gap: Spacing.md }}>
          <View style={{ gap: Spacing.xs }}>
            <AppText variant="sectionTitle">모임이 어떠셨나요?</AppText>
            <AppText color="textSecondary">1점부터 5점 중 가장 가까운 느낌을 선택하세요.</AppText>
          </View>
          <View
            accessibilityRole="radiogroup"
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md }}>
            {RATING_OPTIONS.map((option) => {
              const selected = rating === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option.value}점, ${option.label}, ${option.description}`}
                  accessibilityState={{ checked: selected, disabled: Boolean(mutation) }}
                  disabled={Boolean(mutation)}
                  onPress={() => {
                    setRating(option.value);
                    setFormError('');
                    setSuccessMessage('');
                  }}
                  style={({ pressed }) => ({
                    flexBasis: optionWidth,
                    flexGrow: 1,
                    minHeight: 76,
                    paddingHorizontal: Spacing.lg,
                    paddingVertical: Spacing.md,
                    gap: Spacing.xs,
                    justifyContent: 'center',
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? theme.primary : theme.border,
                    borderRadius: Radius.lg,
                    borderCurve: 'continuous',
                    opacity: mutation ? 0.65 : 1,
                    backgroundColor: selected
                      ? theme.backgroundSelected
                      : pressed
                        ? theme.backgroundElement
                        : theme.surface,
                  })}>
                  <AppText
                    variant="bodyStrong"
                    color={selected ? 'primary' : 'text'}
                    selectable={false}>
                    {option.value}점 · {option.label}
                  </AppText>
                  <AppText variant="caption" color="textSecondary" selectable={false}>
                    {option.description}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: Spacing.sm }}>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md }}>
            <AppText variant="sectionTitle">후기 내용</AppText>
            <AppText
              variant="caption"
              color="textMuted"
              style={{ fontVariant: ['tabular-nums'] }}>
              {content.length}/{REVIEW_CONTENT_MAX_LENGTH}
            </AppText>
          </View>
          <TextInput
            accessibilityLabel="후기 내용"
            accessibilityHint={`${REVIEW_CONTENT_MIN_LENGTH}자 이상 ${REVIEW_CONTENT_MAX_LENGTH}자 이하로 입력하세요`}
            allowFontScaling
            editable={!mutation}
            maxLength={REVIEW_CONTENT_MAX_LENGTH}
            multiline
            onChangeText={(value) => {
              setContent(value);
              setFormError('');
              setSuccessMessage('');
            }}
            placeholder="기억에 남은 점과 다음 참여자에게 전하고 싶은 이야기를 적어 주세요."
            placeholderTextColor={theme.textMuted}
            textAlignVertical="top"
            value={content}
            style={{
              minHeight: 168,
              padding: Spacing.lg,
              borderWidth: 2,
              borderColor: theme.border,
              borderRadius: Radius.lg,
              borderCurve: 'continuous',
              color: theme.text,
              backgroundColor: theme.surface,
              fontSize: largeTextEnabled ? 20 : 18,
              lineHeight: largeTextEnabled ? 31 : 28,
              opacity: mutation ? 0.65 : 1,
            }}
          />
        </View>

        <Card style={{ gap: Spacing.xs }}>
          <AppText variant="bodyStrong">사진 첨부 안내</AppText>
          <AppText color="textSecondary">
            현재 후기 API는 사진 업로드를 지원하지 않아 사진 선택 기능을 제공하지 않습니다.
          </AppText>
        </Card>

        <SafetyTermsLink onOpenError={setFormError} />

        {formError ? (
          <AppText
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            variant="bodyStrong"
            color="danger">
            {formError}
          </AppText>
        ) : null}

        <SeniorButton
          label={
            mutation === 'save'
              ? '후기 저장 중'
              : ownReview
                ? '후기 수정하기'
                : '후기 저장하기'
          }
          loading={mutation === 'save'}
          disabled={Boolean(mutation)}
          onPress={() => void saveReview()}
        />
        {ownReview ? (
          <SeniorButton
            label="후기 삭제"
            variant="outline"
            loading={mutation === 'delete'}
            disabled={Boolean(mutation)}
            onPress={confirmDelete}
            accessibilityHint="확인 창을 연 뒤 서버에 저장된 후기를 삭제합니다"
          />
        ) : null}

        <View style={{ gap: Spacing.md }}>
          <View style={{ gap: Spacing.xs }}>
            <AppText variant="sectionTitle">이 모임의 공개 후기</AppText>
            <AppText color="textSecondary">
              {aggregate.count > 0
                ? `평균 ${aggregate.averageRating ?? '-'}점 · 총 ${aggregate.count}개`
                : '아직 공개된 후기가 없습니다.'}
            </AppText>
            <AppText variant="caption" color="textMuted">
              차단한 사용자의 후기는 이 목록에서 숨겨집니다.
            </AppText>
          </View>
          {safetyError ? (
            <AppText
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              variant="bodyStrong"
              color="danger">
              {safetyError}
            </AppText>
          ) : null}
          {reviews
            .filter((review) => !blockedUserIds.has(review.author.id))
            .map((review) => (
            <Card key={review.id} style={{ gap: Spacing.sm }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: Spacing.md,
                }}>
                <AppText variant="bodyStrong">
                  {review.author.name}
                  {review.id === ownReview?.id ? ' · 내 후기' : ''}
                </AppText>
                <AppText variant="caption" color="primary">
                  {review.rating}점
                </AppText>
              </View>
              <AppText>{review.content}</AppText>
              <ContentSafetyActions
                targetType="REVIEW"
                targetId={review.id}
                targetLabel="후기"
                authorUserId={review.author.id}
                authorName={review.author.name}
                currentUserId={sessionUserId}
                onBlocked={(blockedUserId) =>
                  handleReviewAuthorBlocked(blockedUserId, currentRequestKey)
                }
              />
            </Card>
            ))}
          {moreError ? (
            <View style={{ gap: Spacing.sm }}>
              <AppText variant="bodyStrong" color="danger" accessibilityLiveRegion="polite">
                {moreError}
              </AppText>
              <SeniorButton
                label="후기 더 보기 다시 시도"
                variant="outline"
                onPress={() => void loadMoreReviews()}
              />
            </View>
          ) : hasNextPage ? (
            <SeniorButton
              label="공개 후기 더 보기"
              variant="outline"
              loading={moreLoading}
              disabled={moreLoading}
              onPress={() => void loadMoreReviews()}
            />
          ) : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
