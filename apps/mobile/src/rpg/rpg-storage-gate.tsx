import type { PropsWithChildren } from 'react';
import { Alert, Linking } from 'react-native';

import { AppText, Screen, SeniorButton } from '@/components/ui';
import { getPublicWebPageUrl } from '@/config/public-web-links';

import { useRpg } from './rpg-store';

/** Keep every game route closed until the original save is safe to use. */
export function RpgStorageGate({ children }: PropsWithChildren) {
  const { saveProtection, retrySaveProtection } = useRpg();
  if (saveProtection === 'ready') return <>{children}</>;

  const message = saveProtection === 'checking'
    ? '기존 기록을 안전하게 확인하고 있습니다.'
    : saveProtection === 'conflict'
      ? '다른 곳에서 기록이 바뀌어 저장을 멈췄습니다. 앱을 다시 열어 확인해 주세요.'
      : saveProtection === 'unavailable'
        ? '기기의 저장소를 열거나 이전 기록을 확인하지 못해 게임을 잠시 멈췄습니다.'
        : saveProtection === 'read_failed'
          ? '저장 기록을 읽을 수 없어 게임을 잠시 멈췄습니다.'
          : '기존 기록의 백업 또는 저장을 확인하지 못해 게임을 잠시 멈췄습니다.';

  return (
    <Screen testID="rpg-storage-protection">
      <AppText variant="title" accessibilityRole="alert">저장 기록 보호 중</AppText>
      <AppText>{message}</AppText>
      <AppText>저장 공간을 확인한 뒤 다시 시도해 주세요. 앱 데이터를 지우거나 앱을 삭제하지 마세요.</AppText>
      {saveProtection !== 'checking' ? (
        <SeniorButton testID="retry-save-protection" label="저장 다시 확인" onPress={retrySaveProtection} />
      ) : null}
      <AppText>계속 문제가 생기면 앱을 완전히 닫고 다시 열어 주세요.</AppText>
      <SeniorButton
        testID="storage-support"
        label="개인정보 처리방침 및 문의"
        variant="quiet"
        onPress={() => {
          void Linking.openURL(getPublicWebPageUrl('privacy')).catch(() => {
            Alert.alert('안내를 열 수 없어요', '인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
          });
        }}
      />
    </Screen>
  );
}
