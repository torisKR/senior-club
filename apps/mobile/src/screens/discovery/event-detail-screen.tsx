import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, View, useWindowDimensions } from 'react-native';

import { apiErrorMessage } from '@/api/error-message';
import { eventsApi } from '@/api/events-api';
import { ApiError } from '@/api/api-error';
import { persistPendingAuthNavigation } from '@/auth/pending-auth-navigation';
import { AppText, Card, EmptyState, Screen, SeniorButton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { getEventImageSource } from '@/data/image-assets';
import { useAppState } from '@/hooks/use-app-state';
import { useTheme } from '@/hooks/use-theme';
import type { Event, ParticipationStatus } from '@/types';
import {
  buildLoginHref,
  buildOnboardingHref,
  type AuthIntent,
} from '@/utils/auth-routing';

import {
  difficultyLabels,
  formatEventTimeRange,
  formatPrice,
  isEventOpen,
  participationDescriptions,
  participationLabels,
  remainingSeats,
} from './discovery-utils';

export interface EventDetailScreenProps {
  eventId?: string;
  intent?: AuthIntent;
}

interface DetailRowProps {
  emoji: string;
  label: string;
  value: string;
  emphasis?: boolean;
}

function DetailRow({ emoji, label, value, emphasis = false }: DetailRowProps) {
  return (
    <View
      accessibilityLabel={`${label}, ${value}`}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md }}>
      <AppText variant="key" accessibilityLabel="" selectable={false}>
        {emoji}
      </AppText>
      <View style={{ flex: 1, minWidth: 0, gap: Spacing.xs }}>
        <AppText variant="caption" color="textSecondary">
          {label}
        </AppText>
        <AppText variant={emphasis ? 'key' : 'bodyStrong'}>{value}</AppText>
      </View>
    </View>
  );
}

function ParticipationBanner({ status }: { status: ParticipationStatus }) {
  const theme = useTheme();
  const isPending = status === 'pending';

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`${participationLabels[status]}. ${participationDescriptions[status]}`}
      style={{
        padding: Spacing.xl,
        gap: Spacing.sm,
        borderWidth: 2,
        borderColor: isPending ? theme.warning : theme.success,
        borderRadius: Radius.lg,
        borderCurve: 'continuous',
        backgroundColor: isPending ? theme.warningSurface : theme.successSurface,
      }}>
      <AppText variant="sectionTitle" color={isPending ? 'warning' : 'success'}>
        {isPending ? '⏳ ' : '✓ '}
        {participationLabels[status]}
      </AppText>
      <AppText variant="body" color="text">
        {participationDescriptions[status]}
      </AppText>
    </View>
  );
}

export function EventDetailScreen({ eventId, intent }: EventDetailScreenProps) {
  const router = useRouter();
  const theme = useTheme();
  const {
    events,
    participations,
    applyEvent,
    cancelEvent,
    onboardingCompleted,
    refreshEventParticipation,
    session,
  } = useAppState();
  const { width } = useWindowDimensions();
  const [event, setEvent] = useState<Event | undefined>(() =>
    events.find((candidate) => candidate.id === eventId),
  );
  const [detailLoading, setDetailLoading] = useState(Boolean(eventId && !event));
  const [detailError, setDetailError] = useState('');
  const [detailRetry, setDetailRetry] = useState(0);
  const [participationLoading, setParticipationLoading] = useState(false);
  const [mutationLoading, setMutationLoading] = useState<'apply' | 'cancel' | null>(null);
  const [mutationError, setMutationError] = useState('');
  const [justApplied, setJustApplied] = useState(false);
  const [justCancelled, setJustCancelled] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const isTablet = width >= 760;
  const sessionId = session?.sessionId;
  const isParticipationLoading = Boolean(sessionId) && participationLoading;

  useEffect(() => {
    const eventStartTime = Date.parse(event?.startsAt ?? '');
    if (!Number.isFinite(eventStartTime) || eventStartTime <= currentTime) return;

    const timer = setTimeout(
      () => setCurrentTime(Date.now()),
      Math.min(eventStartTime - currentTime + 50, 60_000),
    );
    return () => clearTimeout(timer);
  }, [currentTime, event?.startsAt]);

  useEffect(() => {
    if (!eventId) {
      return;
    }

    const selectedEventId = eventId;
    const controller = new AbortController();
    async function loadDetail() {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      const cachedEvent = events.find((candidate) => candidate.id === selectedEventId);
      if (cachedEvent) setEvent(cachedEvent);
      setDetailLoading(!cachedEvent);
      setDetailError('');
      try {
        setEvent(await eventsApi.detail(selectedEventId, controller.signal));
      } catch (error) {
        if (!controller.signal.aborted) {
          setDetailError(apiErrorMessage(error, '모임 정보를 불러오지 못했습니다.'));
        }
      } finally {
        if (!controller.signal.aborted) setDetailLoading(false);
      }
    }
    void loadDetail();
    return () => controller.abort();
  }, [detailRetry, eventId, events]);

  useEffect(() => {
    if (!eventId || !sessionId) {
      return;
    }
    const selectedEventId = eventId;
    const controller = new AbortController();
    async function loadParticipation() {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setParticipationLoading(true);
      setMutationError('');
      try {
        await refreshEventParticipation(selectedEventId, controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) {
          setMutationError(apiErrorMessage(error, '신청 상태를 확인하지 못했습니다.'));
        }
      } finally {
        if (!controller.signal.aborted) setParticipationLoading(false);
      }
    }
    void loadParticipation();
    return () => controller.abort();
  }, [eventId, refreshEventParticipation, sessionId]);

  if (!event && detailLoading) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="모임 정보를 불러오고 있습니다"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md }}>
        <ActivityIndicator size="large" color={theme.primary} />
        <AppText variant="bodyStrong">모임 정보를 불러오고 있어요</AppText>
      </View>
    );
  }

  if (!event) {
    return (
      <>
        <Stack.Screen options={{ title: '모임', headerBackTitle: '뒤로' }} />
        <Screen contentContainerStyle={{ justifyContent: 'center', flexGrow: 1 }}>
          <EmptyState
            emoji="🔎"
            title="모임을 찾지 못했어요"
            description={detailError || '목록으로 돌아가 다른 모임을 살펴보세요.'}
            actionLabel={detailError ? '다시 시도' : '모임 목록으로'}
            onActionPress={() =>
              detailError ? setDetailRetry((current) => current + 1) : router.replace('/events')
            }
          />
        </Screen>
      </>
    );
  }

  const participationStatus = session
    ? participations.find((participation) => participation.eventId === event.id)?.status
    : undefined;
  const seatsLeft = remainingSeats(event);
  const canApply = isEventOpen(event) && !participationStatus;
  const eventStartTime = Date.parse(event.startsAt);
  const canCancelParticipation =
    (participationStatus === 'pending' || participationStatus === 'approved') &&
    (event.lifecycle === 'upcoming' || event.lifecycle === 'full') &&
    Number.isFinite(eventStartTime) &&
    eventStartTime > currentTime;

  const handleApply = async () => {
    if (mutationLoading) return;
    if (!session) {
      await persistPendingAuthNavigation({
        returnTo: `/event/${event.id}`,
        intent: 'apply',
      }).catch(() => undefined);
      router.push(buildLoginHref(`/event/${event.id}`, 'apply'));
      return;
    }
    if (!onboardingCompleted) {
      await persistPendingAuthNavigation({
        returnTo: `/event/${event.id}`,
        intent: 'apply',
      }).catch(() => undefined);
      router.push(buildOnboardingHref(`/event/${event.id}`, 'apply'));
      return;
    }

    setMutationLoading('apply');
    setMutationError('');
    try {
      const status = await applyEvent(event.id);
      setJustCancelled(false);
      setJustApplied(status === 'pending');
      if (status === 'approved') {
        setEvent((current) =>
          current
            ? { ...current, participantCount: Math.min(current.capacity, current.participantCount + 1) }
            : current,
        );
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await persistPendingAuthNavigation({
          returnTo: `/event/${event.id}`,
          intent: 'apply',
        }).catch(() => undefined);
        router.push(buildLoginHref(`/event/${event.id}`, 'apply'));
        return;
      }
      if (
        error instanceof ApiError &&
        error.code === 'PROFILE_ONBOARDING_REQUIRED'
      ) {
        await persistPendingAuthNavigation({
          returnTo: `/event/${event.id}`,
          intent: 'apply',
        }).catch(() => undefined);
        router.push(buildOnboardingHref(`/event/${event.id}`, 'apply'));
        return;
      }
      setMutationError(apiErrorMessage(error, '모임 신청을 완료하지 못했습니다.'));
    } finally {
      setMutationLoading(null);
    }
  };

  const handleCancel = () => {
    if (isParticipationLoading || mutationLoading || !canCancelParticipation) return;
    const cancellingApprovedParticipation = participationStatus === 'approved';
    Alert.alert(
      cancellingApprovedParticipation
        ? '확정된 모임 참여를 취소할까요?'
        : '모임 신청을 취소할까요?',
      cancellingApprovedParticipation
        ? '참여 확정이 취소되고 모임 채팅을 이용할 수 없게 됩니다. 다시 참여하려면 새로 신청해야 해요.'
        : '승인 대기 중인 신청이 취소됩니다. 다시 참여하려면 새로 신청해야 해요.',
      [
        {
          text: cancellingApprovedParticipation ? '계속 참여' : '계속 기다리기',
          style: 'cancel',
        },
        {
          text: cancellingApprovedParticipation ? '참여 취소' : '신청 취소',
          style: 'destructive',
          onPress: async () => {
            if (mutationLoading) return;
            setMutationLoading('cancel');
            setMutationError('');
            try {
              await cancelEvent(event.id);
              setJustApplied(false);
              setJustCancelled(true);
              if (cancellingApprovedParticipation) {
                setEvent((current) =>
                      current
                    ? {
                        ...current,
                        participantCount: Math.max(0, current.participantCount - 1),
                        lifecycle:
                          current.lifecycle === 'full' ? 'upcoming' : current.lifecycle,
                      }
                    : current,
                );
              }
            } catch (error) {
              setMutationError(
                apiErrorMessage(
                  error,
                  cancellingApprovedParticipation
                    ? '모임 참여를 취소하지 못했습니다.'
                    : '신청을 취소하지 못했습니다.',
                ),
              );
            } finally {
              setMutationLoading(null);
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  const openMap = async () => {
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}`;
    try {
      const supported = await Linking.canOpenURL(mapUrl);
      if (supported) {
        await Linking.openURL(mapUrl);
        return;
      }
    } catch {
      // The same accessible fallback is shown for unavailable or failed map apps.
    }
    Alert.alert('지도를 열 수 없어요', '주소를 길게 눌러 복사한 뒤 지도 앱에서 검색해 주세요.');
  };

  return (
    <>
      <Stack.Screen options={{ title: event.title, headerBackTitle: '모임' }} />
      <Screen contentContainerStyle={{ maxWidth: 980 }}>
        <Card padded={false}>
          <Image
            source={getEventImageSource(event)}
            accessibilityLabel={`${event.title} 모임 사진`}
            cachePolicy="memory-disk"
            contentFit="cover"
            recyclingKey={event.id}
            transition={180}
            style={{ width: '100%', aspectRatio: isTablet ? 2.4 : 4 / 3, backgroundColor: theme.backgroundElement }}
          />

          <View style={{ padding: Spacing.xxl, gap: Spacing.lg }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
              <View
                style={{
                  paddingHorizontal: Spacing.md,
                  paddingVertical: Spacing.xs,
                  borderRadius: Radius.pill,
                  backgroundColor: theme.backgroundSelected,
                }}>
                <AppText variant="caption" color="primary" selectable={false}>
                  {event.clubTitle}
                </AppText>
              </View>
              <View
                style={{
                  paddingHorizontal: Spacing.md,
                  paddingVertical: Spacing.xs,
                  borderRadius: Radius.pill,
                  backgroundColor: theme.infoSurface,
                }}>
                <AppText variant="caption" color="info" selectable={false}>
                  난이도 {difficultyLabels[event.difficulty]}
                </AppText>
              </View>
            </View>

            <View style={{ gap: Spacing.sm }}>
              <AppText variant="display">{event.title}</AppText>
              <AppText variant="key" color="textSecondary">
                {event.summary}
              </AppText>
              <AppText variant="body">{event.description}</AppText>
            </View>
          </View>
        </Card>

        {detailError ? (
          <View
            style={{
              padding: Spacing.lg,
              borderWidth: 1,
              borderColor: theme.warning,
              borderRadius: Radius.lg,
              backgroundColor: theme.warningSurface,
              gap: Spacing.sm,
            }}>
            <AppText variant="bodyStrong" color="warning" accessibilityLiveRegion="polite">
              최신 모임 정보를 확인하지 못했어요. {detailError}
            </AppText>
            <SeniorButton
              label="모임 정보 다시 불러오기"
              variant="outline"
              onPress={() => setDetailRetry((current) => current + 1)}
            />
          </View>
        ) : null}

        {participationStatus ? <ParticipationBanner status={participationStatus} /> : null}
        {justCancelled && !participationStatus ? (
          <View
            accessibilityRole="summary"
            style={{
              padding: Spacing.xl,
              gap: Spacing.sm,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: Radius.lg,
              backgroundColor: theme.backgroundElement,
            }}>
            <AppText variant="sectionTitle">모임 참여가 취소되었어요</AppText>
            <AppText variant="body" color="textSecondary">
              참여를 원하면 아래에서 다시 신청할 수 있어요.
            </AppText>
          </View>
        ) : null}
        {justApplied && participationStatus === 'pending' ? (
          <AppText variant="caption" color="warning" accessibilityLiveRegion="polite">
            신청 접수가 저장되었습니다. 리더의 승인 알림을 기다려 주세요.
          </AppText>
        ) : null}
        {isParticipationLoading ? (
          <AppText variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
            서버에서 내 신청 상태를 확인하고 있어요.
          </AppText>
        ) : null}
        {mutationError ? (
          <View
            style={{
              padding: Spacing.lg,
              borderWidth: 1,
              borderColor: theme.danger,
              borderRadius: Radius.lg,
              backgroundColor: theme.dangerSurface,
            }}>
            <AppText variant="bodyStrong" color="danger" accessibilityLiveRegion="assertive">
              {mutationError}
            </AppText>
          </View>
        ) : null}
        {intent === 'apply' && session && !participationStatus ? (
          <View
            accessibilityRole="summary"
            style={{
              padding: Spacing.lg,
              borderWidth: 1,
              borderColor: theme.info,
              borderRadius: Radius.lg,
              backgroundColor: theme.infoSurface,
            }}>
            <AppText variant="bodyStrong" color="info" accessibilityLiveRegion="polite">
              로그인되었습니다. 아래 ‘모임 신청하기’를 눌러 신청을 마쳐 주세요.
            </AppText>
          </View>
        ) : null}

        <View style={{ flexDirection: isTablet ? 'row' : 'column', gap: Spacing.xl, alignItems: 'flex-start' }}>
          <View style={{ flex: isTablet ? 1.45 : undefined, width: isTablet ? undefined : '100%', gap: Spacing.xl }}>
            <Card style={{ gap: Spacing.xl }}>
              <AppText variant="sectionTitle">모임 정보</AppText>
              <DetailRow emoji="📅" label="일시" value={formatEventTimeRange(event.startsAt, event.endsAt)} />
              <View style={{ height: 1, backgroundColor: theme.divider }} />
              <DetailRow emoji="📍" label="장소" value={`${event.location}\n${event.address}`} />
              <SeniorButton
                label="지도에서 보기"
                variant="outline"
                onPress={openMap}
                accessibilityHint="구글 지도에서 모임 주소를 엽니다"
              />
              <View style={{ height: 1, backgroundColor: theme.divider }} />
              <DetailRow emoji="👟" label="난이도" value={difficultyLabels[event.difficulty]} />
            </Card>

            <Card style={{ gap: Spacing.lg }}>
              <AppText variant="sectionTitle">준비물</AppText>
              {event.preparation.length ? (
                <View style={{ gap: Spacing.md }}>
                  {event.preparation.map((item) => (
                    <View key={item} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm }}>
                      <AppText variant="bodyStrong" color="primary" accessibilityLabel="" selectable={false}>
                        ✓
                      </AppText>
                      <AppText variant="body" style={{ flex: 1 }}>
                        {item}
                      </AppText>
                    </View>
                  ))}
                </View>
              ) : (
                <AppText variant="body" color="textSecondary">
                  따로 준비할 물품이 없어요.
                </AppText>
              )}
            </Card>

            <Card style={{ gap: Spacing.lg }}>
              <AppText variant="sectionTitle">접근성 안내</AppText>
              <View style={{ gap: Spacing.md }}>
                <AppText variant="body">• 활동은 서로의 속도를 확인하며 진행합니다.</AppText>
                <AppText variant="body">• 중간 휴식이나 이동 도움이 필요하면 신청 후 리더에게 알려 주세요.</AppText>
                <AppText variant="body">
                  • 출입구 단차, 엘리베이터, 화장실 이용 정보는 장소에 따라 달라질 수 있어요. 신청 전에 리더에게 확인해 주세요.
                </AppText>
              </View>
            </Card>
          </View>

          <View style={{ flex: 1, width: isTablet ? undefined : '100%', gap: Spacing.xl }}>
            <Card style={{ gap: Spacing.xl }}>
              <AppText variant="sectionTitle">신청 정보</AppText>
              <DetailRow emoji="💳" label="참가비" value={formatPrice(event.price)} emphasis />
              <AppText variant="caption" color="textSecondary">
                {event.price === 0
                  ? '참가비가 없는 모임입니다. Google Play 결제가 필요하지 않아요.'
                  : '참가비는 현장에서 리더 안내에 따라 냅니다. 앱 안 Google Play 결제가 아닙니다.'}
              </AppText>
              <View style={{ height: 1, backgroundColor: theme.divider }} />
              <DetailRow
                emoji="👥"
                label="정원"
                value={`${event.participantCount}명 참여 · ${seatsLeft}자리 남음 (총 ${event.capacity}명)`}
                emphasis
              />

              {!participationStatus && event.lifecycle === 'completed' ? (
                <AppText variant="bodyStrong" color="textSecondary">
                  종료된 모임입니다.
                </AppText>
              ) : null}
              {!participationStatus && event.lifecycle === 'cancelled' ? (
                <AppText variant="bodyStrong" color="danger">
                  취소된 모임입니다.
                </AppText>
              ) : null}
              {!participationStatus && event.lifecycle === 'full' ? (
                <AppText variant="bodyStrong" color="accent">
                  정원이 모두 찼어요.
                </AppText>
              ) : null}

              {canApply ? (
                <SeniorButton
                  label={
                    !session
                      ? '로그인하고 모임 신청하기'
                      : onboardingCompleted
                        ? '모임 신청하기'
                        : '프로필 설정 후 모임 신청하기'
                  }
                  variant="accent"
                  loading={mutationLoading === 'apply'}
                  disabled={isParticipationLoading || Boolean(mutationLoading)}
                  onPress={handleApply}
                  accessibilityHint={
                    !session
                      ? '로그인한 뒤 이 모임으로 돌아와 신청을 이어갑니다'
                      : onboardingCompleted
                        ? '신청 접수 후 리더 승인을 기다리는 상태가 됩니다'
                        : '프로필 설정을 완료한 뒤 이 모임으로 돌아와 신청을 이어갑니다'
                  }
                />
              ) : null}
              {participationStatus === 'approved' ||
              participationStatus === 'attended' ||
              participationStatus === 'reviewed' ? (
                <SeniorButton
                  label="모임 채팅 열기"
                  variant="secondary"
                  onPress={() =>
                    router.push({
                      pathname: '/chat',
                      params: { eventId: event.id, roomId: '' },
                    })
                  }
                  accessibilityHint="승인된 참여자 대화방으로 이동합니다"
                />
              ) : null}
              {canCancelParticipation ? (
                <SeniorButton
                  label={participationStatus === 'approved' ? '참여 취소' : '신청 취소'}
                  variant="outline"
                  loading={mutationLoading === 'cancel'}
                  disabled={isParticipationLoading || Boolean(mutationLoading)}
                  onPress={handleCancel}
                  accessibilityHint={
                    participationStatus === 'approved'
                      ? '확인 창을 연 뒤 확정된 모임 참여를 취소합니다'
                      : '확인 창을 연 뒤 승인 대기 중인 신청을 취소합니다'
                  }
                />
              ) : null}
              {participationStatus === 'attended' ? (
                <SeniorButton
                  label="후기 확인 또는 작성하기"
                  variant="accent"
                  onPress={() =>
                    router.push({ pathname: '/reviews/new', params: { eventId: event.id } })
                  }
                />
              ) : null}
              {participationStatus === 'reviewed' ? (
                <SeniorButton label="후기 작성 완료" variant="secondary" disabled />
              ) : null}

              {canApply ? (
                <AppText variant="caption" color="textSecondary">
                  {session
                    ? onboardingCompleted
                      ? '신청 직후에는 승인 대기 상태입니다. 리더가 승인하면 알림으로 알려드려요.'
                      : '모임 신청 전 프로필 설정이 필요합니다. 완료 후 같은 모임으로 안전하게 돌아옵니다.'
                    : '모임 신청에는 로그인이 필요합니다. 로그인 후 같은 모임으로 안전하게 돌아옵니다.'}
                </AppText>
              ) : null}
            </Card>

            <Card style={{ gap: Spacing.lg }}>
              <AppText variant="sectionTitle">모임 리더</AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                <View
                  accessibilityElementsHidden
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: Radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.backgroundSelected,
                  }}>
                  <AppText variant="key" selectable={false}>
                    {event.leader.name.slice(0, 1)}
                  </AppText>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: Spacing.xs }}>
                  <AppText variant="key">{event.leader.name} 리더</AppText>
                  <AppText variant="body" color="textSecondary">
                    {event.leader.introduction}
                  </AppText>
                </View>
              </View>
            </Card>
          </View>
        </View>
      </Screen>
    </>
  );
}
