import { Image } from 'expo-image';
import { View } from 'react-native';

import type { PublicClub } from '@/api/clubs-api';
import { AppText, Card } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { getClubImageSource } from '@/data/image-assets';
import { useTheme } from '@/hooks/use-theme';

import { formatEventDate } from './discovery-utils';

interface ClubCardProps {
  club: PublicClub;
  recommended: boolean;
  onPress: () => void;
}

export function ClubCard({ club, recommended, onPress }: ClubCardProps) {
  const theme = useTheme();
  const region = club.region ?? '지역 미정';

  return (
    <Card
      padded={false}
      onPress={onPress}
      accessibilityLabel={`${club.title}, ${club.interest.name}, 활성 회원 ${club.memberCount}명, ${region}, 자세히 보기`}>
      <Image
        source={getClubImageSource(club)}
        accessibilityLabel="커뮤니티 안내 이미지"
        cachePolicy="memory-disk"
        contentFit="cover"
        recyclingKey={club.id}
        transition={180}
        style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: theme.backgroundElement }}
      />

      <View style={{ flex: 1, padding: Spacing.xl, gap: Spacing.md }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm }}>
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
          {recommended ? (
            <View
              style={{
                paddingHorizontal: Spacing.md,
                paddingVertical: Spacing.xs,
                borderRadius: Radius.pill,
                backgroundColor: theme.successSurface,
              }}>
              <AppText variant="caption" color="success" selectable={false}>
                내 관심사
              </AppText>
            </View>
          ) : null}
        </View>

        <View style={{ gap: Spacing.xs }}>
          <AppText variant="sectionTitle">{club.title}</AppText>
          <AppText variant="body" color="textSecondary">
            {club.description}
          </AppText>
        </View>

        <View style={{ gap: Spacing.xs }}>
          <AppText variant="bodyStrong">
            활성 회원 {club.memberCount.toLocaleString('ko-KR')}명
          </AppText>
          <AppText variant="body" color="textSecondary">
            지역 · {region} · 리더 {club.leaderName}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            예정 모임 {club.upcomingEventCount.toLocaleString('ko-KR')}개 · 지난 모임{' '}
            {club.pastEventCount.toLocaleString('ko-KR')}개
          </AppText>
        </View>

        {club.nextEvent ? (
          <View
            style={{
              marginTop: 'auto',
              padding: Spacing.md,
              gap: Spacing.xs,
              borderRadius: Radius.md,
              backgroundColor: theme.backgroundSelected,
            }}>
            <AppText variant="caption" color="primary">
              {club.nextEvent.status === 'CLOSED' ? '다음 모임 · 신청 마감' : '다음 모임'}
            </AppText>
            <AppText variant="bodyStrong">{club.nextEvent.title}</AppText>
            <AppText variant="caption" color="textSecondary">
              {formatEventDate(club.nextEvent.startAt)} · {club.nextEvent.locationName}
            </AppText>
          </View>
        ) : null}
      </View>
    </Card>
  );
}
