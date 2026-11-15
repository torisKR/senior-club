import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, SeniorButton } from '@/components/ui';
import { useArcade } from './arcade-store';

export function ArcadeSaveNotice() {
  const { saveReadProtected, saveConflict, saveWriteFailed, retrySave } = useArcade();
  if (!saveReadProtected && !saveConflict && !saveWriteFailed) return null;
  return (
    <View accessibilityLiveRegion="polite" style={styles.notice}>
      <AppText variant="bodyStrong" style={styles.text}>
        {saveReadProtected
          ? '기존 대국 기록을 읽지 못해 덮어쓰지 않았어요. 지금의 점수와 설정은 앱을 종료하면 남지 않을 수 있어요.'
          : saveConflict
            ? '대국 기록이 다른 곳에서 바뀌어 덮어쓰지 않았어요. 현재 점수와 설정은 앱을 종료하면 남지 않을 수 있어요.'
          : '대국 기록을 저장하지 못했어요. 앱을 종료하기 전에 다시 저장해 주세요.'}
      </AppText>
      {!saveReadProtected && !saveConflict && saveWriteFailed ? <SeniorButton label="다시 저장" variant="secondary" onPress={retrySave} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { padding: 12, gap: 8, borderWidth: 2, borderRadius: 10, borderColor: '#9A3412', backgroundColor: '#FFF1C7' },
  text: { color: '#762E10' },
});
