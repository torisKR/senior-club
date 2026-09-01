import { Pressable, View } from 'react-native';

import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Interest } from '@/types';

import { AppText } from './app-text';

export interface InterestChipProps {
  interest: Interest;
  selected: boolean;
  onPress: (interest: Interest) => void;
  showDescription?: boolean;
}

export function InterestChip({ interest, selected, onPress, showDescription = false }: InterestChipProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={`${interest.name}, ${interest.description}`}
      accessibilityState={{ checked: selected }}
      onPress={() => onPress(interest)}
      style={({ pressed }) => ({
        minHeight: TouchTarget.minimum,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.primary : theme.border,
        borderRadius: showDescription ? Radius.lg : Radius.pill,
        backgroundColor: selected ? theme.backgroundSelected : theme.surface,
        opacity: pressed ? 0.8 : 1,
      })}>
      <AppText variant="key" accessibilityLabel="" selectable={false}>
        {interest.emoji}
      </AppText>
      <View style={{ flex: showDescription ? 1 : undefined, gap: 2 }}>
        <AppText variant="bodyStrong" color={selected ? 'primary' : 'text'} selectable={false}>
          {interest.name}
        </AppText>
        {showDescription ? (
          <AppText variant="caption" color="textSecondary" selectable={false}>
            {interest.description}
          </AppText>
        ) : null}
      </View>
      {selected ? (
        <AppText variant="key" color="primary" accessibilityLabel="선택됨" selectable={false}>
          ✓
        </AppText>
      ) : null}
    </Pressable>
  );
}

