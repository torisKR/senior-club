import { View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { getEventCoverImage } from '@/data/image-assets';
import { useTheme } from '@/hooks/use-theme';
import type { Event, ParticipationStatus } from '@/types';

import { AppText } from './app-text';
import { Card } from './card';
import { CoverImage } from './cover-image';
import { SeatMeter } from './seat-meter';

export interface EventCardProps {
  event: Event;
  participationStatus?: ParticipationStatus;
  onPress?: (event: Event) => void;
  compact?: boolean;
}

const difficultyLabels: Record<Event['difficulty'], string> = {
  easy: '쉬움',
  moderate: '보통',
  challenging: '도전',
};

const statusLabels: Record<ParticipationStatus, string> = {
  pending: '승인 대기',
  approved: '참여 확정',
  attended: '참여 완료',
  reviewed: '후기 작성 완료',
};

const eventDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

function formatDate(value: string) {
  return eventDateFormatter.format(new Date(value));
}

function formatPrice(price: number) {
  return price === 0 ? '무료' : `${price.toLocaleString('ko-KR')}원`;
}

export function EventCard({ event, participationStatus, onPress, compact = false }: EventCardProps) {
  const theme = useTheme();
  const remainingSeats = Math.max(0, event.capacity - event.participantCount);
  const lifecycleLabel =
    event.lifecycle === 'completed'
      ? '종료된 모임'
      : event.lifecycle === 'cancelled'
        ? '취소된 모임'
        : undefined;
  const participationLabel =
    participationStatus &&
    (!lifecycleLabel || participationStatus === 'attended' || participationStatus === 'reviewed')
      ? statusLabels[participationStatus]
      : undefined;
  const accessibilityLabel = [
    event.title,
    formatDate(event.startsAt),
    event.location,
    lifecycleLabel ?? `남은 자리 ${remainingSeats}명`,
    formatPrice(event.price),
    participationLabel,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Card
      padded={false}
      onPress={onPress ? () => onPress(event) : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={
        lifecycleLabel
          ? '눌러 모임 상세 정보를 확인합니다.'
          : '눌러 모임 상세 정보와 신청 방법을 확인합니다.'
      }>
      {!compact ? (
        <CoverImage
          image={getEventCoverImage(event)}
          accessibilityLabel={`${event.title} 모임 대표 이미지`}
          recyclingKey={event.id}
          transition={180}
          style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: theme.backgroundElement }}
        />
      ) : null}
      <View style={{ padding: Spacing.xl, gap: Spacing.md }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm }}>
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
          {participationLabel ? (
            <View
              style={{
                paddingHorizontal: Spacing.md,
                paddingVertical: Spacing.xs,
                borderRadius: Radius.pill,
                backgroundColor: theme.successSurface,
              }}>
              <AppText variant="caption" color="success" selectable={false}>
                {participationLabel}
              </AppText>
            </View>
          ) : null}
        </View>

        <View style={{ gap: Spacing.xs }}>
          <AppText variant="sectionTitle">{event.title}</AppText>
          <AppText variant="body" color="textSecondary">
            {event.summary}
          </AppText>
        </View>

        <View style={{ gap: Spacing.sm }}>
          <AppText variant="bodyStrong">일시 · {formatDate(event.startsAt)}</AppText>
          <AppText variant="body" color="textSecondary">
            장소 · {event.location}
          </AppText>
          <View style={{ gap: Spacing.sm }}>
            {!lifecycleLabel ? (
              <SeatMeter
                capacity={event.capacity}
                participantCount={event.participantCount}
                accessibilityLabel={`정원 ${event.capacity}명 중 ${event.participantCount}명 참여`}
              />
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg }}>
              <AppText
                variant="bodyStrong"
                color={
                  lifecycleLabel
                    ? event.lifecycle === 'cancelled' ? 'danger' : 'textSecondary'
                    : remainingSeats <= 3 ? 'accent' : 'primary'
                }>
                {lifecycleLabel ?? `남은 자리 ${remainingSeats}명`}
              </AppText>
              <AppText variant="bodyStrong">{formatPrice(event.price)}</AppText>
            </View>
          </View>
        </View>
      </View>
    </Card>
  );
}
