import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, SeniorButton } from '@/components/ui';

export function ChangeConfirmation({ message, onCancel, onConfirm, cancelLabel = '계속하기', confirmLabel = '바꾸기' }: {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
}) {
  return (
    <View style={styles.panel} accessibilityLiveRegion="polite" testID="arcade-change-confirmation">
      <AppText variant="bodyStrong" style={styles.text}>{message}</AppText>
      <View style={styles.buttons}>
        <View style={styles.button}><SeniorButton label={cancelLabel} variant="secondary" onPress={onCancel} /></View>
        <View style={styles.button}><SeniorButton label={confirmLabel} variant="accent" onPress={onConfirm} /></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 12, gap: 8, borderWidth: 2, borderColor: '#9A3412', borderRadius: 10, backgroundColor: '#FFF1C7' },
  text: { color: '#762E10' },
  buttons: { flexDirection: 'row', gap: 8 },
  button: { flex: 1 },
});
