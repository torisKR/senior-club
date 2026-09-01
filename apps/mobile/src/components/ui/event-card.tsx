import { Image } from 'expo-image';
import { View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { getEventImageSource } from '@/data/image-assets';
import { useTheme } from '@/hooks/use-theme';
import type { Event, ParticipationStatus } from '@/types';

import { AppText } from './app-text';
import { Card } from './card';
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
  const accessibilityLabel = [
    event.title,
    formatDate(event.startsAt),
    event.location,
    `남은 자리 ${remainingSeats}명`,
    formatPrice(event.price),
    participationStatus ? statusLabels[participationStatus] : undefined,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Card
      padded={false}
      onPress={onPress ? () => onPress(event) : undefined}
      accessibilityLabel={accessibilityLabel}>
      {!compact ? (
        <Image
          source={getEventImageSource(event)}
          accessibilityLabel={`${event.title} 모임 사진`}
          cachePolicy="memory-disk"
          contentFit="cover"
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
          {participationStatus ? (
            <View
              style={{
                paddingHorizontal: Spacing.md,
                paddingVertical: Spacing.xs,
                borderRadius: Radius.pill,
                backgroundColor: theme.successSurface,
              }}>
              <AppText variant="caption" color="success" selectable={false}>
                {statusLabels[participationStatus]}
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
          <AppText variant="bodyStrong">📅 {formatDate(event.startsAt)}</AppText>
          <AppText variant="body" color="textSecondary">
            📍 {event.location}
          </AppText>
          <View style={{ gap: Spacing.sm }}>
            <SeatMeter
              capacity={event.capacity}
              participantCount={event.participantCount}
              accessibilityLabel={`정원 ${event.capacity}명 중 ${event.participantCount}명 참여`}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg }}>
              <AppText variant="bodyStrong" color={remainingSeats <= 3 ? 'accent' : 'primary'}>
                남은 자리 {remainingSeats}명
              </AppText>
              <AppText variant="bodyStrong">{formatPrice(event.price)}</AppText>
            </View>
          </View>
        </View>
      </View>
    </Card>
  );
}
