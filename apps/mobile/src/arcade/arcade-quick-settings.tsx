import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';

import { useArcade } from './arcade-store';

/** 시설에서도 마을과 같은 접근성 설정을 바꿀 수 있습니다. */
export function ArcadeQuickSettings() {
  const [open, setOpen] = useState(false);
  const { state, toggleSound, toggleHaptic, toggleReduceMotion } = useArcade();
  const { largeTextEnabled, toggleLargeText } = useAppState();
  const settings = [
    { label: '큰 글씨', value: largeTextEnabled, toggle: toggleLargeText },
    { label: '효과음과 배경 음악', value: state.soundEnabled, toggle: toggleSound },
    { label: '진동', value: state.hapticEnabled, toggle: toggleHaptic },
    { label: '화면 움직임 줄이기', value: state.reduceMotion, toggle: toggleReduceMotion },
  ];
  return (
    <Card style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((current) => !current)} style={styles.header}>
        <AppText variant="bodyStrong" style={styles.text}>편안한 화면 설정 {open ? '접기' : '열기'}</AppText>
      </Pressable>
      {open ? <View style={styles.options}>
        {settings.map((setting) => <View key={setting.label} style={styles.row}>
          <AppText variant="body" style={styles.label}>{setting.label}</AppText>
          <Switch accessibilityLabel={setting.label} value={setting.value} onValueChange={setting.toggle} />
        </View>)}
        <AppText variant="caption" style={styles.text}>기기의 움직임 줄이기 설정도 함께 적용됩니다.</AppText>
      </View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.xs },
  header: { minHeight: 48, justifyContent: 'center' },
  options: { gap: Spacing.xs },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  label: { color: '#182620', flex: 1 },
  text: { color: '#315B38' },
});
