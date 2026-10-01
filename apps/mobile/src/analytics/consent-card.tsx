import { Alert, Linking, Switch, View } from 'react-native';

import { AppText, Card, SeniorButton } from '@/components/ui';
import { Spacing, TouchTarget } from '@/constants/theme';
import { getPublicWebPageUrl } from '@/config/public-web-links';
import { useTheme } from '@/hooks/use-theme';
import { useAnalyticsConsent } from './analytics-provider';

export function AnalyticsConsentCard({ prompt = false }: { prompt?: boolean }) {
  const theme = useTheme();
  const { choice, error, choose, available } = useAnalyticsConsent();
  if (!available || (prompt && choice !== 'unknown')) return null;
  return (
    <Card style={{ gap: Spacing.md }} testID="analytics-consent">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: TouchTarget.minimum }}>
        <AppText variant="bodyStrong" style={{ flex: 1 }}>서비스 이용 분석 (선택)</AppText>
        {!prompt && <Switch accessibilityLabel="서비스 이용 분석" value={choice === 'granted'} onValueChange={choose} trackColor={{ false: theme.border, true: theme.primary }} thumbColor={theme.surface} />}
      </View>
      <AppText color="textSecondary">
        화면 조회와 방문 횟수를 Google Analytics로 분석해 서비스를 개선합니다. 이름·전화번호·채팅 내용은 보내지 않습니다.
      </AppText>
      <AppText color="textSecondary">동의하지 않아도 모든 기능을 이용할 수 있어요. 내 정보에서 언제든 바꿀 수 있습니다.</AppText>
      {prompt && <View style={{ gap: Spacing.sm }}>
        <SeniorButton label="동의하지 않음" variant="secondary" onPress={() => choose(false)} />
        <SeniorButton label="동의하고 켜기" variant="secondary" onPress={() => choose(true)} />
      </View>}
      <SeniorButton label="개인정보 처리방침 보기" variant="quiet" onPress={() => {
        void Linking.openURL(getPublicWebPageUrl('privacy') + '#analytics').catch(() => Alert.alert('안내를 열 수 없어요', '네트워크 연결을 확인해 주세요.'));
      }} />
      {error ? <AppText color="danger" accessibilityRole="alert">{error}</AppText> : null}
    </Card>
  );
}

// Available outside RequireAuth as well, so logging out never hides withdrawal.
export function AnalyticsSettingsEntry() {
  const { available } = useAnalyticsConsent();
  const [expanded, setExpanded] = useState(false);
  if (!available) return null;
  return (
    <View style={{ gap: Spacing.md }}>
      <SeniorButton
        label={expanded ? '이용 분석 설정 닫기' : '이용 분석 설정'}
        variant="quiet"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
      />
      {expanded && <AnalyticsConsentCard />}
    </View>
  );
}
import { useState } from 'react';
