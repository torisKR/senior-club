import { useState } from 'react';
import { View } from 'react-native';

import { AppText, SeniorButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';

import { useAds } from './AdsProvider';

export function AdsPrivacySettings() {
  const { privacyOptionsRequired, showPrivacyOptions } = useAds();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!privacyOptionsRequired) return null;

  async function openOptions() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await showPrivacyOptions();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: Spacing.sm }}>
      <SeniorButton
        testID="ads-privacy-options"
        label="광고 개인정보 선택"
        variant="ghost"
        disabled={busy}
        onPress={() => void openOptions()}
        accessibilityHint="광고 개인정보 선택을 확인하거나 변경합니다"
      />
      {failed ? <AppText color="textSecondary">설정을 열지 못했어요. 다시 시도해 주세요.</AppText> : null}
    </View>
  );
}
