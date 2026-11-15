import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { TouchTarget } from '@/constants/theme';
import { useEffectiveSafeAreaInsets } from '@/hooks/use-effective-safe-area-insets';

import { PixelBorder, PixelPalette } from './pixel-theme';

const BACK_SIGN = require('../../../assets/game/rpg/pixel/gameui/back_button.png');

/** 스택 헤더가 넘겨주는 값 중 이 헤더가 쓰는 부분만. */
export interface GameHeaderProps {
  navigation: { goBack: () => void };
  options: { title?: string };
  back?: unknown;
}

/** 시설·내 집 상단: 호두나무 간판 바 + "마을로" 나무 표지판(56dp). 제목은 한지 명패에. */
export function GameHeader({ navigation, options, back }: GameHeaderProps) {
  const insets = useEffectiveSafeAreaInsets();
  const title = typeof options.title === 'string' ? options.title : '';
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="마을로 돌아가기"
          hitSlop={8}
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Image source={BACK_SIGN} style={styles.backSign} contentFit="contain" accessible={false} />
          <AppText variant="caption" color={PixelPalette.dialogueText} style={styles.backLabel} selectable={false}>
            마을로
          </AppText>
        </Pressable>
      ) : null}
      <View style={styles.plate}>
        <AppText variant="key" color={PixelPalette.ink} numberOfLines={1} accessibilityRole="header" style={styles.title}>
          {title}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: PixelPalette.wood,
    borderBottomWidth: PixelBorder.frame,
    borderBottomColor: PixelPalette.outline,
    boxShadow: `inset 0 -3px 0 ${PixelPalette.woodLight}`,
  },
  back: {
    minWidth: TouchTarget.minimum,
    minHeight: TouchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { transform: [{ translateY: 2 }], opacity: 0.85 },
  backSign: { width: 44, height: 32 },
  backLabel: { fontSize: 14, lineHeight: 18 },
  plate: {
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: PixelPalette.hanji,
    borderWidth: PixelBorder.frame,
    borderColor: PixelPalette.outline,
    borderRadius: 2,
  },
  title: { textAlign: 'center' },
});
