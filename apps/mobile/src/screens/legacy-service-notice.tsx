import { useRouter } from 'expo-router';
import { Alert, Linking } from 'react-native';

import { AppText, Card, Screen, SeniorButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';

export function LegacyServiceNotice() {
  const router = useRouter();
  return (
    <Screen contentContainerStyle={{ gap: Spacing.lg }}>
      <Card style={{ gap: Spacing.md }}>
        <AppText variant="sectionTitle">시니어클럽이 게임으로 바뀌었어요</AppText>
        <AppText color="textSecondary">
          이전 모임과 커뮤니티 서비스는 종료되었어요. 청솔마을에서 이야기와 세 가지 놀이를 즐겨 보세요.
        </AppText>
        <AppText color="textSecondary">
          이전 계정과 개인정보에 관한 문의는 고객센터로 보내 주세요.
        </AppText>
        <SeniorButton label="청솔마을로 가기" onPress={() => router.replace('/home')} />
        <SeniorButton
          label="고객센터에 문의하기"
          variant="ghost"
          onPress={() => void Linking.openURL(`mailto:korea@toris.kr?subject=${encodeURIComponent('시니어클럽 이전 서비스 문의')}`)
            .catch(() => Alert.alert('메일 앱을 열 수 없어요', 'korea@toris.kr로 문의해 주세요.'))}
        />
      </Card>
    </Screen>
  );
}
