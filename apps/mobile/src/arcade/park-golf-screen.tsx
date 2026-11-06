import { Image } from 'expo-image';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { playSfx } from '@/audio/sound-manager';
import { AppText, Card, Screen, SeniorButton } from '@/components/ui';
import { FontWeights, Layout, Radius, Spacing } from '@/constants/theme';
import { PixelFx } from '@/fx/pixel-fx';

import { PARK_GOLF_HOLES, simulateParkGolfShot } from './arcade-logic';
import { useArcade } from './arcade-store';
import { CompanionCoach } from '@/rpg/companion-coach';
import { GAME_COACH } from '@/rpg/companion-lines';
import { useRpg } from '@/rpg/rpg-store';
import { getRpgStorage } from '@/rpg/rpg-db';
import { isGolfRound, loadRound, saveRound } from './round-save';

const ROUND_KEY = 'senior_club_golf_round_v1';

const GREEN_BOARD = require('../../assets/game/rpg/pixel/arcade/board_parkgolf.png');
const CLUB_BALL_SET = require('../../assets/game/rpg/pixel/arcade/equip_club_ball_set.png');
const PUTTER_HEAD = require('../../assets/game/rpg/pixel/arcade/equip_putter.png');
const BALL_WHITE = require('../../assets/game/rpg/pixel/arcade/equip_ball.png');
const HOLE_FLAG = require('../../assets/game/rpg/pixel/arcade/equip_flag.png');
const BUMPER_LOG = require('../../assets/game/rpg/pixel/props/spr_parkgolf_log_bumper_01.png');
const BUMPER_GATE = require('../../assets/game/rpg/pixel/props/spr_parkgolf_gate_01.png');
const AIM_SLOPE_FLOURISH = require('../../assets/game/rpg/ui/ui_parkgolf_aim_slope_01.png');
const PUTTER_NAMES = {
  persimmon: '감나무 황동 퍼터', redwood: '적삼목 클래식',
  master_gold: '명인 금장 퍼터', nacre: '매화 나전 퍼터',
} as const;

const ANGLE_PRESETS = [
  { label: '좌 15°', deg: -15 },
  { label: '좌 5°', deg: -5 },
  { label: '정면 0°', deg: 0 },
  { label: '우 5°', deg: 5 },
  { label: '우 15°', deg: 15 },
] as const;

const POWER_PRESETS: readonly { step: 1 | 2 | 3; label: string; desc: string }[] = [
  { step: 1, label: '1단 (완만)', desc: '가까운 그린 정밀 퍼팅' },
  { step: 2, label: '2단 (표준)', desc: '중거리 페어웨이 샷' },
  { step: 3, label: '3단 (강타)', desc: '장거리 홀인원 노리기' },
];

export function ParkGolfArcadeScreen() {
  const { state, appearance, recordParkGolfClear, triggerHaptic } = useArcade();
  const { completeQuestStep, recordGameWithNpc, recordStoryResult, advanceOnboarding } = useRpg();
  const [savedRound] = useState(() => loadRound(getRpgStorage(), ROUND_KEY, isGolfRound));
  const [holeIndex, setHoleIndex] = useState(savedRound?.holeIndex ?? 0);
  const hole = PARK_GOLF_HOLES[holeIndex] ?? PARK_GOLF_HOLES[0];

  const [ballPos, setBallPos] = useState<{ x: number; y: number }>(savedRound?.ballPos ?? hole.tee);
  const [strokes, setStrokes] = useState(savedRound?.strokes ?? 0);
  const [aimAngle, setAimAngle] = useState<number>(savedRound?.aimAngle ?? 0);
  const [powerStep, setPowerStep] = useState<1 | 2 | 3>(savedRound?.powerStep ?? 2);
  const [holedBanner, setHoledBanner] = useState<string | null>(savedRound?.holedBanner ?? null);
  const [lastShotNote, setLastShotNote] = useState<string>(
    savedRound?.lastShotNote ?? '각도와 힘(1~3단)을 고른 뒤 [퍼팅 샷 날리기] 버튼을 누르세요.',
  );

  React.useEffect(() => {
    saveRound(getRpgStorage(), ROUND_KEY, { holeIndex, ballPos, strokes, aimAngle, powerStep, holedBanner, lastShotNote });
  }, [holeIndex, ballPos, strokes, aimAngle, powerStep, holedBanner, lastShotNote]);

  const preview = useMemo(
    () => simulateParkGolfShot(hole, ballPos, aimAngle, powerStep),
    [hole, ballPos, aimAngle, powerStep],
  );

  const selectHole = (idx: number) => {
    const nextHole = PARK_GOLF_HOLES[idx] ?? PARK_GOLF_HOLES[0];
    triggerHaptic('light');
    setHoleIndex(idx);
    setBallPos(nextHole.tee);
    setStrokes(0);
    setAimAngle(0);
    setPowerStep(2);
    setHoledBanner(null);
    setLastShotNote(`${nextHole.title} (PAR ${nextHole.par}) 라운딩을 시작합니다.`);
  };

  const handleShoot = () => {
    triggerHaptic('medium');
    playSfx('putt', state.soundEnabled);
    const nextStrokes = strokes + 1;
    setStrokes(nextStrokes);

    // If close to cup or preview says holed, sink it cleanly!
    const currentDist = Math.hypot(ballPos.x - hole.cup.x, ballPos.y - hole.cup.y);
    if (preview.holed || (currentDist <= 38 && powerStep <= 2 && Math.abs(aimAngle) <= 15)) {
      setBallPos({ x: hole.cup.x, y: hole.cup.y });
      const delta = nextStrokes - hole.par;
      const title =
        nextStrokes === 1
          ? '축하합니다! 짜릿한 홀인원(Hole-in-One) 달성!'
          : delta < 0
            ? `나이스 버디! (${nextStrokes}타 · PAR ${hole.par})`
            : delta === 0
              ? `나이스 파(PAR)! (${nextStrokes}타 클리어)`
              : `홀컵 골인 완료! (${nextStrokes}타 클리어)`;
      setHoledBanner(`${title} · +${delta <= 0 ? 180 : 120} CP & 인장 +1 획득!`);
      setLastShotNote('딱! 달그락-통! 공이 홀컵 한가운데로 빨려 들어갔습니다!');
      playSfx('holein', state.soundEnabled);
      recordParkGolfClear(delta);
      if (hole.holeNumber === 1 && delta <= 0) completeQuestStep('parkgolf');
      recordStoryResult({ type: 'parkgolf', hole: hole.holeNumber, strokesFromPar: delta });
      recordGameWithNpc(GAME_COACH.parkgolf);
      return;
    }

    setBallPos(preview.finalPos);
    if (preview.hitBunker) {
      setLastShotNote(`모래 벙커를 스치며 감속되었습니다. 남은 거리 ${preview.distanceToCup}m`);
    } else if (preview.bouncedWall) {
      setLastShotNote(`원목 쿠션 벽에 경쾌하게 반사되었습니다! 남은 거리 ${preview.distanceToCup}m`);
    } else {
      setLastShotNote(`나이스 어프로치! 홀컵까지 ${preview.distanceToCup}m 남았습니다. 한 번 더 치면 들어갑니다!`);
    }
  };

  React.useEffect(() => {
    advanceOnboarding('openedParkGolf');
  }, [advanceOnboarding]);

  return (
    <Screen testID="park-golf-screen" contentContainerStyle={styles.container}>
      {/* 1. 상단 홀 선택 & 스코어보드 HUD */}
      <View style={styles.hudCard}>
        <View style={styles.holeTabsRow}>
          {PARK_GOLF_HOLES.map((item, idx) => {
            const active = idx === holeIndex;
            return (
              <Pressable
                key={item.holeNumber}
                testID={`parkgolf-hole-${item.holeNumber}`}
                accessibilityRole="button"
                onPress={() => selectHole(idx)}
                style={[styles.holeTab, active && styles.holeTabActive]}>
                <AppText
                  variant="bodyStrong"
                  style={{ color: active ? '#182620' : '#FCF9F2' }}>
                  {item.holeNumber}홀 (PAR {item.par})
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.scoreRow}>
          <View style={styles.scoreStatBox}>
            <AppText variant="caption" style={styles.scoreLabel}>현재 홀</AppText>
            <AppText variant="sectionTitle" style={styles.scoreVal}>{hole.title}</AppText>
          </View>
          <View style={styles.scoreStatBox}>
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

      {/* 함께 한 판 — 박 캡틴 코치 패널 */}
      <CompanionCoach npcId={GAME_COACH.parkgolf} mood={holedBanner ? 'success' : 'start'} />

      {/* 2. 탑다운 파크골프 그린 보드 (ASSET-007 + 고대비 점선 궤적 & 볼 오버레이) */}
      <View style={styles.boardFrame}>
        <Image source={GREEN_BOARD} style={styles.boardImage} contentFit="cover" />

        {/* 장애물(원목 범퍼 / 황동 게이트) — 홀 데이터에 bumper가 있을 때만 보드에 표시 */}
        {hole.bumper ? (
          <Image
            source={hole.holeNumber === 3 ? BUMPER_GATE : BUMPER_LOG}
            style={[
              styles.bumperImage,
              hole.holeNumber === 3
                ? { left: '57%', top: '24.5%', width: '23%', aspectRatio: 1.62 }
                : { left: '19%', top: '39.5%', width: '19%', aspectRatio: 1.88 },
            ]}
            contentFit="contain"
            pointerEvents="none"
            accessible={false}
          />
        ) : null}

        {/* 점선 조준 궤적 (Art Bible §4 Colorblind Safety Rule 3: 상아 외곽선 + 주황/금빛 점) */}
        {!holedBanner &&
          preview.path.slice(1, 10).map((pt, i) => (
            <View
              key={`traj-${i}`}
              style={[
                styles.trajectoryDot,
                {
                  left: `${pt.x}%`,
                  top: `${pt.y}%`,
                  backgroundColor: i % 2 === 0 ? '#F0BF4F' : '#C2410C',
                },
              ]}
            />
          ))}

        {/* 홀컵 목표 하이라이트 링 */}
        <View
          style={[
            styles.cupRing,
            { left: `${hole.cup.x}%`, top: `${hole.cup.y}%` },
          ]}>
          <Image source={HOLE_FLAG} style={styles.holeFlagImage} contentFit="contain" />
        </View>

        {/* 조준 방향에 맞춘 원목 퍼터 헤드 가이드 */}
        {!holedBanner ? (
          <View
            style={[
              styles.putterGuide,
              {
                left: `${ballPos.x}%`,
                top: `${ballPos.y + 8.5}%`,
                transform: [{ rotate: `${aimAngle - 90}deg` }],
              },
            ]}>
            <Image source={PUTTER_HEAD} style={styles.putterGuideImage} contentFit="contain" />
            {appearance.putter === 'nacre' ? <View testID="nacre-putter-decoration" style={styles.nacrePutterDecoration} /> : null}
          </View>
        ) : null}

        {/* 현재 파크골프 볼 (고시인성 상아백색 볼 + 두꺼운 다크 베벨) */}
        <View
          testID="parkgolf-ball"
          style={[
            styles.golfBall,
            { left: `${ballPos.x}%`, top: `${ballPos.y}%` },
          ]}>
          <Image source={BALL_WHITE} style={styles.golfBallSprite} contentFit="contain" />
        </View>

        {/* 홀인 성공 VFX — pixelfx `pickups/collect-burst`를 금빛 팔레트로 구운 시트 */}
        {holedBanner ? (
          <View style={styles.holeInVfxLayer} pointerEvents="none">
            <PixelFx name="holein" scale={1.3} />
          </View>
        ) : null}
      </View>

      {/* 3. 홀인 축하 배너 또는 샷 상태 안내 */}
      {holedBanner ? (
        <Card style={styles.holedCard}>
          <AppText variant="sectionTitle" style={{ color: '#0E5142' }}>
            🏆 {holedBanner}
          </AppText>
          <SeniorButton
            testID="btn-parkgolf-next-hole"
            label="다음 홀 라운딩 이어가기 ▶"
            variant="primary"
            onPress={() => selectHole((holeIndex + 1) % PARK_GOLF_HOLES.length)}
          />
        </Card>
      ) : (
        <Card style={styles.controlCard}>
          <AppText variant="bodyStrong" style={{ color: '#182620' }}>
            {lastShotNote}
          </AppText>

          {/* 조준 각도 미세 조정 (손떨림 방지 버튼형 컨트롤) */}
          <AppText variant="caption" style={styles.controlLabel}>
            1. 방향 조준 (현재 {aimAngle > 0 ? `우 ${aimAngle}°` : aimAngle < 0 ? `좌 ${Math.abs(aimAngle)}°` : '정면 0°'})
          </AppText>
          <View style={styles.presetRow}>
            {ANGLE_PRESETS.map((preset) => {
              const selected = aimAngle === preset.deg;
              return (
                <Pressable
                  key={preset.label}
                  accessibilityRole="button"
                  onPress={() => {
                    triggerHaptic('light');
                    setAimAngle(preset.deg);
                  }}
                  style={[styles.angleBtn, selected && styles.angleBtnSelected]}>
                  <AppText
                    variant="caption"
                    style={{
                      color: selected ? '#FCF9F2' : '#182620',
                      fontFamily: FontWeights.emphasis,
                    }}>
                    {preset.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* 타격 파워 1~3단 선택 */}
          <AppText variant="caption" style={styles.controlLabel}>
            2. 퍼팅 힘 조절 (1단 ~ 3단)
          </AppText>
          <View style={styles.powerRow}>
            {POWER_PRESETS.map((item) => {
              const selected = powerStep === item.step;
              return (
                <Pressable
                  key={item.step}
                  testID={`parkgolf-power-${item.step}`}
                  accessibilityRole="button"
                  onPress={() => {
                    triggerHaptic('light');
                    setPowerStep(item.step);
                  }}
                  style={[styles.powerBtn, selected && styles.powerBtnSelected]}>
                  <AppText
                    variant="bodyStrong"
                    style={{ color: selected ? '#FCF9F2' : '#182620' }}>
                    {item.label}
                  </AppText>
                  <AppText
                    variant="caption"
                    style={{ color: selected ? '#FDE7DF' : '#526451', fontSize: 12 }}>
                    {item.desc}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <SeniorButton
            testID="btn-parkgolf-shoot"
            label="퍼팅 샷 날리기 (타격!)"
            variant="accent"
            onPress={handleShoot}
          />
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
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: '#D8B384',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  holeTabsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  holeTab: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: '#D8B384',
    backgroundColor: '#24382B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
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
    borderRadius: Radius.sm,
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
  boardFrame: {
    width: '100%',
    height: 330,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#6E4228',
    backgroundColor: '#0E5142',
    position: 'relative',
  },
  boardImage: {
    width: '100%',
    height: '100%',
  },
  bumperImage: {
    position: 'absolute',
    zIndex: 1,
  },
  trajectoryDot: {
    position: 'absolute',
    zIndex: 2,
    width: 12,
    height: 12,
    marginLeft: -6,
    marginTop: -6,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FCF9F2',
  },
  cupRing: {
    position: 'absolute',
    zIndex: 2,
    marginLeft: -22,
    marginTop: -32,
    width: 44,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holeFlagImage: {
    width: '100%',
    height: '100%',
  },
  putterGuide: {
    position: 'absolute',
    zIndex: 2,
    width: 58,
    height: 52,
    marginLeft: -29,
    marginTop: -26,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.94,
  },
  putterGuideImage: {
    width: '100%',
    height: '100%',
  },
  nacrePutterDecoration: {
    position: 'absolute', right: 4, top: 9, width: 13, height: 13,
    backgroundColor: '#D55D79', borderWidth: 2, borderColor: '#FCF9F2',
    transform: [{ rotate: '45deg' }],
  },
  golfBall: {
    position: 'absolute',
    zIndex: 2,
    width: 32,
    height: 32,
    marginLeft: -16,
    marginTop: -16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  golfBallSprite: {
    width: '100%',
    height: '100%',
  },
  holeInVfxLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  controlLabel: {
    color: '#6E4228',
    fontFamily: FontWeights.emphasis,
    marginTop: 4,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 6,
  },
  angleBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: '#6E4228',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  angleBtnSelected: {
    backgroundColor: '#0E5142',
    borderColor: '#0E5142',
  },
  powerRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: 4,
  },
  powerBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: '#D8B384',
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  powerBtnSelected: {
    backgroundColor: '#C2410C',
    borderColor: '#9A3412',
  },
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
