import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Switch, View, useWindowDimensions } from 'react-native';

import { HomeBannerAd } from '@/ads/HomeBannerAd';
import { notificationsApi } from '@/api/notifications-api';
import {
  AppText,
  Card,
  InterestChip,
  Screen,
  SectionHeader,
  SeniorButton,
} from '@/components/ui';
import { Layout, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { CoverImage, CoverImageRatios } from '@/components/ui/cover-image';
import { AppIcon } from '@/components/ui/app-icon';
import { selectCoverImage } from '@/data/image-assets';
import { useAppState } from '@/hooks/use-app-state';
import { useTheme } from '@/hooks/use-theme';

import { HomeEventCard } from './home-event-card';
import { SeniorHobbyCourseSection } from './senior-hobby-course-section';

const purposeJourney = [
  { number: '1', title: '목적', description: '좋아하는 일과 배우고 싶은 것을 고릅니다.', icon: 'explore' },
  { number: '2', title: '사람', description: '같은 관심사와 가까운 지역의 사람을 만납니다.', icon: 'groups' },
  { number: '3', title: '활동', description: '안전하게 준비된 모임에 함께 참여합니다.', icon: 'activity' },
  { number: '4', title: '관계', description: '대화와 다음 약속으로 인연을 이어갑니다.', icon: 'handshake' },
] as const;

function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatToday(value: Date) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(value);
}

function formatShortSchedule(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const {
    user,
    upcomingEvents,
    eventFeeds,
    interests: availableInterests,
    selectedInterestIds,
    participations,
    session,
    largeTextEnabled,
    toggleLargeText,
    getParticipationStatus,
  } = useAppState();

  const [unreadCount, setUnreadCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      const task = setTimeout(() => {
        if (!session) {
          setUnreadCount(0);
          return;
        }
        notificationsApi
          .unreadCount(controller.signal)
          .then((count) => {
            if (!controller.signal.aborted) setUnreadCount(count);
          })
          .catch(() => {
            // Keep the last server value on a transient failure; never substitute fixture data.
          });
      }, 0);
      return () => {
        clearTimeout(task);
        controller.abort();
      };
    }, [session]),
  );

  const horizontalPadding = Layout.screenPadding;
  const availableWidth = Math.min(width, Layout.maxContentWidth) - horizontalPadding * 2;
  const useTwoColumns = availableWidth >= 560;
  const cardColumnWidth = useTwoColumns ? (availableWidth - Spacing.md) / 2 : availableWidth;
  const today = new Date();
  const todayKey = localDateKey(today);
  const todayEvent = upcomingEvents.find(
    (event) => localDateKey(new Date(event.startsAt)) === todayKey,
  );
  const joinedEventIds = new Set(participations.map((participation) => participation.eventId));
  const nextJoinedEvent = upcomingEvents
    .filter((event) => event.lifecycle === 'upcoming' && joinedEventIds.has(event.id))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
  const recommendedEvents = upcomingEvents
    .filter(
      (event) =>
        event.lifecycle === 'upcoming' &&
        event.interestId !== undefined &&
        selectedInterestIds.includes(event.interestId),
    )
    .sort((a, b) => {
      const aLocal = a.clubRegion === user.region ? 1 : 0;
      const bLocal = b.clubRegion === user.region ? 1 : 0;
      if (aLocal !== bLocal) return bLocal - aLocal;
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    })
    .slice(0, 2);
  const selectedInterests = availableInterests.filter((interest) =>
    selectedInterestIds.includes(interest.id),
  );
  const recommendationFeed = eventFeeds.upcoming;
  const showBanner = recommendedEvents.length > 0 && recommendationFeed.loaded &&
    !recommendationFeed.loading && !recommendationFeed.loadingMore && !recommendationFeed.error;

  const openEvent = (eventId: string) => {
    router.push({ pathname: '/event/[id]', params: { id: eventId } });
  };

  return (
    <Screen testID="home-screen" contentContainerStyle={{ paddingTop: Spacing.lg }}>
      <View style={{ minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
        <View style={{ minWidth: 0, flex: 1, gap: Spacing.xs }}>
          <AppText variant="caption" color="textSecondary">{user.region} · 시니어클럽</AppText>
          <AppText variant="title">{user.name} 님, 반가워요.</AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `알림 ${unreadCount}개 확인하기` : '알림 확인하기'}
          onPress={() => router.push('/notifications' as Href)}
          style={({ pressed }) => ({
            position: 'relative', width: TouchTarget.compact, height: TouchTarget.compact,
            flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill,
            backgroundColor: pressed ? theme.backgroundSelected : theme.surface,
          })}>
          <AppIcon name="notifications" color={theme.primary} />
          {unreadCount > 0 ? (
            <View accessibilityElementsHidden style={{
              position: 'absolute', top: 0, right: 0, minWidth: 20, minHeight: 20, paddingHorizontal: 4,
              alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill, backgroundColor: theme.accent,
            }}>
              <AppText variant="caption" color="#FFFFFF" selectable={false} style={{ fontVariant: ['tabular-nums'] }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      </View>

      <Card padded={false}>
        <CoverImage
          image={selectCoverImage(undefined, 'hiking')}
          recyclingKey="home-hero"
          accessibilityLabel="시니어클럽 활동 소개 이미지"
          aspectRatio={CoverImageRatios.hero}
        />
        <View style={{ minWidth: 0, gap: Spacing.md, padding: Layout.cardPadding }}>
          <AppText variant="sectionTitle">좋아하는 일을 함께 시작해요</AppText>
          <AppText variant="body" color="textSecondary">
            가까운 모임에서 같은 관심사를 가진 사람들을 만나세요.
          </AppText>
          <SeniorButton label="내게 맞는 모임 찾기" onPress={() => router.push('/events')} />
        </View>
      </Card>

      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="큰 글씨 사용"
        accessibilityHint="화면 글자 크기를 한 단계 키웁니다."
        accessibilityState={{ checked: largeTextEnabled }}
        onPress={toggleLargeText}
        style={({ pressed }) => ({
          minHeight: TouchTarget.compact, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
          paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.md,
          backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
        })}>
        <AppText variant="caption" color="textSecondary" selectable={false} style={{ flex: 1, flexShrink: 1 }}>
          큰 글씨로 보기
        </AppText>
        <Switch
          accessible={false}
          pointerEvents="none"
          value={largeTextEnabled}
          trackColor={{ false: theme.border, true: theme.primary }}
          thumbColor={theme.surface}
        />
      </Pressable>

      <View style={{ minWidth: 0, gap: Spacing.lg }}>
        <SectionHeader
          title="오늘 일정"
          description={formatToday(today)}
          actionLabel="전체 일정"
          onActionPress={() => router.push('/events')}
        />
        {todayEvent ? (
          <HomeEventCard
            event={todayEvent}
            participationStatus={getParticipationStatus(todayEvent.id)}
            onPress={() => openEvent(todayEvent.id)}
          />
        ) : (
          <Card>
            <View style={{ minWidth: 0, gap: Spacing.lg }}>
              <View style={{ minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md }}>
                <View
                  accessibilityElementsHidden
                  style={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: Radius.lg,
                    backgroundColor: theme.infoSurface,
                  }}>
                  <AppIcon name="calendar" color={theme.primary} />
                </View>
                <View style={{ minWidth: 0, flex: 1, gap: Spacing.xs }}>
                  <AppText variant="sectionTitle">오늘은 예정된 모임이 없어요.</AppText>
                  <AppText variant="body" color="textSecondary">
                    {nextJoinedEvent
                      ? `다음 일정은 ${formatShortSchedule(nextJoinedEvent.startsAt)}, ${nextJoinedEvent.title}입니다.`
                      : '새로운 모임을 둘러보고 다음 약속을 만들어 보세요.'}
                  </AppText>
                </View>
              </View>
              <SeniorButton
                label={nextJoinedEvent ? '다가오는 일정 보기' : '모임 둘러보기'}
                variant="secondary"
                onPress={() =>
                  nextJoinedEvent ? openEvent(nextJoinedEvent.id) : router.push('/events')
                }
              />
            </View>
          </Card>
        )}
      </View>

      <View style={{ minWidth: 0, gap: Spacing.lg }}>
        <SectionHeader
          title="추천 모임"
          description={`${user.region}과 관심사를 바탕으로 골랐어요.`}
          actionLabel="전체 보기"
          onActionPress={() => router.push('/events')}
        />
        <View style={{ minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md }}>
          {recommendedEvents.map((event) => (
            <View key={event.id} style={{ width: cardColumnWidth, minWidth: 0 }}>
              <HomeEventCard
                event={event}
                participationStatus={getParticipationStatus(event.id)}
                onPress={() => openEvent(event.id)}
              />
            </View>
          ))}
          {recommendedEvents.length === 0 ? (
            <Card style={{ width: availableWidth }}>
              <View style={{ minWidth: 0, gap: Spacing.md }}>
                <View style={{ gap: Spacing.xs }}>
                  <AppText variant="sectionTitle">새로운 모임 일정을 준비하고 있어요</AppText>
                  <AppText variant="body" color="textSecondary">
                    관심사를 다시 선택하거나 아래의 5060 추천 등산 코스 및 활력 취미생활을 먼저 둘러보세요.
                  </AppText>
                </View>
                <SeniorButton
                  label="전체 모임 둘러보기"
                  variant="secondary"
                  onPress={() => router.push('/events')}
                />
              </View>
            </Card>
          ) : null}
        </View>
      </View>

      {showBanner ? <HomeBannerAd /> : null}

      <SeniorHobbyCourseSection />

      <View style={{ minWidth: 0, gap: Spacing.lg }}>
        <SectionHeader
          title="목적에서 관계까지"
          description="시니어클럽은 한 번의 만남이 오래 이어지도록 돕습니다."
        />
        <Card style={{ gap: Spacing.lg }}>
          {purposeJourney.map((step) => (
            <View key={step.title} style={{ minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md }}>
              <View style={{
                width: 40, height: 40, flexShrink: 0, alignItems: 'center', justifyContent: 'center',
                borderRadius: Radius.pill, backgroundColor: theme.backgroundSelected,
              }}>
                <AppIcon name={step.icon} color={theme.primary} size={22} />
              </View>
              <View style={{ minWidth: 0, flex: 1, gap: Spacing.xs }}>
                <AppText variant="bodyStrong">{step.number}. {step.title}</AppText>
                <AppText variant="caption" color="textSecondary">{step.description}</AppText>
              </View>
            </View>
          ))}
        </Card>
      </View>

      <View style={{ minWidth: 0, gap: Spacing.lg }}>
        <SectionHeader
          title="관심 테마"
          description="좋아하는 일에서 새로운 대화가 시작됩니다."
          actionLabel="다시 고르기"
          onActionPress={() => router.push('/onboarding')}
        />
        <View style={{ minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md }}>
          {selectedInterests.map((interest) => (
            <View key={interest.id} style={{ width: cardColumnWidth, minWidth: 0 }}>
              <InterestChip
                interest={interest}
                selected
                showDescription
                onPress={() => router.push('/clubs')}
              />
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}
