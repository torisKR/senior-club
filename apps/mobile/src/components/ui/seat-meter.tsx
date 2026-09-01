import { StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Above this many seats the row of dots stops being readable at a glance. */
const MAX_RENDERED_DOTS = 12;

/** Seats left at or below which the meter switches to the accent color. */
const NEARLY_FULL_THRESHOLD = 3;

export interface SeatMeterProps {
  /** Total seats the event allows. */
  capacity: number;
  /** Seats already taken. */
  participantCount: number;
  /** Screen-reader label; the dots themselves are decorative. */
  accessibilityLabel: string;
}

/**
 * Shows how full an event is as a row of dots — filled for taken seats, hollow
 * for open ones — so a member can judge whether they can still join without
 * reading the numbers. Falls back to a proportional bar for large events, where
 * counting individual dots would be slower than reading the count.
 */
export function SeatMeter({ capacity, participantCount, accessibilityLabel }: SeatMeterProps) {
  const theme = useTheme();
  const safeCapacity = Math.max(0, Math.trunc(capacity));

  if (safeCapacity === 0) {
    return null;
  }

  const taken = Math.min(safeCapacity, Math.max(0, Math.trunc(participantCount)));
  const isNearlyFull = safeCapacity - taken <= NEARLY_FULL_THRESHOLD;
  const takenColor = isNearlyFull ? theme.accent : theme.primary;

  if (safeCapacity > MAX_RENDERED_DOTS) {
    const filledPercent = Math.round((taken / safeCapacity) * 100);

    return (
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
        <View
          style={[styles.trackFill, { backgroundColor: takenColor, width: `${filledPercent}%` }]}
        />
      </View>
    );
  }

  return (
    <View accessible accessibilityLabel={accessibilityLabel} style={styles.dotRow}>
      {Array.from({ length: safeCapacity }, (_, index) => (
        <View
          key={index}
          style={[
            styles.dot,
            index < taken
              ? { backgroundColor: takenColor, borderColor: takenColor }
              : { backgroundColor: 'transparent', borderColor: theme.border },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    alignItems: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: Radius.pill,
    borderWidth: 2,
  },
  track: {
    height: 10,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
});
