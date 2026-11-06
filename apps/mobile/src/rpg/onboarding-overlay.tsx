import { Image } from 'expo-image';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText, SeniorButton } from '@/components/ui';
import { FontWeights, Radius, Spacing } from '@/constants/theme';

import { useRpg } from './rpg-store';
import { tutorialCopy, tutorialProgress } from './onboarding';

const PROLOGUE_BANNER = require('../../assets/game/rpg/pixel/ui/banner_lounge.png');

/** 스토리 바이블 §9의 프롤로그 3장. 한 장당 두 문장을 넘기지 않습니다. */
const PROLOGUE_CARDS = [
  {
    title: '빈집',
    body: '아내가 떠난 뒤, 집은 너무 조용했습니다. 딸이 보낸 청솔마을 안내장이 식탁에 놓였습니다.',
  },
  {
    title: '첫 인사',
    body: '짐을 풀고 마을회관 앞에 섰습니다. 김 이장이 손을 잡으며 말했습니다. "어서 오시게, 우리 마을은 놀 줄 아는 사람이 귀하다네."',
  },
  {
    title: '18급',
    body: '새 회원은 18급 입문부터 시작합니다. 오늘의 첫 수는 아침 체조 한 번이면 충분합니다.',
  },
] as const;

/**
 * 첫 실행 프롤로그 + 튜토리얼 배너.
 *
 * - 프롤로그: 최초 1회, 3장. "건너뛰기" 상시 노출.
 * - 튜토리얼: 마을 화면 위에 뜨는 배너(차단 없음). 실제 행동으로만 다음 단계로 넘어갑니다.
 */
export function OnboardingOverlay() {
  const { state, advanceOnboarding } = useRpg();
  const { onboarding } = state;
  const [cardIndex, setCardIndex] = useState(0);

  const progress = useMemo(() => tutorialProgress(onboarding), [onboarding]);
  const copy = useMemo(() => tutorialCopy(onboarding.step), [onboarding.step]);

  const prologueOpen = onboarding.step === 'prologue';

  const handleNext = () => {
    if (cardIndex < PROLOGUE_CARDS.length - 1) {
      setCardIndex((index) => index + 1);
      return;
    }
    advanceOnboarding('closePrologue');
  };

  return (
    <>
      {prologueOpen ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => advanceOnboarding('skip')}>
          <View style={styles.backdrop}>
            <View style={styles.prologueCard} accessibilityViewIsModal>
              <Image source={PROLOGUE_BANNER} style={styles.banner} contentFit="cover" accessible={false} />
              <View style={styles.prologueBody}>
                <View style={styles.prologueTopRow}>
                  <AppText variant="caption" style={styles.prologueStep}>
                    프롤로그 {cardIndex + 1} / {PROLOGUE_CARDS.length}
                  </AppText>
                  <Pressable
                    testID="btn-prologue-skip"
                    accessibilityRole="button"
                    accessibilityLabel="프롤로그 건너뛰기"
                    onPress={() => advanceOnboarding('skip')}
                    hitSlop={8}>
                    <AppText variant="caption" style={styles.skipText}>
                      건너뛰기
                    </AppText>
                  </Pressable>
                </View>

                <AppText variant="title" style={styles.prologueTitle}>
                  {PROLOGUE_CARDS[cardIndex].title}
                </AppText>
                <AppText variant="body" style={styles.prologueText}>
                  {PROLOGUE_CARDS[cardIndex].body}
                </AppText>

                <View style={styles.dotsRow} accessibilityElementsHidden>
                  {PROLOGUE_CARDS.map((card, index) => (
                    <View
                      key={card.title}
                      style={[styles.dot, index === cardIndex && styles.dotActive]}
                    />
                  ))}
                </View>

                <SeniorButton
                  testID="btn-prologue-next"
                  label={
                    cardIndex < PROLOGUE_CARDS.length - 1 ? '다음 이야기' : '마을로 들어가기'
                  }
                  variant="primary"
                  onPress={handleNext}
                />
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      {copy && progress ? (
        <View style={styles.tutorialCard} testID="onboarding-tutorial">
          <View style={styles.tutorialHeader}>
            <View style={styles.tutorialBadge}>
              <AppText variant="caption" style={styles.tutorialBadgeText}>
                {progress.index} / {progress.total}
              </AppText>
            </View>
            <AppText variant="bodyStrong" style={styles.tutorialTitle}>
              {copy.title}
            </AppText>
            <Pressable
              testID="btn-tutorial-skip"
              accessibilityRole="button"
              accessibilityLabel="튜토리얼 건너뛰기"
              onPress={() => advanceOnboarding('skip')}
              hitSlop={8}>
              <AppText variant="caption" style={styles.tutorialSkip}>
                건너뛰기
              </AppText>
            </Pressable>
          </View>
          <AppText variant="body" style={styles.tutorialBody}>
            {copy.body}
          </AppText>
          <AppText variant="caption" style={styles.tutorialHint}>
            {copy.hint}
          </AppText>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 24, 20, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  prologueCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#182620',
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: '#F0BF4F',
    overflow: 'hidden',
  },
  banner: {
    width: '100%',
    height: 148,
  },
  prologueBody: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  prologueTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prologueStep: {
    color: '#F0BF4F',
    fontFamily: FontWeights.strong,
  },
  skipText: {
    color: '#D8B384',
    fontFamily: FontWeights.strong,
    paddingVertical: 4,
  },
  prologueTitle: {
    color: '#FCF9F2',
    fontSize: 26,
  },
  prologueText: {
    color: '#FCF9F2',
    lineHeight: 28,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: Spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3C5D53',
  },
  dotActive: {
    backgroundColor: '#F0BF4F',
    width: 20,
  },
  tutorialCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    gap: 4,
    backgroundColor: '#FFF6DC',
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: '#F0BF4F',
  },
  tutorialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tutorialBadge: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#0E5142',
  },
  tutorialBadgeText: {
    color: '#FCF9F2',
    fontFamily: FontWeights.strong,
  },
  tutorialTitle: {
    flex: 1,
    color: '#182620',
    fontSize: 19,
  },
  tutorialSkip: {
    color: '#6E4228',
    fontFamily: FontWeights.strong,
    paddingVertical: 4,
  },
  tutorialBody: {
    color: '#182620',
  },
  tutorialHint: {
    color: '#4B5D53',
  },
});
