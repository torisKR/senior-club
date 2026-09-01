import type { ReactNode } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';
import { useTheme } from '@/hooks/use-theme';

import { AppText } from './app-text';

export type SeniorButtonVariant = 'primary' | 'accent' | 'secondary' | 'outline' | 'ghost' | 'danger';

export interface SeniorButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: SeniorButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
  leftAccessory?: ReactNode;
  rightAccessory?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SeniorButton({
  label,
  variant = 'primary',
  loading = false,
  fullWidth = true,
  leftAccessory,
  rightAccessory,
  disabled,
  accessibilityLabel = label,
  style,
  ...props
}: SeniorButtonProps) {
  const theme = useTheme();
  const { largeTextEnabled } = useAppState();

  const palette = {
    primary: { background: theme.primary, pressed: theme.primaryPressed, text: theme.inverseText, border: theme.primary },
    accent: { background: theme.accent, pressed: theme.accentPressed, text: theme.inverseText, border: theme.accent },
    secondary: { background: theme.backgroundSelected, pressed: theme.divider, text: theme.primary, border: theme.backgroundSelected },
    outline: { background: 'transparent', pressed: theme.backgroundElement, text: theme.primary, border: theme.primary },
    ghost: { background: 'transparent', pressed: theme.backgroundElement, text: theme.primary, border: 'transparent' },
    danger: { background: theme.danger, pressed: theme.dangerPressed, text: theme.inverseText, border: theme.danger },
  }[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      hitSlop={4}
      style={({ pressed }) => [
        {
          minHeight: largeTextEnabled ? 60 : TouchTarget.minimum,
          width: fullWidth ? '100%' : undefined,
          paddingHorizontal: Spacing.xl,
          paddingVertical: Spacing.md,
          borderRadius: Radius.md,
          borderCurve: 'continuous',
          borderWidth: 2,
          borderColor: palette.border,
          backgroundColor: pressed ? palette.pressed : palette.background,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Spacing.sm,
          opacity: isDisabled ? 0.55 : 1,
        },
        style,
      ]}
      {...props}>
      {loading ? (
        <ActivityIndicator accessibilityLabel="처리 중" color={palette.text} size="small" />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm }}>
          {leftAccessory}
          <AppText variant="button" color={palette.text} selectable={false}>
            {label}
          </AppText>
          {rightAccessory}
        </View>
      )}
    </Pressable>
  );
}
