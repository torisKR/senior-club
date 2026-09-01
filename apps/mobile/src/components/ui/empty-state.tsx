import { View } from 'react-native';

import { Spacing } from '@/constants/theme';

import { AppText } from './app-text';
import { Card } from './card';
import { SeniorButton } from './senior-button';

export interface EmptyStateProps {
  title: string;
  description: string;
  emoji?: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export function EmptyState({
  title,
  description,
  emoji = '🌱',
  actionLabel,
  onActionPress,
}: EmptyStateProps) {
  return (
    <Card style={{ alignItems: 'center' }}>
      <View style={{ width: '100%', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl }}>
        <AppText variant="display" accessibilityLabel="" selectable={false}>
          {emoji}
        </AppText>
        <View style={{ alignItems: 'center', gap: Spacing.sm }}>
          <AppText variant="sectionTitle" align="center">
            {title}
          </AppText>
          <AppText variant="body" color="textSecondary" align="center">
            {description}
          </AppText>
        </View>
        {actionLabel && onActionPress ? (
          <SeniorButton label={actionLabel} onPress={onActionPress} style={{ marginTop: Spacing.sm }} />
        ) : null}
      </View>
    </Card>
  );
}

