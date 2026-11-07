import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { FontWeights, Spacing } from '@/constants/theme';

import { bondProgress, getBond, type NpcId } from './bond-logic';
import { COACH_LINES, NPC_DISPLAY } from './companion-lines';
import { useRpg } from './rpg-store';
import { portraitFor } from './rpg-sprites';

export type CoachMood = 'start' | 'success' | 'miss';

/**
 * 미니게임 상단의 NPC 코치 패널.
 *
 * 그 시설의 주인(박 캡틴·최 사범·이 다도명인)이 한 줄로 함께 합니다.
 * 판정에는 관여하지 않고, 유대 2단계부터는 "코치의 한마디" 힌트가 한 줄 붙습니다.
 */
export function CompanionCoach({ npcId, mood }: { npcId: NpcId; mood: CoachMood }) {
  const { bonds } = useRpg();
  const info = NPC_DISPLAY[npcId];
  const bond = getBond(bonds, npcId);
  const progress = bondProgress(bond.points);

  return (
    <Card style={styles.card} testID="companion-coach">
      <Image
        source={portraitFor(npcId)}
        style={styles.portrait}
        contentFit="cover"
        accessibilityLabel={`${info.name} 초상화`}
      />
      <View style={styles.body}>
        <AppText variant="caption" style={styles.meta}>
          {info.name} · 유대 {progress.level}단계 {progress.label}
        </AppText>
        <AppText variant="body" style={styles.line}>
          {COACH_LINES[npcId][mood]}
        </AppText>
        {progress.level >= 2 ? (
          <AppText variant="caption" style={styles.hint}>
            💡 {COACH_LINES[npcId].hint}
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  portrait: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#D8B384',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  meta: {
    color: '#526451',
    fontFamily: FontWeights.strong,
  },
  line: {
    color: '#182620',
  },
  hint: {
    color: '#855B00',
  },
});
