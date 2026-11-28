import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';

import { PixelRadius } from '@/components/game/pixel-theme';
import { AppText, SeniorButton } from '@/components/ui';
import { FontWeights, Spacing } from '@/constants/theme';

import type { ParkGolfMode } from './park-golf-board';
import { PARK_GOLF_BUTTON_ANGLES } from './park-golf-physics';

const POWER_PRESETS: readonly { step: 1 | 2 | 3; label: string; desc: string }[] = [
  { step: 1, label: '1단 (톡 치기)', desc: '가까운 그린 정밀 퍼팅' },
  { step: 2, label: '2단 (표준)', desc: '중거리 페어웨이 샷' },
  { step: 3, label: '3단 (강타)', desc: '장거리 홀인원 노리기' },
];
const angleText = (deg: number, unit: string) =>
  deg < 0 ? `왼쪽 ${Math.abs(deg)}${unit}` : deg > 0 ? `오른쪽 ${deg}${unit}` : `홀컵 정면 0${unit}`;

/** 화면 낭독기(TalkBack)가 켜져 있으면 끌기 대신 버튼 방식을 기본으로 씁니다. 확인 전에는 null. */
export function useScreenReaderEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (next) => { if (active) setEnabled(next); });
    AccessibilityInfo.isScreenReaderEnabled().then(
      (next) => { if (active) setEnabled((old) => old ?? next); },
      () => undefined,
    );
    return () => { active = false; subscription?.remove(); };
  }, []);
  return enabled;
}

export interface ParkGolfControlsProps {
  mode: ParkGolfMode;
  onModeChange: (mode: ParkGolfMode) => void;
  aimAngle: number;
  powerStep: 1 | 2 | 3;
  onAim: (deg: number) => void;
  onPower: (step: 1 | 2 | 3) => void;
  stack: boolean;
  busy: boolean;
  shootLabel: string;
  onShoot: () => void;
}

export function ParkGolfControls({ mode, onModeChange, aimAngle, powerStep, onAim, onPower, stack, busy, shootLabel, onShoot }: ParkGolfControlsProps) {
  if (mode === 'drag') {
    return (
      <>
        <AppText variant="body" style={styles.help}>
          공 주변(점선 원)을 누른 채 뒤로 당겼다 놓으세요. 당긴 반대쪽으로 굴러가고, 길게 당길수록 세게 갑니다. 공 쪽으로 되돌려 놓으면 취소됩니다.
        </AppText>
        <SeniorButton testID="btn-parkgolf-mode" label="버튼으로 치기 (끌기가 어려울 때)" variant="secondary"
          disabled={busy} onPress={() => onModeChange('button')} />
      </>
    );
  }
  return (
    <>
      <AppText variant="caption" style={styles.controlLabel}>1. 방향 조준 (현재 {angleText(aimAngle, '°')})</AppText>
      <View style={styles.presetRow}>
        {PARK_GOLF_BUTTON_ANGLES.map((deg) => {
          const selected = aimAngle === deg;
          return (
            <Pressable
              key={deg}
              accessibilityRole="button"
              accessibilityLabel={angleText(deg, '도')}
              accessibilityState={{ selected }}
              onPress={() => onAim(deg)}
              style={[styles.angleBtn, stack && styles.wideAngleBtn, selected && styles.angleBtnSelected]}>
              <AppText variant="caption" style={{ color: selected ? '#FCF9F2' : '#182620', fontFamily: FontWeights.emphasis }}>
                {deg < 0 ? `좌 ${Math.abs(deg)}°` : deg > 0 ? `우 ${deg}°` : '정면 0°'}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <AppText variant="caption" style={styles.controlLabel}>2. 퍼팅 힘 조절 (1단 ~ 3단)</AppText>
      <View style={[styles.powerRow, stack && styles.stackedRow]}>
        {POWER_PRESETS.map((item) => {
          const selected = powerStep === item.step;
          return (
            <Pressable
              key={item.step}
              testID={`parkgolf-power-${item.step}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onPower(item.step)}
              style={[styles.powerBtn, stack && styles.stackedControl, selected && styles.powerBtnSelected]}>
              <AppText variant="bodyStrong" style={{ color: selected ? '#FFFFFF' : '#182620', textAlign: 'center' }}>{item.label}</AppText>
              <AppText variant="caption" style={{ color: selected ? '#FFFFFF' : '#526451', textAlign: 'center' }}>{item.desc}</AppText>
            </Pressable>
          );
        })}
      </View>

      <SeniorButton testID="btn-parkgolf-shoot" label={shootLabel} variant="accent" disabled={busy} onPress={onShoot} />
      <SeniorButton testID="btn-parkgolf-mode" label="끌어서 치기로 바꾸기" variant="secondary"
        disabled={busy} onPress={() => onModeChange('drag')} />
    </>
  );
}

const styles = StyleSheet.create({
  help: { color: '#182620' },
  controlLabel: { color: '#6E4228', fontFamily: FontWeights.emphasis, marginTop: 4 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stackedRow: { flexDirection: 'column', alignItems: 'stretch' },
  stackedControl: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', alignSelf: 'stretch' },
  angleBtn: {
    flex: 1, minWidth: 48, minHeight: 56, borderRadius: PixelRadius, borderWidth: 1.5,
    borderColor: '#6E4228', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  angleBtnSelected: { backgroundColor: '#0E5142', borderColor: '#0E5142' },
  wideAngleBtn: { flexBasis: '45%', paddingVertical: 6 },
  powerRow: { flexDirection: 'row', gap: Spacing.xs, marginBottom: 4 },
  powerBtn: {
    flex: 1, minWidth: 48, minHeight: 56, borderRadius: PixelRadius, borderWidth: 2, borderColor: '#D8B384',
    backgroundColor: '#FFFFFF', paddingVertical: 6, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center',
  },
  powerBtnSelected: { backgroundColor: '#C2410C', borderColor: '#9A3412' },
});
