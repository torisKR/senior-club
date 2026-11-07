import { Image } from 'expo-image';
import { randomUUID } from 'expo-crypto';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText, Card, Screen, SeniorButton } from '@/components/ui';
import { FontWeights, Layout, Radius, Spacing } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';

import { playSfx } from '@/audio/sound-manager';

import { createInitialAlkkagiStones, executeAlkkagiFlick, hasAlkkagiProgress, type AlkkagiStone } from './arcade-logic';
import { useArcade } from './arcade-store';
import { CompanionCoach } from '@/rpg/companion-coach';
import { GAME_COACH } from '@/rpg/companion-lines';
import { useRpg } from '@/rpg/rpg-store';
import { getRpgStorage } from '@/rpg/rpg-db';
import { isAlkkagiRound, loadRoundState } from './round-save';
import { RoundSaveNotice, useRoundSave } from './round-save-notice';
import { ChangeConfirmation } from './change-confirmation';
import { PixelFx } from '@/fx/pixel-fx';
import { FX_MANIFEST } from '@/fx/fx-manifest';
import { getStoryTrial, StoryTrialNotice } from './story-trial';

const STONE_BLACK = require('../../assets/game/rpg/pixel/arcade/stone_black.png');
const STONE_WHITE = require('../../assets/game/rpg/pixel/arcade/stone_white.png');
const FLICK_GAUGE_UI = require('../../assets/game/rpg/ui/ui_alkkagi_flick_gauge_01.png');
const ROUND_KEY = 'senior_club_alkkagi_round_v1';

const AI_OPPONENTS = [
  { id: '18k', name: '18급 박 회원', title: '입문 대국' },
  { id: '9k', name: '9급 최 유단자', title: '정석 대국' },
  { id: 'master', name: '명인 김 사범', title: '명인 초청전' },
] as const;

export function AlkkagiBoardScreen({ storyChapter, onLeaveStory }: { storyChapter?: string; onLeaveStory?: () => void } = {}) {
  const { width, fontScale } = useWindowDimensions();
  const { largeTextEnabled } = useAppState();
  const stackControls = width < 360 || fontScale >= 1.3 || largeTextEnabled;
  const { recordAlkkagiWin, triggerHaptic, state, appearance } = useArcade();
  const { completeQuestStep, recordGameWithNpc, recordStoryResult } = useRpg();
  const [storage] = useState(getRpgStorage);
  const story = getStoryTrial(storyChapter, 'alkkagi');
  const roundKey = story ? `${ROUND_KEY}_story_${story.id}` : ROUND_KEY;
  const [loadedRound] = useState(() => loadRoundState(storage, roundKey, isAlkkagiRound));
  const savedRound = loadedRound.value;
  const [opponentIdx, setOpponentIdx] = useState(savedRound?.opponentIdx ?? (story?.id === 'chapter_2' ? 1 : story ? 2 : 0));
  const opponent = story ? { name: story.climaxTrial.opponentName } : AI_OPPONENTS[opponentIdx] ?? AI_OPPONENTS[0];

  const [stones, setStones] = useState<AlkkagiStone[]>(() => savedRound?.stones ?? createInitialAlkkagiStones());
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(savedRound?.selectedPlayerId ?? 'p2');
  const [selectedTargetId, setSelectedTargetId] = useState<string>(savedRound?.selectedTargetId ?? 'a2');
  const [powerMode, setPowerMode] = useState<'precision' | 'strong' | 'double'>(savedRound?.powerMode ?? 'double');
  const [matchDoubleKnockouts, setMatchDoubleKnockouts] = useState(savedRound?.matchDoubleKnockouts ?? 0);
  const [bannerText, setBannerText] = useState<string>(
    savedRound?.bannerText ?? '내 흑석(★)과 조준할 백석(◎)을 고른 뒤 [알 튕기기 (타격!)]를 누르세요.',
  );
  const [storyAttemptId, setStoryAttemptId] = useState(() => story ? savedRound?.storyAttemptId ?? randomUUID() : undefined);
  const roundSave = useRoundSave(storage, roundKey, loadedRound, { opponentIdx, stones, selectedPlayerId, selectedTargetId, powerMode, matchDoubleKnockouts, bannerText, storyAttemptId });
  const [pendingOpponent, setPendingOpponent] = useState<number | null>(null);
  const [scrollCallout, setScrollCallout] = useState<string | null>(null);
  // 타격 지점에 터지는 충격 이펙트 (pixelfx `impacts/crit-hit`)
  const [impactFx, setImpactFx] = useState<{ key: number; x: number; y: number } | null>(null);

  const alivePlayers = useMemo(() => stones.filter((s) => s.owner === 'player' && s.alive), [stones]);
  const aliveEnemies = useMemo(() => stones.filter((s) => s.owner === 'ai' && s.alive), [stones]);

  const activeShooter = alivePlayers.find((s) => s.id === selectedPlayerId) ?? alivePlayers[0];
  const activeTarget = aliveEnemies.find((s) => s.id === selectedTargetId) ?? aliveEnemies[0];

  const resetMatch = (nextOppIdx = opponentIdx) => {
    triggerHaptic('light');
    setOpponentIdx(nextOppIdx);
    const fresh = createInitialAlkkagiStones();
    setStones(fresh);
    setSelectedPlayerId('p2');
    setSelectedTargetId('a2');
    setMatchDoubleKnockouts(0);
    setScrollCallout(null);
    setImpactFx(null);
    if (story) setStoryAttemptId(randomUUID());
    setPendingOpponent(null);
    setBannerText(`${story?.climaxTrial.opponentName ?? AI_OPPONENTS[nextOppIdx].name}과의 새 대국이 시작되었습니다!`);
  };

  const selectOpponent = (idx: number) => {
    if (idx === opponentIdx) {
      setPendingOpponent(null);
      return;
    }
    if (aliveEnemies.length > 0 && hasAlkkagiProgress(stones)) setPendingOpponent(idx);
    else resetMatch(idx);
  };

  const cycleNextShooter = () => {
    if (!alivePlayers.length) return;
    triggerHaptic('light');
    const idx = alivePlayers.findIndex((s) => s.id === activeShooter?.id);
    const next = alivePlayers[(idx + 1) % alivePlayers.length];
    setSelectedPlayerId(next.id);
  };

  const cycleNextTarget = () => {
    if (!aliveEnemies.length) return;
    triggerHaptic('light');
    const idx = aliveEnemies.findIndex((s) => s.id === activeTarget?.id);
    setSelectedTargetId(aliveEnemies[(idx + 1) % aliveEnemies.length].id);
  };

  const handleFlick = () => {
    if (!activeShooter || !activeTarget) return;
    triggerHaptic('medium');
    playSfx('stoneClack', state.soundEnabled);

    const result = executeAlkkagiFlick(stones, activeShooter.id, activeTarget.id, powerMode);
    setImpactFx({ key: Date.now(), x: activeTarget.x, y: activeTarget.y });
    const nextDoubleCount = matchDoubleKnockouts + (result.doubleKnockout ? 1 : 0);
    setMatchDoubleKnockouts(nextDoubleCount);
    if (result.doubleKnockout) playSfx('combo', state.soundEnabled);
    setScrollCallout(result.doubleKnockout ? '📜 일석이조(一石二鳥)! 보너스 +500점!' : null);

    const remainingAi = result.stones.filter((s) => s.owner === 'ai' && s.alive);
    const remainingPlayer = result.stones.filter((s) => s.owner === 'player' && s.alive);

    if (remainingAi.length === 0) {
      playSfx('chime', state.soundEnabled);
      setStones(result.stones);
      const storyNote = story ? (story.id === 'chapter_2' || nextDoubleCount > 0 ? ' 이야기 목표를 마쳤습니다.' : ' 이야기 목표인 일석이조는 이루지 못해 다시 도전할 수 있습니다.') : '';
      setBannerText(`🎉 대국 승리! 상대 알을 모두 장외로 밀어냈습니다! (+${160 + nextDoubleCount * 50} CP)${storyNote}`);
      recordAlkkagiWin(nextDoubleCount);
      completeQuestStep('alkkagi');
      if (story && storyAttemptId) recordStoryResult({ type: 'alkkagi', doubleKnockouts: nextDoubleCount, chapterId: story.id, attemptId: storyAttemptId });
      recordGameWithNpc(GAME_COACH.alkkagi);
      return;
    }

    // Simple deterministic AI counter-nudge that keeps gameplay fair & exciting
    const aiStone = remainingAi[0];
    const targetPlayer = remainingPlayer[remainingPlayer.length - 1];
    if (aiStone && targetPlayer) {
      aiStone.y = Math.min(72, Number((aiStone.y + 12).toFixed(1)));
    }

    setStones([...result.stones]);
    setBannerText(`${result.summaryText} (남은 상대 알: ${remainingAi.length}개)`);
    if (remainingPlayer[0]) setSelectedPlayerId(remainingPlayer[0].id);
    if (remainingAi[0]) setSelectedTargetId(remainingAi[0].id);
  };

  return (
    <Screen testID="alkkagi-screen" contentContainerStyle={styles.container}>
      {/* 1. 상단 대국 현황판 (Art Bible §7: 28pt ExtraBold tabular-nums) */}
      <View style={styles.hudCard}>
        <View style={[styles.oppTabsRow, stackControls && styles.stackedRow]}>
          {!story ? AI_OPPONENTS.map((opp, idx) => {
            const active = idx === opponentIdx;
            return (
              <Pressable
                key={opp.id}
                testID={`alkkagi-opponent-${opp.id}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => selectOpponent(idx)}
                style={[styles.oppTab, stackControls && styles.stackedControl, active && styles.oppTabActive]}>
                <AppText
                  variant="caption"
                  style={{
                    color: active ? '#182620' : '#FCF9F2',
                    fontFamily: FontWeights.emphasis,
                  }}>
                  {opp.name}
                </AppText>
              </Pressable>
            );
          }) : <AppText variant="bodyStrong" style={{ color: '#FCF9F2' }}>{opponent.name}과 이야기 대국</AppText>}
        </View>

        <View style={[styles.versusRow, stackControls && styles.stackedRow]}>
          <View style={[styles.sideStatBox, stackControls && styles.stackedControl]}>
            <AppText variant="caption" style={styles.sideLabel}>나 (흑석 ★)</AppText>
            <AppText variant="title" style={styles.playerStoneCount}>
              남은 알 {alivePlayers.length}개
            </AppText>
          </View>
          <View style={styles.vsBadge}>
            <AppText variant="bodyStrong" style={{ color: '#F0BF4F' }}>VS</AppText>
          </View>
          <View style={[styles.sideStatBox, stackControls && styles.stackedControl, { alignItems: stackControls ? 'flex-start' : 'flex-end' }]}>
            <AppText variant="caption" style={styles.sideLabel}>{opponent.name} (백석)</AppText>
            <AppText variant="title" style={styles.enemyStoneCount}>
              남은 알 {aliveEnemies.length}개
            </AppText>
          </View>
        </View>
      </View>

      {pendingOpponent !== null ? (
        <ChangeConfirmation
          message={`${AI_OPPONENTS[pendingOpponent].name}으로 바꾸면 현재 대국의 진행이 사라집니다. 바꾸시겠습니까?`}
          onCancel={() => setPendingOpponent(null)}
          onConfirm={() => resetMatch(pendingOpponent)}
        />
      ) : null}
      <RoundSaveNotice status={roundSave.status} onRetry={roundSave.retry} />
      {story && storyAttemptId ? <StoryTrialNotice chapter={story} onLeave={onLeaveStory} canAbandon={aliveEnemies.length > 0} onAbandon={() => {
        recordStoryResult({ type: 'alkkagi', outcome: 'failure', chapterId: story.id, attemptId: storyAttemptId });
        resetMatch(opponentIdx);
      }} /> : null}

      {/* 일석이조 족자 배너 */}
      {scrollCallout ? (
        <View style={styles.scrollBanner}>
          <View style={styles.scrollBannerEmblem}>
            <PixelFx name="match" scale={0.42} loop />
          </View>
          <AppText variant="sectionTitle" style={styles.scrollBannerText}>
            {scrollCallout}
          </AppText>
        </View>
      ) : null}

      {/* 함께 한 판 — 최 사범 코치 패널 */}
      <CompanionCoach
        npcId={GAME_COACH.alkkagi}
        mood={aliveEnemies.length === 0 ? 'success' : 'start'}
      />

      {/* 배경에 돌 그림을 넣지 않아 누를 수 있는 돌만 보이도록 합니다. */}
      <View style={styles.boardFrame}>
        {Array.from({ length: 9 }, (_, index) => (
          <React.Fragment key={`grid-${index}`}>
            <View pointerEvents="none" style={[styles.gridVertical, { left: `${10 + index * 10}%` }]} />
            <View pointerEvents="none" style={[styles.gridHorizontal, { top: `${10 + index * 10}%` }]} />
          </React.Fragment>
        ))}

        {/* 조준선 (내 알 → 목표 상대 알) */}
        {activeShooter && activeTarget ? (
          <View
            style={[
              styles.aimTargetRing,
              { left: `${activeTarget.x}%`, top: `${activeTarget.y}%` },
            ]}
          />
        ) : null}

        {/* 바둑알 렌더링 (흑석: 금빛 별 음각, 백석: 이중 링 양각 — 색각 이상 안전) */}
        {stones.map((stone) => {
          if (!stone.alive) return null;
          const isSelectedShooter = activeShooter?.id === stone.id;
          const isSelectedTarget = activeTarget?.id === stone.id;
          const stoneImage = stone.owner === 'player' ? STONE_BLACK : STONE_WHITE;
          return (
            <Pressable
              key={stone.id}
              testID={`alkkagi-stone-${stone.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${stone.owner === 'player' ? '내 흑석' : '상대 백석'} ${stone.id.slice(1)}번`}
              accessibilityState={{ selected: isSelectedShooter || isSelectedTarget }}
              onPress={() => {
                triggerHaptic('light');
                if (stone.owner === 'player') setSelectedPlayerId(stone.id);
                else setSelectedTargetId(stone.id);
              }}
              style={[
                styles.stoneBase,
                stone.owner === 'player' && appearance.stone === 'celadon' && styles.celadonStone,
                isSelectedShooter && styles.selectedShooterRing,
                isSelectedTarget && styles.selectedTargetRing,
                { left: `${stone.x}%`, top: `${stone.y}%` },
              ]}>
              <Image source={stoneImage} style={styles.stoneSprite} contentFit="contain" />
              <AppText style={[styles.stoneLabel, stone.owner === 'player' ? styles.playerStoneLabel : styles.enemyStoneLabel]}>
                {stone.owner === 'player' ? '★' : '◎'}{stone.id.slice(1)}
              </AppText>
              {stone.owner === 'player' && appearance.stone === 'celadon' ? (
                <View testID={`celadon-stone-decoration-${stone.id}`} style={styles.celadonStoneMark} />
              ) : null}
            </Pressable>
          );
        })}

        {/* 충격 이펙트 — 맞은 알 위치에 한 번만 재생 */}
        {impactFx ? (
          <PixelFx
            key={impactFx.key}
            name="impact"
            scale={0.85}
            onDone={() => setImpactFx(null)}
            style={{
              position: 'absolute',
              left: `${impactFx.x}%`,
              top: `${impactFx.y}%`,
              marginLeft: -(FX_MANIFEST.impact.frameWidth * 0.85) / 2,
              marginTop: -(FX_MANIFEST.impact.frameHeight * 0.85) / 2,
            }}
          />
        ) : null}
      </View>

      {/* 3. 하단 조준 및 타격 컨트롤 */}
      {aliveEnemies.length === 0 ? (
        <Card style={styles.victoryCard}>
          <AppText variant="sectionTitle" style={{ color: '#0E5142' }}>
            {bannerText}
          </AppText>
          <SeniorButton
            testID="btn-alkkagi-same-opponent"
            label="같은 상대와 다시 대국하기"
            variant="secondary"
            onPress={() => resetMatch(opponentIdx)}
          />
          {!story ? <SeniorButton
            testID="btn-alkkagi-rematch"
            label="다음 사범과 새 대국 시작하기 ▶"
            variant="primary"
            onPress={() => resetMatch((opponentIdx + 1) % AI_OPPONENTS.length)}
          /> : null}
        </Card>
      ) : (
        <Card style={styles.controlCard}>
          <AppText variant="bodyStrong" style={{ color: '#182620' }}>
            {bannerText}
          </AppText>
          <AppText variant="caption" style={styles.selectionGuide}>
            내 돌 ★{activeShooter?.id.slice(1)} · 목표 돌 ◎{activeTarget?.id.slice(1)} 선택 중. 돌을 직접 누르거나 아래 버튼으로 바꾸세요.
          </AppText>

          <Image
            source={FLICK_GAUGE_UI}
            style={styles.flickGauge}
            contentFit="contain"
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />

          <View style={[styles.powerSelectRow, stackControls && styles.stackedRow]}>
            {([
              { id: 'precision', label: '정밀 타격', sub: '내 알 보호' },
              { id: 'strong', label: '강력 타격', sub: '장외 밀어내기' },
              { id: 'double', label: '일석이조 강타', sub: '2개 동시 격파' },
            ] as const).map((mode) => {
              const selected = powerMode === mode.id;
              return (
                <Pressable
                  key={mode.id}
                  testID={`alkkagi-power-${mode.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    triggerHaptic('light');
                    setPowerMode(mode.id);
                  }}
                  style={[styles.powerChip, stackControls && styles.stackedControl, selected && styles.powerChipSelected]}>
                  <AppText
                    variant="bodyStrong"
                    style={{ color: selected ? '#FFFFFF' : '#182620', textAlign: 'center' }}>
                    {mode.label}
                  </AppText>
                  <AppText
                    variant="caption"
                    style={{ color: selected ? '#FFFFFF' : '#526451', textAlign: 'center' }}>
                    {mode.sub}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.actionRow, stackControls && styles.stackedRow]}>
            <View style={stackControls ? styles.stackedControl : { flex: 1 }}>
              <SeniorButton
                testID="btn-alkkagi-switch-stone"
                label="다음 내 알 선택"
                variant="secondary"
                onPress={cycleNextShooter}
              />
            </View>
            <View style={stackControls ? styles.stackedControl : { flex: 1 }}>
              <SeniorButton
                testID="btn-alkkagi-switch-target"
                label="다음 상대 알 선택"
                variant="secondary"
                onPress={cycleNextTarget}
              />
            </View>
          </View>
          <SeniorButton testID="btn-alkkagi-flick" label="알 튕기기 (타격!)" variant="accent" onPress={handleFlick} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.md,
  },
  hudCard: {
    backgroundColor: '#24382B',
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: '#D8B384',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  oppTabsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  stackedRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  stackedControl: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    alignSelf: 'stretch',
  },
  oppTab: {
    flex: 1,
    minWidth: 48,
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: '#D8B384',
    backgroundColor: '#182620',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  oppTabActive: {
    backgroundColor: '#F0BF4F',
    borderColor: '#FCF9F2',
  },
  versusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideStatBox: {
    flex: 1,
    gap: 2,
  },
  sideLabel: {
    color: '#D8B384',
  },
  playerStoneCount: {
    color: '#FCF9F2',
    fontVariant: ['tabular-nums'],
  },
  enemyStoneCount: {
    color: '#F0BF4F',
    fontVariant: ['tabular-nums'],
  },
  vsBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: '#6E4228',
    borderWidth: 1,
    borderColor: '#F0BF4F',
  },
  scrollBanner: {
    backgroundColor: '#FFF1C7',
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: '#C2410C',
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  scrollBannerEmblem: {
    width: 58,
    height: 30,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBannerText: {
    color: '#9A3412',
    flexShrink: 1,
  },
  boardFrame: {
    width: '100%',
    height: 330,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#6E4228',
    backgroundColor: '#D8B384',
    position: 'relative',
  },
  gridVertical: { position: 'absolute', top: '10%', bottom: '10%', width: 1, backgroundColor: '#86552F' },
  gridHorizontal: { position: 'absolute', left: '10%', right: '10%', height: 1, backgroundColor: '#86552F' },
  stoneBase: {
    position: 'absolute',
    width: 48,
    height: 48,
    marginLeft: -24,
    marginTop: -24,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stoneSprite: {
    width: '100%',
    height: '100%',
  },
  stoneLabel: { position: 'absolute', fontSize: 12, lineHeight: 17, fontFamily: FontWeights.strong },
  playerStoneLabel: { color: '#FFF1C7' },
  enemyStoneLabel: { color: '#182620' },
  selectionGuide: { color: '#315B38' },
  celadonStone: {
    borderWidth: 2,
    borderColor: '#87CFB9',
  },
  celadonStoneMark: {
    position: 'absolute', right: 6, top: 5, width: 8, height: 8,
    backgroundColor: '#DDF7EC', borderColor: '#176C62', borderWidth: 1,
    transform: [{ rotate: '45deg' }],
  },
  selectedShooterRing: {
    borderWidth: 3.5,
    borderColor: '#F0BF4F',
    transform: [{ scale: 1.18 }],
    borderRadius: 26,
  },
  selectedTargetRing: {
    borderWidth: 3.5,
    borderColor: '#C2410C',
    borderRadius: 26,
  },
  aimTargetRing: {
    position: 'absolute',
    width: 56,
    height: 56,
    marginLeft: -28,
    marginTop: -28,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#C2410C',
    backgroundColor: 'rgba(194, 65, 12, 0.18)',
  },
  victoryCard: {
    backgroundColor: '#FFF1C7',
    borderColor: '#F0BF4F',
    borderWidth: 2,
    gap: Spacing.md,
  },
  controlCard: {
    backgroundColor: '#FCF9F2',
    borderColor: '#6E4228',
    borderWidth: 2,
    gap: Spacing.sm,
  },
  flickGauge: {
    width: 220,
    aspectRatio: 2,
    alignSelf: 'center',
    marginBottom: 2,
  },
  powerSelectRow: {
    flexDirection: 'row',
    gap: 6,
  },
  powerChip: {
    flex: 1,
    minWidth: 48,
    minHeight: 54,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: '#6E4228',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  powerChipSelected: {
    backgroundColor: '#C2410C',
    borderColor: '#9A3412',
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 4,
  },
});
