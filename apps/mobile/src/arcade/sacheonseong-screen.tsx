import { Image, type ImageProps } from 'expo-image';
import { randomUUID } from 'expo-crypto';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, Screen, SeniorButton } from '@/components/ui';
import { FontWeights, Layout, Radius, Spacing } from '@/constants/theme';

import { playSfx } from '@/audio/sound-manager';

import {
  SACHEONSEONG_MOTIFS,
  createSacheonseongBoard,
  findFirstSacheonseongHint,
  findSacheonseongPath,
  shuffleSacheonseongBoard,
  type SacheonseongCell,
} from './arcade-logic';
import { useArcade } from './arcade-store';
import { CompanionCoach } from '@/rpg/companion-coach';
import { GAME_COACH } from '@/rpg/companion-lines';
import { useRpg } from '@/rpg/rpg-store';
import { getRpgStorage } from '@/rpg/rpg-db';
import { isTileRound, loadRoundState } from './round-save';
import { RoundSaveNotice, useRoundSave } from './round-save-notice';
import { TILE_GAP, TILE_HEIGHT, TILE_PATH_GUTTER, TILE_WIDTH, sacheonseongPathSegments } from './sacheonseong-layout';
import { PixelFx } from '@/fx/pixel-fx';
import { getStoryTrial, StoryTrialNotice } from './story-trial';

const TILE_SET_IMAGE = require('../../assets/game/rpg/pixel/arcade/sacheonseong_tile_set.png');
const MAT_BOARD_TEXTURE = require('../../assets/game/rpg/pixel/arcade/board_sacheonseong.png');
const MAGNIFIER_ICON = require('../../assets/game/rpg/ui/ui_icon_magnifier_01.png');
const SHUFFLE_ICON = require('../../assets/game/rpg/ui/ui_icon_shuffle_01.png');
const ROUND_KEY = 'senior_club_tile_round_v1';

const TILE_IMAGES: Record<string, NonNullable<ImageProps['source']>> = {
  crane: require('../../assets/game/rpg/pixel/tileset/tile_crane.png'),
  plum: require('../../assets/game/rpg/pixel/tileset/tile_plum.png'),
  maple: require('../../assets/game/rpg/pixel/tileset/tile_maple.png'),
  moon: require('../../assets/game/rpg/pixel/tileset/tile_moon.png'),
  celadon: require('../../assets/game/rpg/pixel/tileset/tile_celadon.png'),
  turtle: require('../../assets/game/rpg/pixel/tileset/tile_turtle.png'),
  peony: require('../../assets/game/rpg/pixel/tileset/tile_peony.png'),
  bamboo: require('../../assets/game/rpg/pixel/tileset/tile_bamboo.png'),
};

export function SacheonseongTileScreen({ storyChapter, onLeaveStory }: { storyChapter?: string; onLeaveStory?: () => void } = {}) {
  const { recordSacheonseongClear, triggerHaptic, state, appearance } = useArcade();
  const { completeQuestStep, recordGameWithNpc, recordStoryResult } = useRpg();
  const [storage] = useState(getRpgStorage);
  const story = getStoryTrial(storyChapter, 'sacheonseong');
  const roundKey = story ? `${ROUND_KEY}_story_${story.id}` : ROUND_KEY;
  const [loadedRound] = useState(() => loadRoundState(storage, roundKey, isTileRound));
  const savedRound = loadedRound.value;
  const [stageNum, setStageNum] = useState(savedRound?.stageNum ?? 1);
  const [board, setBoard] = useState<SacheonseongCell[][]>(() => savedRound?.board ?? createSacheonseongBoard(4, 6));
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [hintPair, setHintPair] = useState<[{ row: number; col: number }, { row: number; col: number }] | null>(null);
  const [activeMatchPath, setActiveMatchPath] = useState<{ row: number; col: number }[] | null>(null);
  const [combo, setCombo] = useState(savedRound?.combo ?? 0);
  const [maxCombo, setMaxCombo] = useState(savedRound?.maxCombo ?? 0);
  const [statusMessage, setStatusMessage] = useState(
    savedRound?.statusMessage ?? '같은 전통 문양 패 2장을 눌러 연결하세요 (2회 이하 꺾임 연결 가능).',
  );
  const [storyAttemptId, setStoryAttemptId] = useState(() => story ? savedRound?.storyAttemptId ?? randomUUID() : undefined);
  const roundSave = useRoundSave(storage, roundKey, loadedRound, { stageNum, board, combo, maxCombo, statusMessage, storyAttemptId });

  React.useEffect(() => {
    if (!activeMatchPath) return;
    const timer = setTimeout(() => setActiveMatchPath(null), 900);
    return () => clearTimeout(timer);
  }, [activeMatchPath]);

  const remainingCount = useMemo(
    () => board.reduce((sum, row) => sum + row.filter((c) => c.motifId !== null).length, 0),
    [board],
  );

  const startNewStage = (nextStage = stageNum + 1) => {
    triggerHaptic('light');
    setStageNum(nextStage);
    setBoard(createSacheonseongBoard(4, 6));
    setSelectedCell(null);
    setHintPair(null);
    setActiveMatchPath(null);
    setCombo(0);
    setMaxCombo(0);
    if (story) setStoryAttemptId(randomUUID());
    setStatusMessage(`제${nextStage}국 전통 패 사천성 대국이 시작되었습니다!`);
  };

  const shuffleRemainingTiles = () => {
    triggerHaptic('medium');
    const nextBoard = shuffleSacheonseongBoard(board);
    setBoard(nextBoard);
    setSelectedCell(null);
    setHintPair(null);
    setActiveMatchPath(null);
    setStatusMessage(findFirstSacheonseongHint(nextBoard)
      ? '남은 패를 다시 섞었습니다. 돋보기로 연결할 짝을 확인할 수 있습니다.'
      : '남은 패를 섞었지만 연결할 짝을 찾지 못했습니다.');
  };

  const handleShowHint = () => {
    triggerHaptic('light');
    const found = findFirstSacheonseongHint(board);
    setSelectedCell(null);
    setActiveMatchPath(null);
    if (found) {
      setHintPair(found);
      const motif = SACHEONSEONG_MOTIFS.find((m) => m.id === board[found[0].row][found[0].col].motifId);
      setStatusMessage(`돋보기 힌트: [${motif?.name ?? '동일'} (${motif?.hanja ?? ''})] 두 패와 연결 경로를 표시했습니다.`);
    } else {
      setHintPair(null);
      setStatusMessage('연결할 수 있는 짝이 없습니다. [패 다시 섞기]를 눌러 주세요.');
    }
  };

  const handleTilePress = (row: number, col: number) => {
    const target = board[row]?.[col];
    if (!target?.motifId) return;

    if (!selectedCell) {
      triggerHaptic('light');
      setSelectedCell({ row, col });
      if (hintPair && !hintPair.some((cell) => cell.row === row && cell.col === col)) setHintPair(null);
      setStatusMessage(`${SACHEONSEONG_MOTIFS.find((motif) => motif.id === target.motifId)?.name ?? '패'} 선택. 같은 패를 하나 더 누르세요. 다시 누르면 선택이 취소됩니다.`);
      return;
    }

    if (selectedCell.row === row && selectedCell.col === col) {
      setSelectedCell(null);
      setStatusMessage('선택을 취소했습니다. 같은 패 두 장을 눌러 주세요.');
      return;
    }

    const path = findSacheonseongPath(board, selectedCell, { row, col });
    if (!path) {
      triggerHaptic('light');
      setSelectedCell({ row, col });
      setHintPair(null);
      setCombo(0);
      setStatusMessage('다른 패에 막혀 있거나 문양이 달라 연속 성공이 끊겼습니다. 새롭게 선택한 패부터 이어갑니다.');
      return;
    }

    // Valid match!
    triggerHaptic('medium');
    playSfx('tileMatch', state.soundEnabled);
    setActiveMatchPath(path);
    const matchedMotif = SACHEONSEONG_MOTIFS.find((m) => m.id === target.motifId);
    const nextBoard = board.map((r) =>
      r.map((c) => {
        if ((c.row === selectedCell.row && c.col === selectedCell.col) || (c.row === row && c.col === col)) {
          return { ...c, motifId: null };
        }
        return c;
      }),
    );
    const nextCombo = combo + 1;
    const nextMaxCombo = Math.max(maxCombo, nextCombo);
    setBoard(nextBoard);
    setSelectedCell(null);
    setHintPair(null);
    setCombo(nextCombo);
    setMaxCombo(nextMaxCombo);
    if (nextCombo >= 3) playSfx('combo', state.soundEnabled);

    const leftAfter = nextBoard.reduce((sum, r) => sum + r.filter((c) => c.motifId !== null).length, 0);
    if (leftAfter === 0) {
      playSfx('chime', state.soundEnabled);
      const storyNote = story ? (nextMaxCombo >= 3 ? ' 이야기 목표를 마쳤습니다.' : ' 이야기 목표인 3연속에 이르지 못해 다시 도전할 수 있습니다.') : '';
      setStatusMessage(`🎉 제${stageNum}국 모든 전통 패 제거 완료! (+${170 + nextMaxCombo * 10} CP · 인장 +1)${storyNote}`);
      recordSacheonseongClear(nextMaxCombo);
      completeQuestStep('sacheonseong');
      if (story && storyAttemptId) recordStoryResult({ type: 'sacheonseong', maxCombo: nextMaxCombo, chapterId: story.id, attemptId: storyAttemptId });
      recordGameWithNpc(GAME_COACH.sacheonseong);
    } else {
      setStatusMessage(
        `착-딱! [${matchedMotif?.name ?? ''} (${matchedMotif?.hanja ?? ''})] 짝맞춤 성공! (${nextCombo}연속 콤보!)`,
      );
    }
  };

  const visiblePath = activeMatchPath ?? (hintPair ? findSacheonseongPath(board, hintPair[0], hintPair[1]) : null);

  return (
    <Screen testID="sacheonseong-screen" contentContainerStyle={styles.container}>
      {/* 1. 상단 스테이지 & 남은 패 & 콤보 HUD */}
      <View style={styles.hudCard}>
        <View style={styles.hudTopRow}>
          <View>
            <AppText variant="caption" style={{ color: '#D8B384' }}>
              전통 길상 문양 사천성
            </AppText>
            <AppText variant="sectionTitle" style={{ color: '#FCF9F2' }}>
              제{stageNum}국 · 매화 다실
            </AppText>
          </View>
          <View style={styles.comboBadge}>
            <AppText variant="bodyStrong" style={{ color: '#182620' }}>
              {combo > 0 ? `${combo}연속 성공!` : '연타 대기'}
            </AppText>
          </View>
        </View>
        <View style={styles.hudBottomRow}>
          <AppText variant="title" style={styles.remainingText}>
            남은 패 {remainingCount}장
          </AppText>
          <AppText variant="caption" style={{ color: '#E4EDDA' }}>
            최고 {maxCombo}연타 · 문양+한자 이중 표기
          </AppText>
        </View>
      </View>
      <RoundSaveNotice status={roundSave.status} onRetry={roundSave.retry} />
      {story && storyAttemptId ? <StoryTrialNotice chapter={story} onLeave={onLeaveStory} canAbandon={remainingCount > 0} onAbandon={() => {
        recordStoryResult({ type: 'sacheonseong', outcome: 'failure', chapterId: story.id, attemptId: storyAttemptId });
        startNewStage(stageNum);
      }} /> : null}

      {/* 함께 한 판 — 이 다도명인 코치 패널 */}
      <CompanionCoach
        npcId={GAME_COACH.sacheonseong}
        mood={remainingCount === 0 ? 'success' : 'start'}
      />

      {/* 2. 솔잎색 다포(茶布) 매트 보드 & 고대비 원목·상아 타일 그리드 */}
      <AppText variant="caption" style={styles.boardGuide}>패는 가로로 밀어 전체를 볼 수 있습니다. 표시된 선은 빈 칸이나 바깥쪽으로 이어집니다.</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="사천성 패판, 좌우로 스크롤 가능">
      <View style={styles.matBoard}>
        <Image
          source={MAT_BOARD_TEXTURE}
          style={styles.matBoardTexture}
          contentFit="cover"
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <View style={styles.tileGrid}>
        {board.map((row, rIdx) => (
          <View key={`row-${rIdx}`} style={styles.gridRow}>
            {row.map((cell) => {
              if (!cell.motifId) {
                return <View key={`empty-${cell.row}-${cell.col}`} style={styles.emptySlot} />;
              }
              const motif =
                SACHEONSEONG_MOTIFS.find((m) => m.id === cell.motifId) ?? SACHEONSEONG_MOTIFS[0];
              const isSelected =
                selectedCell?.row === cell.row && selectedCell?.col === cell.col;
              const isHinted =
                (hintPair?.[0].row === cell.row && hintPair?.[0].col === cell.col) ||
                (hintPair?.[1].row === cell.row && hintPair?.[1].col === cell.col);
              const tileImg = TILE_IMAGES[cell.motifId];

              return (
                <Pressable
                  key={`tile-${cell.row}-${cell.col}`}
                  testID={`sacheonseong-tile-${cell.row}-${cell.col}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${motif.name} 패 (${motif.hanja}), ${cell.row + 1}행 ${cell.col + 1}열${isHinted ? ', 힌트' : ''}`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => handleTilePress(cell.row, cell.col)}
                  style={[
                    styles.tileOuter,
                    appearance.tile === 'plum' && styles.plumTile,
                    isHinted && styles.tileHinted,
                    isSelected && styles.tileSelected,
                  ]}>
                  <View style={styles.tileImageWrapper}>
                    {tileImg ? (
                      <Image source={tileImg} style={styles.tileImage} contentFit="cover" />
                    ) : (
                      <View style={styles.tileTopFace}>
                        <AppText style={styles.symbolText}>{motif.symbol}</AppText>
                      </View>
                    )}
                    {appearance.tile === 'plum' ? <View style={styles.plumTileMark} pointerEvents="none" /> : null}
                    <View style={[styles.hanjaCorner, { backgroundColor: 'rgba(255,255,255,0.92)' }]}>
                      <AppText
                        variant="caption"
                        style={[styles.hanjaText, { color: motif.accentColor }]}>
                        {motif.hanja}
                      </AppText>
                    </View>
                    {isSelected || isHinted ? (
                      <View style={[styles.tileStatusBadge, isSelected && styles.selectedBadge]} pointerEvents="none">
                        <AppText style={styles.tileStatusText}>{isSelected ? '선택' : '힌트'}</AppText>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
        {visiblePath ? (
          <View style={styles.matchPathOverlay} pointerEvents="none" testID="sacheonseong-match-path">
            {sacheonseongPathSegments(visiblePath, board.length, board[0]?.length ?? 0).map((segment, index) => (
              <View key={`segment-${index}`} testID={`sacheonseong-path-segment-${index}`} style={[styles.matchPathSegment, segment]} />
            ))}
          </View>
        ) : null}
        </View>
      </View>
      </ScrollView>

      {/* 3. 진행 안내 및 56dp 보조 도구 바 (돋보기 힌트 / 패 섞기) */}
      <Card style={styles.controlCard}>
        <AppText variant="bodyStrong" style={{ color: '#182620' }}>
          {statusMessage}
        </AppText>

        {remainingCount === 0 ? (
          <View style={styles.stageClearCelebration}>
            <View style={styles.stageClearVfx}>
              <PixelFx name="promotion" scale={0.42} loop />
            </View>
            <SeniorButton
              testID="btn-sacheonseong-next"
              label={story ? '이야기 도전 다시 하기' : '다음 스테이지 대국 시작하기 ▶'}
              variant="accent"
              onPress={() => startNewStage(story ? stageNum : stageNum + 1)}
            />
          </View>
        ) : (
          <>
            <View style={styles.toolLegendRow}>
              <View style={styles.toolLegendItem}>
                <Image
                  source={MAGNIFIER_ICON}
                  style={styles.toolLegendIcon}
                  contentFit="contain"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
                <AppText variant="caption" style={styles.toolLegendText}>
                  돋보기 — 이어질 짝 위치를 비춰줍니다
                </AppText>
              </View>
              <View style={styles.toolLegendItem}>
                <Image
                  source={SHUFFLE_ICON}
                  style={styles.toolLegendIcon}
                  contentFit="contain"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
                <AppText variant="caption" style={styles.toolLegendText}>
                  섞기 — 패를 다시 섞습니다
                </AppText>
              </View>
            </View>
            <View style={styles.toolRow}>
              <View style={{ flex: 1 }}>
                <SeniorButton
                  testID="btn-sacheonseong-hint"
                  label="🔍 돋보기 힌트"
                  variant="accent"
                  onPress={handleShowHint}
                />
              </View>
              <View style={{ flex: 1 }}>
                <SeniorButton
                  testID="btn-sacheonseong-shuffle"
                  label="🔄 패 다시 섞기"
                  variant="secondary"
                  onPress={shuffleRemainingTiles}
                />
              </View>
            </View>
          </>
        )}
      </Card>

      {/* 4. 전통 길상 문양 원목·상아 패 도감 프리뷰 (ASSET-019) */}
      <Card style={styles.tileGuideCard}>
        <AppText variant="bodyStrong" style={{ color: '#182620' }}>
          전통 길상 문양 원목·상아 패 도감
        </AppText>
        <Image source={TILE_SET_IMAGE} style={styles.tileGuideImage} contentFit="contain" />
      </Card>
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
    backgroundColor: '#0E5142',
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: '#D8B384',
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  hudTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  comboBadge: {
    backgroundColor: '#F0BF4F',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  hudBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 4,
  },
  remainingText: {
    color: '#F0BF4F',
    fontVariant: ['tabular-nums'],
  },
  matBoard: {
    backgroundColor: '#0E5142',
    borderRadius: Radius.lg,
    borderWidth: 4,
    borderColor: '#6E4228',
    position: 'relative',
  },
  boardGuide: { color: '#315B38' },
  tileGrid: { padding: TILE_PATH_GUTTER, gap: TILE_GAP, position: 'relative' },
  matBoardTexture: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: Radius.lg,
    zIndex: 0,
  },
  gridRow: {
    flexDirection: 'row',
    gap: TILE_GAP,
    zIndex: 1,
  },
  emptySlot: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(24, 38, 32, 0.25)',
  },
  tileOuter: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: Radius.sm,
    backgroundColor: '#D8B384',
    borderWidth: 2,
    borderColor: '#6E4228',
    overflow: 'hidden',
  },
  tileSelected: {
    borderColor: '#F0BF4F',
    borderWidth: 3,
  },
  plumTile: {
    borderColor: '#9B3450',
    borderWidth: 3,
  },
  plumTileMark: {
    position: 'absolute', right: 2, bottom: 2, width: 7, height: 7,
    backgroundColor: '#E49AA7', borderColor: '#FCF9F2', borderWidth: 1,
    transform: [{ rotate: '45deg' }],
  },
  tileHinted: {
    borderColor: '#C2410C',
    borderWidth: 3.5,
  },
  tileImageWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileTopFace: {
    flex: 1,
    backgroundColor: '#FCF9F2',
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingTop: 10,
  },
  hanjaCorner: {
    position: 'absolute',
    top: 3,
    left: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#D8B384',
  },
  hanjaText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: FontWeights.strong,
  },
  tileStatusBadge: { position: 'absolute', right: 0, bottom: 0, paddingHorizontal: 2, backgroundColor: '#9A3412' },
  selectedBadge: { backgroundColor: '#0E5142' },
  tileStatusText: { color: '#FFFFFF', fontSize: 11, lineHeight: 15, fontFamily: FontWeights.strong },
  symbolText: {
    fontSize: 22,
    lineHeight: 26,
  },
  matchPathOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  matchPathSegment: { position: 'absolute', backgroundColor: '#F0BF4F', borderWidth: 1, borderColor: '#182620', borderRadius: 3 },
  motifNameText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: FontWeights.emphasis,
  },
  controlCard: {
    backgroundColor: '#FCF9F2',
    borderColor: '#6E4228',
    borderWidth: 2,
    gap: Spacing.sm,
  },
  toolRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  toolLegendRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingBottom: 2,
  },
  toolLegendItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toolLegendIcon: {
    width: 20,
    height: 20,
    flexShrink: 0,
  },
  toolLegendText: {
    color: '#526451',
    flexShrink: 1,
    lineHeight: 16,
  },
  stageClearCelebration: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  stageClearVfx: {
    width: 84,
    height: 59,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  tileGuideCard: {
    backgroundColor: '#FCF9F2',
    borderColor: '#D8B384',
    borderWidth: 1.5,
    gap: Spacing.xs,
  },
  tileGuideImage: {
    width: '100%',
    height: 132,
  },
});
