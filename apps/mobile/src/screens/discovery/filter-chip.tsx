import { Pressable } from 'react-native';

import { AppText } from '@/components/ui';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface FilterChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}

export function FilterChip({ label, selected, onPress, accessibilityLabel }: FilterChipProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, checked: selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: TouchTarget.minimum,
        justifyContent: 'center',
        paddingHorizontal: Spacing.xl,
        borderRadius: Radius.pill,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.primary : theme.border,
        backgroundColor: selected ? theme.backgroundSelected : theme.surface,
        opacity: pressed ? 0.78 : 1,
      })}>
      <AppText variant="bodyStrong" color={selected ? 'primary' : 'text'} selectable={false}>
        {label}
      </AppText>
    </Pressable>
  );
}
