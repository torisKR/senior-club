import type { PropsWithChildren } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Pressable, View } from 'react-native';

import { useGameSkin } from '@/components/game/game-skin';
import { PixelCorners, pixelFrameStyle } from '@/components/game/pixel-panel';
import { Layout, Radius, Shadows } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface CardProps extends PropsWithChildren {
  onPress?: PressableProps['onPress'];
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  testID?: string;
}

export function Card({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  padded = true,
  testID,
}: CardProps) {
  const theme = useTheme();
  const isGameSkin = useGameSkin();
  const appStyle: ViewStyle = {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.divider,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
    boxShadow: Shadows.card,
  };
  const sharedStyle: StyleProp<ViewStyle> = [
    isGameSkin ? pixelFrameStyle : appStyle,
    { padding: padded ? Layout.cardPadding : 0 },
    style,
  ];

  if (!onPress) {
    return (
      <View testID={testID} style={sharedStyle}>
        {children}
        {isGameSkin ? <PixelCorners /> : null}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [sharedStyle, { opacity: pressed ? 0.86 : 1, transform: [{ scale: pressed ? 0.995 : 1 }] }]}>
      {children}
    </Pressable>
  );
}

