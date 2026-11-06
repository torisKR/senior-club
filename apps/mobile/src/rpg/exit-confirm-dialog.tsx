import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { AppText, SeniorButton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';

interface ExitConfirmDialogProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * 안드로이드 뒤로가기 종료 확인.
 * 큰 버튼 두 개(계속하기/종료하기)로 시니어가 실수로 앱을 닫지 않게 합니다.
 */
export function ExitConfirmDialog({ visible, onCancel, onConfirm }: ExitConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <AppText variant="title" style={styles.title}>
            게임을 종료할까요?
          </AppText>
          <AppText variant="body" style={styles.body}>
            오늘의 기록은 기기에 저장되었습니다. 다음에 이어서 하실 수 있어요.
          </AppText>
          <View style={styles.actions}>
            <SeniorButton
              testID="btn-exit-cancel"
              label="계속하기"
              variant="primary"
              onPress={onCancel}
            />
            <SeniorButton
              testID="btn-exit-confirm"
              label="종료하기"
              variant="secondary"
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 24, 20, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FCF9F2',
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: '#0E5142',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  title: {
    color: '#182620',
    fontSize: 24,
  },
  body: {
    color: '#3C4A42',
    lineHeight: 26,
  },
  actions: {
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
  },
});
