import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { AppText, SeniorButton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useEffectiveSafeAreaInsets } from '@/hooks/use-effective-safe-area-insets';

import { busDestinations } from '../maps';
import type { MapId } from '../maps/map-types';

/** 버스 정류장에서 행선지를 고릅니다. */
export function BusSheet({ from, visible, onClose, onTravel, reduceMotion = null, hasCompanion = false }: {
  from: MapId;
  visible: boolean;
  onClose: () => void;
  onTravel: (to: MapId) => void;
  reduceMotion?: boolean | null;
  hasCompanion?: boolean;
}) {
  const destinations = busDestinations(from);
  const insets = useEffectiveSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType={reduceMotion === false ? 'slide' : 'none'} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]} accessibilityViewIsModal>
          <AppText variant="sectionTitle" style={styles.title}>어디로 갈까요?</AppText>
          <AppText variant="body" style={styles.body}>마을버스가 기다리고 있어요. 내린 곳 정류장에서 언제든 돌아올 수 있습니다.</AppText>
          {hasCompanion ? <AppText variant="body" style={styles.body}>함께 걷는 이웃도 같이 버스에 타요.</AppText> : null}
          {destinations.map((map) => (
            <SeniorButton key={map.id} testID={`bus-to-${map.id}`} label={`${map.name} 가는 버스 타기`} variant="accent" onPress={() => onTravel(map.id)} />
          ))}
          <SeniorButton testID="btn-close-bus" label="다음에 탈게요" variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: '#FBF6EA', borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.sm },
  title: { color: '#182620' },
  body: { color: '#24382B' },
});
