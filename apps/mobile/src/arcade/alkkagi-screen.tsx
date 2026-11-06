import { Image } from 'expo-image';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, Screen, SeniorButton } from '@/components/ui';
import { FontWeights, Layout, Radius, Spacing } from '@/constants/theme';

import { playSfx } from '@/audio/sound-manager';

import { createInitialAlkkagiStones, executeAlkkagiFlick, type AlkkagiStone } from './arcade-logic';
import { useArcade } from './arcade-store';
import { CompanionCoach } from '@/rpg/companion-coach';
import { GAME_COACH } from '@/rpg/companion-lines';
import { useRpg } from '@/rpg/rpg-store';
import { getRpgStorage } from '@/rpg/rpg-db';
import { isAlkkagiRound, loadRound, saveRound } from './round-save';
import { PixelFx } from '@/fx/pixel-fx';
import { FX_MANIFEST } from '@/fx/fx-manifest';

const ALKKAGI_BOARD = require('../../assets/game/rpg/pixel/arcade/board_alkkagi.png');
const STONE_BLACK = require('../../assets/game/rpg/pixel/arcade/stone_black.png');
const STONE_WHITE = require('../../assets/game/rpg/pixel/arcade/stone_white.png');
const PAPERWEIGHT_PROP = require('../../assets/game/rpg/pixel/props/spr_alkkagi_paperweight_01.png');
const CELADON_CUP_PROP = require('../../assets/game/rpg/pixel/props/spr_alkkagi_celadon_cup_01.png');
const FLICK_GAUGE_UI = require('../../assets/game/rpg/ui/ui_alkkagi_flick_gauge_01.png');
const ROUND_KEY = 'senior_club_alkkagi_round_v1';

const AI_OPPONENTS = [
  { id: '18k', name: '18급 박 회원', title: '입문 대국' },
  { id: '9k', name: '9급 최 유단자', title: '정석 대국' },
  { id: 'master', name: '명인 김 사범', title: '명인 초청전' },
] as const;

export function AlkkagiBoardScreen() {
  const { recordAlkkagiWin, triggerHaptic, state, appearance } = useArcade();
  const { completeQuestStep, recordGameWithNpc, recordStoryResult } = useRpg();
  const [savedRound] = useState(() => loadRound(getRpgStorage(), ROUND_KEY, isAlkkagiRound));
  const [opponentIdx, setOpponentIdx] = useState(savedRound?.opponentIdx ?? 0);
  const opponent = AI_OPPONENTS[opponentIdx] ?? AI_OPPONENTS[0];

  const [stones, setStones] = useState<AlkkagiStone[]>(() => savedRound?.stones ?? createInitialAlkkagiStones());
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(savedRound?.selectedPlayerId ?? 'p2');
  const [selectedTargetId, setSelectedTargetId] = useState<string>(savedRound?.selectedTargetId ?? 'a2');
  const [powerMode, setPowerMode] = useState<'precision' | 'strong' | 'double'>(savedRound?.powerMode ?? 'double');
  const [matchDoubleKnockouts, setMatchDoubleKnockouts] = useState(savedRound?.matchDoubleKnockouts ?? 0);
  const [bannerText, setBannerText] = useState<string>(
    savedRound?.bannerText ?? '내 흑석(★)과 조준할 백석(◎)을 고른 뒤 [알 튕기기 (타격!)]를 누르세요.',
  );
  React.useEffect(() => {
    saveRound(getRpgStorage(), ROUND_KEY, { opponentIdx, stones, selectedPlayerId, selectedTargetId, powerMode, matchDoubleKnockouts, bannerText });
  }, [opponentIdx, stones, selectedPlayerId, selectedTargetId, powerMode, matchDoubleKnockouts, bannerText]);
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
    setBannerText(`${AI_OPPONENTS[nextOppIdx].name}과의 새 대국이 시작되었습니다!`);
  };

  const cycleNextShooter = () => {
    if (!alivePlayers.length) return;
    triggerHaptic('light');
    const idx = alivePlayers.findIndex((s) => s.id === activeShooter?.id);
    const next = alivePlayers[(idx + 1) % alivePlayers.length];
    setSelectedPlayerId(next.id);
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
      setBannerText(`🎉 대국 승리! 상대 알을 모두 장외로 밀어냈습니다! (+${160 + nextDoubleCount * 50} CP)`);
      recordAlkkagiWin(nextDoubleCount);
      completeQuestStep('alkkagi');
      recordStoryResult({ type: 'alkkagi', doubleKnockouts: nextDoubleCount });
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
        <View style={styles.oppTabsRow}>
          {AI_OPPONENTS.map((opp, idx) => {
            const active = idx === opponentIdx;
            return (
              <Pressable
                key={opp.id}
                accessibilityRole="button"
                onPress={() => resetMatch(idx)}
                style={[styles.oppTab, active && styles.oppTabActive]}>
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
          })}
        </View>

        <View style={styles.versusRow}>
          <View style={styles.sideStatBox}>
            <AppText variant="caption" style={styles.sideLabel}>나 (흑석 ★)</AppText>
            <AppText variant="title" style={styles.playerStoneCount}>
              남은 알 {alivePlayers.length}개
            </AppText>
          </View>
          <View style={styles.vsBadge}>
            <AppText variant="bodyStrong" style={{ color: '#F0BF4F' }}>VS</AppText>
          </View>
          <View style={[styles.sideStatBox, { alignItems: 'flex-end' }]}>
            <AppText variant="caption" style={styles.sideLabel}>{opponent.name} (백석)</AppText>
            <AppText variant="title" style={styles.enemyStoneCount}>
              남은 알 {aliveEnemies.length}개
            </AppText>
          </View>
        </View>
      </View>

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

      {/* 2. 비자나무 원목 바둑판 보드 (ASSET-013) + 인터랙티브 흑석/백석 */}
      <View style={styles.boardFrame}>
        <Image source={ALKKAGI_BOARD} style={styles.boardImage} contentFit="cover" />
        <View style={styles.boardScrim} />

        {/* 보드 베젤 소품 (Art Bible §6: 소품은 외곽 베젤에만, 플레이 영역 침범 금지)
            - 좌하단 벼루 누르개 / 우하단 청자 잔: 알이 없는 양 모서리에만 걸치도록 배치
            - pointerEvents none + 알보다 먼저 렌더되어 알이 항상 위에 그려짐 */}
        <Image
          source={PAPERWEIGHT_PROP}
          style={styles.bezelPaperweight}
          contentFit="contain"
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <Image
          source={CELADON_CUP_PROP}
          style={styles.bezelCeladonCup}
          contentFit="contain"
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />

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
              accessibilityLabel={stone.owner === 'player' ? `내 흑석 ${stone.id}` : `상대 백석 ${stone.id}`}
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
            testID="btn-alkkagi-rematch"
            label="다음 사범과 새 대국 시작하기 ▶"
            variant="primary"
            onPress={() => resetMatch((opponentIdx + 1) % AI_OPPONENTS.length)}
          />
        </Card>
      ) : (
        <Card style={styles.controlCard}>
          <AppText variant="bodyStrong" style={{ color: '#182620' }}>
            {bannerText}
          </AppText>

          <Image
            source={FLICK_GAUGE_UI}
            style={styles.flickGauge}
            contentFit="contain"
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />

          <View style={styles.powerSelectRow}>
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
                  onPress={() => {
                    triggerHaptic('light');
                    setPowerMode(mode.id);
                  }}
                  style={[styles.powerChip, selected && styles.powerChipSelected]}>
                  <AppText
                    variant="bodyStrong"
                    style={{ color: selected ? '#FCF9F2' : '#182620' }}>
                    {mode.label}
                  </AppText>
                  <AppText
                    variant="caption"
                    style={{ color: selected ? '#FDE7DF' : '#526451', fontSize: 12 }}>
                    {mode.sub}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actionRow}>
            <View style={{ flex: 1 }}>
              <SeniorButton
                testID="btn-alkkagi-switch-stone"
                label="다음 내 알 선택"
                variant="secondary"
                onPress={cycleNextShooter}
              />
            </View>
            <View style={{ flex: 1.4 }}>
              <SeniorButton
                testID="btn-alkkagi-flick"
                label="알 튕기기 (타격!)"
                variant="accent"
                onPress={handleFlick}
              />
            </View>
          </View>
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
  oppTab: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: '#D8B384',
    backgroundColor: '#182620',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
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
  boardImage: {
    width: '100%',
    height: '100%',
  },
  boardScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(216, 179, 132, 0.28)',
  },
  bezelPaperweight: {
    position: 'absolute',
    left: -6,
    bottom: -8,
    width: '17%',
    aspectRatio: 258 / 221,
    opacity: 0.95,
  },
  bezelCeladonCup: {
    position: 'absolute',
    right: -4,
    bottom: -6,
    width: '13%',
    aspectRatio: 194 / 162,
    opacity: 0.95,
  },
  stoneBase: {
    position: 'absolute',
    width: 46,
    height: 46,
    marginLeft: -23,
    marginTop: -23,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stoneSprite: {
    width: '100%',
    height: '100%',
  },
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
