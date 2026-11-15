import type { PropsWithChildren } from 'react';
import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import { useSegments } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Layout, Spacing } from '@/constants/theme';
import { useEffectiveSafeAreaInsets } from '@/hooks/use-effective-safe-area-insets';
import { useTheme } from '@/hooks/use-theme';

export interface ScreenProps extends PropsWithChildren {
  scroll?: boolean;
  padded?: boolean;
  includeBottomInset?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollViewProps?: Omit<ScrollViewProps, 'children' | 'contentContainerStyle' | 'style'>;
  testID?: string;
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  includeBottomInset = true,
  style,
  contentContainerStyle,
  scrollViewProps,
  testID,
}: ScreenProps) {
  const theme = useTheme();
  const safeInsets = useEffectiveSafeAreaInsets();
  const segments: readonly string[] = useSegments();
  // 마을 밖 장소(시설·내 집)는 스택 헤더가 상태 표시줄 영역을 이미 차지합니다.
  const headerOwnsTop = segments[0] === '(game)' && segments[1] !== undefined && segments[1] !== 'home';
  const insets = headerOwnsTop ? { ...safeInsets, top: 0 } : safeInsets;
  const horizontalPadding = padded ? Layout.screenPadding : 0;
  const bottomPadding = includeBottomInset ? Math.max(Spacing.xxxl, insets.bottom + Spacing.lg) : Spacing.xxxl;
  const requestedTop = StyleSheet.flatten(contentContainerStyle)?.paddingTop;
  const topGap = typeof requestedTop === 'number' ? requestedTop : Spacing.lg;
  const innerStyle: StyleProp<ViewStyle> = [
    {
      width: '100%',
      maxWidth: Layout.maxContentWidth,
      alignSelf: 'center',
      paddingHorizontal: horizontalPadding,
      paddingBottom: bottomPadding,
      gap: Layout.sectionGap,
    },
    contentContainerStyle,
  ];

  if (!scroll) {
    return (
      <View testID={testID} style={[{ flex: 1, backgroundColor: theme.background }, style]}>
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <View style={[{ flex: 1 }, innerStyle]}>{children}</View>
        </View>
      </View>
    );
  }

  return (
    <View
      testID={testID}
      style={[{ flex: 1, backgroundColor: theme.background }, style, { paddingTop: insets.top, overflow: 'hidden' }]}>
      {/* Keep system space outside the viewport; content padding scrolls away. */}
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, overflow: 'hidden' }}
        contentContainerStyle={[innerStyle, { paddingTop: topGap }]}
        {...scrollViewProps}>
        {children}
      </ScrollView>
    </View>
  );
}
