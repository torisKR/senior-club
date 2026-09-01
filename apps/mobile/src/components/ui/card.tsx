import type { PropsWithChildren } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Pressable, View } from 'react-native';

import { Layout, Radius, Shadows } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface CardProps extends PropsWithChildren {
  onPress?: PressableProps['onPress'];
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  testID?: string;
}

export function Card({
  children,
  onPress,
  accessibilityLabel,
  style,
  padded = true,
  testID,
}: CardProps) {
  const theme = useTheme();
  const sharedStyle: StyleProp<ViewStyle> = [
    {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.divider,
      borderRadius: Radius.lg,
      borderCurve: 'continuous',
      padding: padded ? Layout.cardPadding : 0,
      overflow: 'hidden',
      boxShadow: Shadows.card,
    },
    style,
  ];

  if (!onPress) {
    return (
      <View testID={testID} style={sharedStyle}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [sharedStyle, { opacity: pressed ? 0.86 : 1, transform: [{ scale: pressed ? 0.995 : 1 }] }]}>
      {children}
    </Pressable>
  );
}

