import { Image } from 'expo-image';
import { View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { getEventImageSource } from '@/data/image-assets';
import { useTheme } from '@/hooks/use-theme';
import type { Event, ParticipationStatus } from '@/types';

const participationLabels: Record<ParticipationStatus, string> = {
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

function formatEventDate(value: string) {
  return eventDateFormatter.format(new Date(value));
}

export interface HomeEventCardProps {
  event: Event;
  participationStatus?: ParticipationStatus;
  onPress: () => void;
}

export function HomeEventCard({ event, participationStatus, onPress }: HomeEventCardProps) {
  const theme = useTheme();
  const remainingSeats = Math.max(0, event.capacity - event.participantCount);

  return (
    <Card
      padded={false}
      onPress={onPress}
      accessibilityLabel={`${event.title}, ${formatEventDate(event.startsAt)}, ${event.location}, 남은 자리 ${remainingSeats}명`}>
      <Image
        source={getEventImageSource(event)}
        accessibilityLabel={`${event.title} 모임 모습`}
        cachePolicy="memory-disk"
        contentFit="cover"
        recyclingKey={event.id}
        transition={160}
        style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: theme.backgroundElement }}
      />
      <View style={{ minWidth: 0, gap: Spacing.md, padding: Spacing.xl }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
          <View
            style={{
              borderRadius: Radius.pill,
              backgroundColor: theme.infoSurface,
              paddingHorizontal: Spacing.md,
              paddingVertical: Spacing.xs,
            }}>
            <AppText variant="caption" color="info" selectable={false}>
              {event.difficulty === 'easy' ? '편안한 난이도' : '보통 난이도'}
            </AppText>
          </View>
          {participationStatus ? (
            <View
              style={{
                borderRadius: Radius.pill,
                backgroundColor: theme.successSurface,
                paddingHorizontal: Spacing.md,
                paddingVertical: Spacing.xs,
              }}>
              <AppText variant="caption" color="success" selectable={false}>
                {participationLabels[participationStatus]}
              </AppText>
            </View>
          ) : null}
        </View>

        <View style={{ minWidth: 0, gap: Spacing.xs }}>
          <AppText variant="sectionTitle">{event.title}</AppText>
          <AppText variant="body" color="textSecondary">
            {event.summary}
          </AppText>
        </View>

        <View style={{ minWidth: 0, gap: Spacing.xs }}>
          <AppText variant="bodyStrong">📅 {formatEventDate(event.startsAt)}</AppText>
          <AppText variant="body" color="textSecondary">
            📍 {event.location}
          </AppText>
          <AppText variant="bodyStrong" color={remainingSeats <= 3 ? 'accent' : 'primary'}>
            남은 자리 {remainingSeats}명 · {event.price === 0 ? '무료' : `${event.price.toLocaleString('ko-KR')}원`}
          </AppText>
        </View>
      </View>
    </Card>
  );
}
