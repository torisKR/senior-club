import { Image } from 'expo-image';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Switch, View, useWindowDimensions } from 'react-native';

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
import { useAppState } from '@/hooks/use-app-state';
import { useTheme } from '@/hooks/use-theme';

import { HomeEventCard } from './home-event-card';

const purposeJourney = [
  { number: '1', title: '목적', description: '좋아하는 일과 배우고 싶은 것을 고릅니다.', emoji: '🧭' },
  { number: '2', title: '사람', description: '같은 관심사와 가까운 지역의 사람을 만납니다.', emoji: '👥' },
  { number: '3', title: '활동', description: '안전하게 준비된 모임에 함께 참여합니다.', emoji: '🌿' },
  { number: '4', title: '관계', description: '대화와 다음 약속으로 인연을 이어갑니다.', emoji: '🤝' },
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

  const horizontalPadding = width < 360 ? Spacing.lg : Layout.screenPadding;
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

  const openEvent = (eventId: string) => {
    router.push({ pathname: '/event/[id]', params: { id: eventId } });
  };

  return (
    <Screen testID="home-screen" contentContainerStyle={{ paddingTop: Spacing.lg }}>
      <Card padded={false} style={{ backgroundColor: theme.surface }}>
        <Image
          source={require('@/assets/images/senior-club-hero-v2.jpg')}
          accessibilityLabel="산책길에서 다음 활동을 함께 계획하는 중년 모임"
          cachePolicy="memory-disk"
          contentFit="cover"
          style={{ width: '100%', aspectRatio: width < 420 ? 4 / 3 : 16 / 9, backgroundColor: theme.backgroundElement }}
        />
        <View style={{ minWidth: 0, gap: Spacing.xl, padding: Spacing.xl }}>
          <View style={{ minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md }}>
            <View style={{ minWidth: 0, flex: 1, gap: Spacing.xs }}>
              <AppText variant="caption" color="primary">
                중년을 위한 목적 중심 커뮤니티
              </AppText>
              <AppText variant="title">{user.name} 님, 오늘도 반가워요.</AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={unreadCount > 0 ? `알림 ${unreadCount}개 확인하기` : '알림 확인하기'}
              onPress={() => router.push('/notifications' as Href)}
              style={({ pressed }) => ({
                position: 'relative',
                width: TouchTarget.minimum,
                height: TouchTarget.minimum,
                flexShrink: 0,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: Radius.pill,
                borderWidth: 1,
                borderColor: theme.divider,
                backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
              })}>
              <AppText variant="key" accessibilityLabel="" selectable={false}>
                🔔
              </AppText>
              {unreadCount > 0 ? (
                <View
                  accessibilityElementsHidden
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: -3,
                    minWidth: 24,
                    height: 24,
                    paddingHorizontal: 5,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: Radius.pill,
                    borderWidth: 2,
                    borderColor: theme.surface,
                    backgroundColor: theme.accent,
                  }}>
                  <AppText
                    variant="caption"
                    color="#FFFFFF"
                    accessibilityLabel=""
                    selectable={false}
                    style={{ fontSize: 14, lineHeight: 18, fontVariant: ['tabular-nums'] }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </AppText>
                </View>
              ) : null}
            </Pressable>
          </View>

          <AppText variant="body" color="textSecondary">
            좋아하는 일을 함께할 사람을 만나고, 활동 뒤에도 다음 약속과 대화를 이어가세요.
          </AppText>

          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="큰 글씨 사용"
            accessibilityHint="화면 전체 글자 크기를 한 단계 키웁니다."
            accessibilityState={{ checked: largeTextEnabled }}
            onPress={toggleLargeText}
            style={({ pressed }) => ({
              minHeight: TouchTarget.minimum,
              minWidth: 0,
              flexDirection: 'row',
              alignItems: 'center',
              gap: Spacing.md,
              paddingHorizontal: Spacing.lg,
              paddingVertical: Spacing.sm,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: largeTextEnabled ? theme.primary : theme.border,
              backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
            })}>
            <View style={{ minWidth: 0, flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong" selectable={false}>
                글자를 더 크게 보기
              </AppText>
              <AppText variant="caption" color="textSecondary" selectable={false}>
                {largeTextEnabled ? '큰 글씨를 사용하고 있어요.' : '누르면 모든 글자가 커져요.'}
              </AppText>
            </View>
            <Switch
              accessible={false}
              pointerEvents="none"
              value={largeTextEnabled}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={theme.surface}
            />
          </Pressable>

          <SeniorButton label="내게 맞는 모임 찾기" onPress={() => router.push('/events')} />
        </View>
      </Card>

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
                    width: TouchTarget.minimum,
                    height: TouchTarget.minimum,
                    flexShrink: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: Radius.lg,
                    backgroundColor: theme.infoSurface,
                  }}>
                  <AppText variant="key" accessibilityLabel="" selectable={false}>
                    📅
                  </AppText>
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
              <View style={{ minWidth: 0, gap: Spacing.sm }}>
                <AppText variant="sectionTitle">조건에 맞는 새 모임을 준비 중이에요.</AppText>
                <AppText variant="body" color="textSecondary">
                  관심사를 다시 고르거나 전체 모임에서 다른 활동을 먼저 둘러보세요.
                </AppText>
              </View>
            </Card>
          ) : null}
        </View>
      </View>

      <View style={{ minWidth: 0, gap: Spacing.lg }}>
        <SectionHeader
          title="목적에서 관계까지"
          description="시니어클럽은 한 번의 만남이 오래 이어지도록 돕습니다."
        />
        <View style={{ minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md }}>
          {purposeJourney.map((step) => (
            <Card key={step.title} style={{ width: cardColumnWidth, minWidth: 0 }}>
              <View style={{ minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md }}>
                <View
                  accessibilityElementsHidden
                  style={{
                    width: 52,
                    height: 52,
                    flexShrink: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: Radius.pill,
                    backgroundColor: theme.backgroundSelected,
                  }}>
                  <AppText variant="key" accessibilityLabel="" selectable={false}>
                    {step.emoji}
                  </AppText>
                </View>
                <View style={{ minWidth: 0, flex: 1, gap: Spacing.xs }}>
                  <AppText variant="caption" color="primary">
                    {step.number}단계
                  </AppText>
                  <AppText variant="sectionTitle">{step.title}</AppText>
                  <AppText variant="body" color="textSecondary">
                    {step.description}
                  </AppText>
                </View>
              </View>
            </Card>
          ))}
        </View>
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
