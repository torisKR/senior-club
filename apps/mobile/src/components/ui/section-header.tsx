import { Pressable, View } from 'react-native';

import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { AppText } from './app-text';

export interface SectionHeaderProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export function SectionHeader({ title, description, actionLabel, onActionPress }: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.md }}>
      <View style={{ flex: 1, gap: Spacing.xs }}>
        <AppText variant="sectionTitle">{title}</AppText>
        {description ? (
          <AppText variant="caption" color="textSecondary">
            {description}
          </AppText>
        ) : null}
      </View>
      {actionLabel && onActionPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={4}
          onPress={onActionPress}
          style={({ pressed }) => ({
            minHeight: TouchTarget.minimum,
            minWidth: TouchTarget.minimum,
            paddingHorizontal: Spacing.md,
            borderRadius: Radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          })}>
          <AppText variant="bodyStrong" color="primary" selectable={false}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

