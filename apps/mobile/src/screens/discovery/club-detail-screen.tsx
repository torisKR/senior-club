import { Image } from 'expo-image';
import { Stack, type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View, useWindowDimensions } from 'react-native';

import { isApiError } from '@/api/api-error';
import { clubsApi, isSafeClubSlug, type PublicClub } from '@/api/clubs-api';
import { apiErrorMessage } from '@/api/error-message';
import { AppText, Card, EmptyState, Screen, SectionHeader } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { getClubImageSource } from '@/data/image-assets';
import { useAppState } from '@/hooks/use-app-state';
import { useTheme } from '@/hooks/use-theme';

import { formatEventDate } from './discovery-utils';

export interface ClubDetailScreenProps {
  slug?: string;
}

type DetailStatus = 'loading' | 'ready' | 'not-found' | 'error';

export function ClubDetailScreen({ slug }: ClubDetailScreenProps) {
  const router = useRouter();
  const theme = useTheme();
  const { selectedInterestIds } = useAppState();
  const { width } = useWindowDimensions();
  const isTablet = width >= 760;
  const [club, setClub] = useState<PublicClub | null>(null);
  const [status, setStatus] = useState<DetailStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [resultSlug, setResultSlug] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const safeSlug = isSafeClubSlug(slug) ? slug : null;

  const settleClub = useCallback(async ({
    targetSlug,
    controller,
    sequence,
  }: {
    targetSlug: string;
    controller: AbortController;
    sequence: number;
  }) => {
    try {
      const response = await clubsApi.detail(targetSlug, controller.signal);
      if (controller.signal.aborted || requestSequence.current !== sequence) return;
      setClub(response);
      setStatus('ready');
      setError(null);
      setResultSlug(targetSlug);
    } catch (requestError) {
      if (controller.signal.aborted || requestSequence.current !== sequence) return;
      setClub(null);
      if (isApiError(requestError) && requestError.status === 404) {
        setStatus('not-found');
        setError(null);
      } else {
        setError(apiErrorMessage(requestError, '커뮤니티 정보를 불러오지 못했습니다.'));
        setStatus('error');
      }
      setResultSlug(targetSlug);
    }
  }, []);

  useEffect(() => {
    if (!safeSlug) return;

    const sequence = ++requestSequence.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    void settleClub({ targetSlug: safeSlug, controller, sequence });

    return () => {
      controller.abort();
    };
  }, [safeSlug, settleClub]);

  const retryClub = useCallback(() => {
    if (!safeSlug) return;

    const sequence = ++requestSequence.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setClub(null);
    setStatus('loading');
    setError(null);
    setResultSlug(safeSlug);
    void settleClub({ targetSlug: safeSlug, controller, sequence });
  }, [safeSlug, settleClub]);

  const hasCurrentResult = safeSlug !== null && resultSlug === safeSlug;
  const visibleStatus: DetailStatus = safeSlug === null
    ? 'not-found'
    : hasCurrentResult
      ? status
      : 'loading';
  const visibleError = hasCurrentResult ? error : null;

  if (visibleStatus === 'loading') {
    return (
      <>
        <Stack.Screen options={{ title: '커뮤니티', headerBackTitle: '뒤로' }} />
        <Screen contentContainerStyle={{ justifyContent: 'center', flexGrow: 1 }}>
          <View
            style={{ alignItems: 'center', justifyContent: 'center', gap: Spacing.md }}
            accessibilityRole="progressbar"
            accessibilityLabel="커뮤니티 정보를 불러오는 중"
          >
            <ActivityIndicator color={theme.primary} size="large" />
            <AppText variant="bodyStrong">커뮤니티를 불러오고 있어요</AppText>
          </View>
        </Screen>
      </>
    );
  }

  if (visibleStatus === 'not-found') {
    return (
      <>
        <Stack.Screen options={{ title: '커뮤니티', headerBackTitle: '뒤로' }} />
        <Screen contentContainerStyle={{ justifyContent: 'center', flexGrow: 1 }}>
          <EmptyState
            emoji="🔎"
            title="커뮤니티를 찾지 못했어요"
            description="삭제되었거나 공개되지 않은 커뮤니티일 수 있어요."
            actionLabel="커뮤니티 목록으로"
            onActionPress={() => router.replace('/clubs')}
          />
        </Screen>
      </>
    );
  }

  if (visibleStatus === 'error' || !club) {
    return (
      <>
        <Stack.Screen options={{ title: '커뮤니티', headerBackTitle: '뒤로' }} />
        <Screen contentContainerStyle={{ justifyContent: 'center', flexGrow: 1 }}>
          <EmptyState
            emoji="📡"
            title="커뮤니티를 불러오지 못했어요"
            description={visibleError ?? '잠시 뒤 다시 시도해 주세요.'}
            actionLabel="다시 시도"
            onActionPress={retryClub}
          />
        </Screen>
      </>
    );
  }

  const region = club.region ?? '지역 미정';
  const isRecommended = selectedInterestIds.includes(club.interest.slug);
  const nextEvent = club.nextEvent;

  return (
    <>
      <Stack.Screen options={{ title: club.title, headerBackTitle: '커뮤니티' }} />
      <Screen contentContainerStyle={{ maxWidth: 980 }}>
        <Card padded={false}>
          <Image
            source={getClubImageSource(club)}
            accessibilityLabel="커뮤니티 안내 이미지"
            cachePolicy="memory-disk"
            contentFit="cover"
            recyclingKey={club.id}
            transition={180}
            style={{
              width: '100%',
              aspectRatio: isTablet ? 2.4 : 4 / 3,
              backgroundColor: theme.backgroundElement,
            }}
          />

          <View style={{ padding: Spacing.xxl, gap: Spacing.lg }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
              <View
                style={{
                  paddingHorizontal: Spacing.md,
                  paddingVertical: Spacing.xs,
                  borderRadius: Radius.pill,
                  backgroundColor: theme.infoSurface,
                }}>
                <AppText variant="caption" color="info" selectable={false}>
                  {club.interest.emoji} {club.interest.name}
                </AppText>
              </View>
              {isRecommended ? (
                <View
                  style={{
                    paddingHorizontal: Spacing.md,
                    paddingVertical: Spacing.xs,
                    borderRadius: Radius.pill,
                    backgroundColor: theme.successSurface,
                  }}>
                  <AppText variant="caption" color="success" selectable={false}>
                    내 관심사와 잘 맞아요
                  </AppText>
                </View>
              ) : null}
            </View>

            <View style={{ gap: Spacing.sm }}>
              <AppText variant="display">{club.title}</AppText>
              <AppText variant="body" color="textSecondary">
                {club.description}
              </AppText>
            </View>

            <View style={{ gap: Spacing.sm }}>
              <AppText variant="bodyStrong">
                활성 회원 {club.memberCount.toLocaleString('ko-KR')}명
              </AppText>
              <AppText variant="body">📍 {region}</AppText>
              <AppText variant="body">리더 {club.leaderName}</AppText>
              <AppText variant="caption" color="textSecondary">
                예정 모임 {club.upcomingEventCount.toLocaleString('ko-KR')}개 · 지난 모임{' '}
                {club.pastEventCount.toLocaleString('ko-KR')}개
              </AppText>
            </View>
          </View>
        </Card>

        <View style={{ gap: Spacing.lg }}>
          <SectionHeader
            title="다음 모임"
            description={
              nextEvent
                ? '현재 공개된 가장 가까운 일정입니다.'
                : '새로운 다음 일정을 준비하고 있어요.'
            }
          />
          {nextEvent ? (
            <Card
              onPress={() =>
                router.push({ pathname: '/event/[id]', params: { id: nextEvent.id } })
              }
              accessibilityLabel={`${nextEvent.title}, 모임 자세히 보기`}
              style={{ gap: Spacing.sm }}
            >
              <AppText variant="caption" color="primary">
                {nextEvent.status === 'CLOSED' ? '신청 마감' : '일정 공개'}
              </AppText>
              <AppText variant="sectionTitle">{nextEvent.title}</AppText>
              <AppText variant="body" color="textSecondary">
                {formatEventDate(nextEvent.startAt)}
              </AppText>
              <AppText variant="body" color="textSecondary">
                📍 {nextEvent.locationName}
              </AppText>
            </Card>
          ) : (
            <EmptyState
              emoji="🗓️"
              title="다음 모임을 준비 중이에요"
              description="새로운 일정이 공개되면 모임 목록에서 확인할 수 있어요."
            />
          )}
        </View>

        <View style={{ gap: Spacing.lg }}>
          <SectionHeader
            title="게시판"
            description="공개된 질문과 경험을 읽고 회원들과 이야기를 나눠보세요."
          />
          <Card
            onPress={() =>
              router.push(`/club/${club.slug}/posts` as Href)
            }
            accessibilityLabel={`${club.title} 공개 게시판 보기`}
            style={{ gap: Spacing.sm }}
          >
            <AppText variant="sectionTitle">📝 공개 게시판</AppText>
            <AppText variant="body" color="textSecondary">
              실제 공개된 게시글과 댓글을 확인하고 새 이야기를 남길 수 있어요.
            </AppText>
            <AppText variant="bodyStrong" color="primary">
              게시판 보기
            </AppText>
          </Card>
        </View>
      </Screen>
    </>
  );
}
