import { Image } from 'expo-image';
import { randomUUID } from 'expo-crypto';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { PixelRadius } from '@/components/game/pixel-theme';
import { playSfx } from '@/audio/sound-manager';
import { FocusedBackgroundAudio } from '@/audio/focused-background-audio';
import { AppText, Card, Screen, SeniorButton } from '@/components/ui';
import { Layout, Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/fx/use-reduce-motion';
import { useAppState } from '@/hooks/use-app-state';
import { useWorldActive } from '@/world/use-world-active';

import { PARK_GOLF_HOLES } from './arcade-logic';
import { ParkGolfBoard, powerLabel, type ParkGolfMode } from './park-golf-board';
import { ParkGolfControls, useScreenReaderEnabled } from './park-golf-controls';
import { buttonShot, rollParkGolfShot, type ParkGolfRoll, type ParkGolfShot, type ParkGolfStepEvents, type Point } from './park-golf-physics';
import { useParkGolfRoll } from './park-golf-roll';
import { useArcade } from './arcade-store';
import { parkGolfStars } from './round-stars';
import { RoundStarsView } from './round-stars-view';
import { ArcadeSaveNotice } from './arcade-save-notice';
import { ArcadeQuickSettings } from './arcade-quick-settings';
import { CompanionCoach } from '@/rpg/companion-coach';
import { GAME_COACH } from '@/rpg/companion-lines';
import { useRpg } from '@/rpg/rpg-store';
import { getRpgStorage } from '@/rpg/rpg-db';
import { isGolfRound, loadRoundState } from './round-save';
import { RoundSaveNotice, useRoundSave } from './round-save-notice';
import { ChangeConfirmation } from './change-confirmation';
import { getStoryTrial, StoryTrialNotice } from './story-trial';
import { BGM_CLUB_LOUNGE } from '@/audio/bgm';

const ROUND_KEY = 'senior_club_golf_round_v1';

const CLUB_BALL_SET = require('../../assets/game/rpg/pixel/arcade/equip_club_ball_set.png');
const AIM_SLOPE_FLOURISH = require('../../assets/game/rpg/ui/ui_parkgolf_aim_slope_01.png');
const PUTTER_NAMES = {
  persimmon: '감나무 황동 퍼터', redwood: '적삼목 클래식',
  master_gold: '명인 금장 퍼터', nacre: '매화 나전 퍼터',
} as const;

const DRAG_HELP = '코스를 누른 채 뒤로 당겼다 놓으면 공이 굴러갑니다.';

/** 홀인하지 못한 샷이 멈춘 뒤의 안내 문구. */
function missNote(result: ParkGolfRoll, cupRadius: number): string {
  const left = `남은 거리 ${result.distanceToCup}m`;
  if (result.lippedOut && result.distanceToCup <= cupRadius) return '홀컵 테두리에 걸렸어요! 살짝만 쳐도 들어갑니다.';
  if (result.lippedOut) return `너무 세서 홀컵 테두리를 맞고 튕겨 나갔습니다. ${left}`;
  if (result.hitBunker) return `모래 벙커에서 힘이 크게 줄었습니다. ${left}`;
  if (result.bouncedBumper || result.bouncedWall) return `${result.bouncedBumper ? '범퍼' : '코스 벽'}에 튕겼습니다. ${left}`;
  return `홀컵까지 ${result.distanceToCup}m 남았습니다.`;
}

export function ParkGolfArcadeScreen({ storyChapter, onLeaveStory }: { storyChapter?: string; onLeaveStory?: () => void } = {}) {
  const { width, fontScale } = useWindowDimensions();
  const { largeTextEnabled } = useAppState();
  const stackControls = width < 360 || fontScale >= 1.3 || largeTextEnabled;
  const { state, appearance, recordParkGolfClear, triggerHaptic } = useArcade();
  const { completeQuestStep, recordGameWithNpc, recordStoryResult, advanceOnboarding } = useRpg();
  const [storage] = useState(getRpgStorage);
  const story = getStoryTrial(storyChapter, 'parkgolf');
  const coach = story?.id === 'chapter_4' ? 'herbalist' : story?.id === 'chapter_6' ? 'chief' : GAME_COACH.parkgolf;
  const roundKey = story ? `${ROUND_KEY}_story_${story.id}` : ROUND_KEY;
  const [loadedRound] = useState(() => loadRoundState(storage, roundKey, isGolfRound));
  const savedRound = loadedRound.value;
  const [holeIndex, setHoleIndex] = useState(savedRound?.holeIndex ?? (story?.id === 'chapter_6' ? 2 : 0));
  const hole = PARK_GOLF_HOLES[holeIndex] ?? PARK_GOLF_HOLES[0];

  const [ballPos, setBallPos] = useState<{ x: number; y: number }>(savedRound?.ballPos ?? hole.tee);
  const [ballX] = useState(() => new Animated.Value(0));
  const [ballY] = useState(() => new Animated.Value(0));
  const boardSize = useRef({ width: 0, height: 0 });
  const roller = useParkGolfRoll();
  const { rolling, settle } = roller;
  const reduceMotion = useReduceMotion();
  const screenActive = useWorldActive();
  const screenReader = useScreenReaderEnabled();
  const [chosenMode, setChosenMode] = useState<ParkGolfMode | null>(null);
  const mode: ParkGolfMode = chosenMode ?? (screenReader ? 'button' : 'drag');
  const placeBall = (position: Point) => {
    ballX.setValue(position.x * boardSize.current.width / 100);
    ballY.setValue(position.y * boardSize.current.height / 100);
  };
  useEffect(() => {
    // 화면을 떠나거나 움직임을 줄이면 굴리기를 건너뛰고 바로 결과를 확정합니다.
    if (reduceMotion === true || !screenActive) settle();
  }, [reduceMotion, screenActive, settle]);
  const [strokes, setStrokes] = useState(savedRound?.strokes ?? 0);
  const shotPending = useRef(false);
  useEffect(() => { shotPending.current = false; }, [strokes, holeIndex]);
  const [aimAngle, setAimAngle] = useState<number>(savedRound?.aimAngle ?? 0);
  const [powerStep, setPowerStep] = useState<1 | 2 | 3>(savedRound?.powerStep ?? 2);
  const [holedBanner, setHoledBanner] = useState<string | null>(savedRound?.holedBanner ?? null);
  const [lastShotNote, setLastShotNote] = useState<string>(
    savedRound?.lastShotNote ?? DRAG_HELP,
  );
  const [storyAttemptId, setStoryAttemptId] = useState(() => story ? savedRound?.storyAttemptId ?? randomUUID() : undefined);

  const roundSave = useRoundSave(storage, roundKey, loadedRound, { holeIndex, ballPos, strokes, aimAngle, powerStep, holedBanner, lastShotNote, storyAttemptId });
  const [pendingHole, setPendingHole] = useState<number | null>(null);
  const [pendingRestart, setPendingRestart] = useState(false);

  const aimedShot = useMemo(() => buttonShot(hole, ballPos, aimAngle, powerStep), [hole, ballPos, aimAngle, powerStep]);
  const preview = useMemo(() => rollParkGolfShot(hole, ballPos, aimedShot), [hole, ballPos, aimedShot]);
  const blocked = pendingRestart || pendingHole !== null;
  // 당기는 동안에는 화면이 같이 밀리지 않도록 스크롤을 잠급니다.
  const [aiming, setAiming] = useState(false);

  const startHole = (idx: number) => {
    const nextHole = PARK_GOLF_HOLES[idx] ?? PARK_GOLF_HOLES[0];
    roller.cancel();
    shotPending.current = false;
    placeBall(nextHole.tee);
    triggerHaptic('light');
    setHoleIndex(idx);
    setBallPos(nextHole.tee);
    setStrokes(0);
    setAimAngle(0);
    setPowerStep(2);
    setHoledBanner(null);
    if (story) setStoryAttemptId(randomUUID());
    setPendingHole(null);
    setPendingRestart(false);
    setLastShotNote(`${nextHole.title} (PAR ${nextHole.par}) 라운딩을 시작합니다.`);
  };

  const selectHole = (idx: number) => {
    setPendingRestart(false);
    if (idx === holeIndex) {
      setPendingHole(null);
      return;
    }
    if (strokes > 0 && !holedBanner) setPendingHole(idx);
    else startHole(idx);
  };

  const finishShot = (result: ParkGolfRoll) => {
    placeBall(result.finalPos);
    const nextStrokes = strokes + 1;
    setStrokes(nextStrokes);
    setBallPos(result.finalPos);
    if (!result.holed) {
      setLastShotNote(missNote(result, hole.cup.radius));
      return;
    }
    const delta = nextStrokes - hole.par;
    const title =
      nextStrokes === 1
        ? '축하합니다! 짜릿한 홀인원(Hole-in-One) 달성!'
        : delta < 0
          ? `나이스 버디! (${nextStrokes}타 · PAR ${hole.par})`
          : delta === 0
            ? `나이스 파(PAR)! (${nextStrokes}타 클리어)`
            : `홀컵 골인 완료! (${nextStrokes}타 클리어)`;
    const storyRecorded = story && storyAttemptId ? recordStoryResult({ type: 'parkgolf', hole: hole.holeNumber, strokesFromPar: delta, chapterId: story.id, attemptId: storyAttemptId }) : false;
    const storyNote = story ? (!storyRecorded ? ' 이야기 기록이 반영되지 않았어요. 마을에서 진행 상태를 확인해 주세요.' : story.id === 'chapter_6' || delta <= 0 ? ' 이야기 목표를 마쳤습니다.' : ' 이야기 목표는 파 이하여서 다시 도전할 수 있습니다.') : '';
    setHoledBanner(`${title} · +${delta <= 0 ? 180 : 120} CP & 인장 +1 획득!${storyNote}`);
    setLastShotNote('딱! 달그락-통! 공이 홀컵 한가운데로 빨려 들어갔습니다!');
    playSfx('holein', state.soundEnabled);
    recordParkGolfClear(delta);
    if (hole.holeNumber === 1 && delta <= 0) completeQuestStep('parkgolf');
    recordGameWithNpc(coach);
  };

  /** 끌기·버튼 두 방식 모두 같은 물리로 공을 굴립니다. 타수와 결과는 공이 멈춘 뒤에 기록합니다. */
  const takeShot = (shot: ParkGolfShot) => {
    if (shotPending.current || rolling || holedBanner || blocked) return;
    shotPending.current = true;
    const result = rollParkGolfShot(hole, ballPos, shot);
    triggerHaptic('medium');
    playSfx('putt', state.soundEnabled);
    if (reduceMotion !== false || !screenActive) {
      finishShot(result);
      return;
    }
    let inSand = false;
    const onEvents = (events: ParkGolfStepEvents) => {
      if (events.bouncedWall || events.bouncedBumper || events.lippedOut) {
        triggerHaptic(events.lippedOut ? 'medium' : 'light');
        playSfx('stoneClack', state.soundEnabled);
      }
      if (events.inBunker && !inSand) triggerHaptic('light');
      inSand = events.inBunker;
    };
    roller.start({ hole, from: ballPos, shot, onFrame: placeBall, onEvents, onRest: () => finishShot(result) });
  };

  const handleDragShot = (shot: ParkGolfShot | null) => {
    if (shot) takeShot(shot);
    else if (!blocked) setLastShotNote('너무 짧게 당겼어요. 조금 더 길게 당겼다 놓으세요.');
  };

  React.useEffect(() => {
    advanceOnboarding('openedParkGolf');
  }, [advanceOnboarding]);

  return (
    <Screen testID="park-golf-screen" contentContainerStyle={styles.container} scrollViewProps={{ scrollEnabled: !aiming }}>
      <FocusedBackgroundAudio source={BGM_CLUB_LOUNGE} enabled={state.soundEnabled} />
      <ArcadeSaveNotice />
      <ArcadeQuickSettings />
      {/* 1. 상단 홀 선택 & 스코어보드 HUD */}
      <View style={styles.hudCard}>
        <View style={[styles.holeTabsRow, stackControls && styles.stackedRow]}>
          {PARK_GOLF_HOLES.map((item, idx) => {
            if (story && idx !== (story.id === 'chapter_6' ? 2 : 0)) return null;
            const active = idx === holeIndex;
            return (
              <Pressable
                key={item.holeNumber}
                testID={`parkgolf-hole-${item.holeNumber}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => selectHole(idx)}
                style={[styles.holeTab, stackControls && styles.stackedControl, active && styles.holeTabActive]}>
                <AppText
                  variant="bodyStrong"
                  style={{ color: active ? '#182620' : '#FCF9F2' }}>
                  {item.holeNumber}홀 (PAR {item.par})
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.scoreRow, stackControls && styles.stackedRow]}>
          <View style={stackControls ? styles.stackedStatBox : styles.scoreStatBox}>
            <AppText variant="caption" style={styles.scoreLabel}>현재 홀</AppText>
            <AppText variant="sectionTitle" style={styles.scoreVal}>{hole.title}</AppText>
          </View>
          <View style={stackControls ? styles.stackedStatBox : styles.scoreStatBox}>
            <AppText variant="caption" style={styles.scoreLabel}>현재 타수</AppText>
            <AppText variant="title" style={styles.strokeNumber}>{strokes}타째</AppText>
          </View>
        </View>
        <View style={styles.slopeBanner}>
          <AppText variant="caption" style={styles.slopeText}>
            그린 상태: {hole.slope.label} · 장착 퍼터: {PUTTER_NAMES[appearance.putter]}
          </AppText>
        </View>
        <Image
          source={AIM_SLOPE_FLOURISH}
          style={styles.slopeFlourish}
          contentFit="contain"
          accessible={false}
        />
      </View>

      {pendingHole !== null ? (
        <ChangeConfirmation
          message={`${PARK_GOLF_HOLES[pendingHole].title}로 이동하면 현재 홀의 진행이 사라집니다. 바꾸시겠습니까?`}
          onCancel={() => setPendingHole(null)}
          onConfirm={() => startHole(pendingHole)}
        />
      ) : null}
      <RoundSaveNotice status={roundSave.status} onRetry={roundSave.retry} />
      {story && storyAttemptId ? <StoryTrialNotice chapter={story} onLeave={onLeaveStory} canAbandon={!holedBanner} onAbandon={() => {
        recordStoryResult({ type: 'parkgolf', hole: hole.holeNumber, outcome: 'failure', chapterId: story.id, attemptId: storyAttemptId });
        startHole(holeIndex);
      }} /> : null}

      {/* 함께 한 판 — 박 캡틴 코치 패널 */}
      <CompanionCoach npcId={coach} mood={holedBanner && !rolling ? 'success' : 'start'} />

      <AppText variant="caption" style={styles.previewText}>
        {mode === 'drag' ? '당기는 동안 점선으로 굴러갈 방향의 앞부분만 보여 드립니다.' : '점선은 예상 이동 경로입니다.'} 검은 원은 홀컵, 모래색은 벙커, 갈색 선은 반사 범퍼입니다. 경사와 힘에 따라 공이 휘거나 홀컵을 지나칠 수 있어요.
      </AppText>

      {/* 2. 홀 데이터와 같은 좌표를 쓰는 그린 보드 — 당겨서 치는 곳 */}
      <ParkGolfBoard
        hole={hole}
        ballPos={ballPos}
        ballX={ballX}
        ballY={ballY}
        mode={mode}
        buttonShot={aimedShot}
        buttonPath={preview.path}
        canAim={!holedBanner && !rolling && !blocked}
        rolling={rolling}
        holed={holedBanner !== null}
        nacrePutter={appearance.putter === 'nacre'}
        onSize={(size) => {
          boardSize.current = size;
          if (!rolling) placeBall(ballPos);
        }}
        onShot={handleDragShot}
        onPowerTick={() => triggerHaptic('light')}
        onAimingChange={setAiming}
      />

      {/* 3. 홀인 축하 배너 또는 샷 상태 안내 */}
      {holedBanner && !rolling ? (
        <Card style={styles.holedCard}>
          <RoundStarsView stars={parkGolfStars({ strokes, par: hole.par })} title={strokes === 1 ? '홀인원!' : '홀컵 골인!'} />
          <AppText variant="sectionTitle" accessibilityLiveRegion="polite" style={{ color: '#0E5142' }}>
            {holedBanner}
          </AppText>
          <SeniorButton
            testID="btn-parkgolf-replay-hole"
            label="같은 홀 다시 도전하기"
            variant="secondary"
            onPress={() => startHole(holeIndex)}
          />
          {!story ? <SeniorButton
            testID="btn-parkgolf-next-hole"
            label="다음 홀 라운딩 이어가기 ▶"
            variant="primary"
            onPress={() => startHole((holeIndex + 1) % PARK_GOLF_HOLES.length)}
          /> : null}
        </Card>
      ) : (
        <Card style={styles.controlCard}>
          <AppText variant="bodyStrong" accessibilityLiveRegion="polite" style={{ color: '#182620' }}>
            {rolling ? '공이 굴러가고 있어요…' : lastShotNote}
          </AppText>
          {mode === 'button' ? (
            <AppText variant="caption" accessibilityLiveRegion="polite" style={styles.previewText}>
              {rolling ? '공이 멈추면 다음 샷의 예상 경로를 보여 드립니다.' : <>
                {preview.holed ? '점선 예상: 홀인' : `점선 예상: 홀컵까지 ${preview.distanceToCup}m`} · 힘 {powerLabel(aimedShot.power)}
                {preview.hitBunker ? ' · 벙커 감속' : ''}{preview.bouncedBumper ? ' · 범퍼 반사' : ''}{preview.bouncedWall ? ' · 벽 반사' : ''}{preview.lippedOut ? ' · 홀컵 튕김' : ''}
              </>}
            </AppText>
          ) : null}
          <ParkGolfControls
            mode={mode}
            onModeChange={(next) => { triggerHaptic('light'); setChosenMode(next); }}
            aimAngle={aimAngle}
            powerStep={powerStep}
            onAim={(deg) => { triggerHaptic('light'); setAimAngle(deg); }}
            onPower={(step) => { triggerHaptic('light'); setPowerStep(step); }}
            stack={stackControls}
            busy={rolling || blocked}
            shootLabel={pendingHole !== null ? '위쪽에서 홀 변경을 확인해 주세요' : pendingRestart ? '아래에서 다시 시작할지 선택해 주세요' : rolling ? '공이 굴러가고 있어요' : '퍼팅 샷 날리기 (타격!)'}
            onShoot={() => takeShot(aimedShot)}
          />
          {!story && strokes > 0 ? pendingRestart ? (
            <ChangeConfirmation
              message="이 홀을 처음부터 시작하면 현재 타수가 초기화됩니다. 다시 시작할까요?"
              confirmLabel="다시 시작"
              onCancel={() => setPendingRestart(false)}
              onConfirm={() => startHole(holeIndex)}
            />
          ) : (
            <SeniorButton testID="btn-parkgolf-restart-round" label="이 홀 처음부터 연습하기" variant="secondary"
              disabled={rolling || pendingHole !== null} onPress={() => setPendingRestart(true)} />
          ) : null}
        </Card>
      )}

      {/* 4. 장착 중인 파크골프 장비 쇼케이스 (ASSET-008) */}
      <Card style={styles.equipShowcase}>
        <Image source={CLUB_BALL_SET} style={styles.equipImage} contentFit="contain" />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="bodyStrong">수제 감나무 황동 퍼터 & 고시인성 볼</AppText>
          <AppText variant="caption" style={{ color: '#526451' }}>
            누적 홀인 {state.parkGolfClears}회 · 최고 기록 {state.parkGolfBestUnderPar}타
          </AppText>
        </View>
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
    borderRadius: PixelRadius,
    borderWidth: 2,
    borderColor: '#D8B384',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  holeTabsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
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
  holeTab: {
    flex: 1,
    minWidth: 48,
    minHeight: 56,
    borderRadius: PixelRadius,
    borderWidth: 1.5,
    borderColor: '#D8B384',
    backgroundColor: '#24382B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  holeTabActive: {
    backgroundColor: '#F0BF4F',
    borderColor: '#FCF9F2',
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  scoreStatBox: {
    flex: 1,
    gap: 2,
  },
  stackedStatBox: {
    alignSelf: 'stretch',
    gap: 2,
  },
  scoreLabel: {
    color: '#D8B384',
  },
  scoreVal: {
    color: '#FCF9F2',
  },
  strokeNumber: {
    color: '#F0BF4F',
    fontVariant: ['tabular-nums'],
  },
  slopeBanner: {
    backgroundColor: '#18312B',
    borderRadius: PixelRadius,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  slopeText: {
    color: '#E5F4FA',
  },
  slopeFlourish: {
    width: '100%',
    height: 40,
    opacity: 0.9,
    marginTop: -2,
  },
  holedCard: {
    backgroundColor: '#FFF1C7',
    borderWidth: 2,
    borderColor: '#F0BF4F',
    gap: Spacing.md,
  },
  controlCard: {
    backgroundColor: '#FCF9F2',
    borderWidth: 2,
    borderColor: '#6E4228',
    gap: Spacing.sm,
  },
  previewText: { color: '#315B38' },
  equipShowcase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: '#FCF9F2',
    borderColor: '#D8B384',
    borderWidth: 1.5,
  },
  equipImage: {
    width: 72,
    height: 72,
  },
});
