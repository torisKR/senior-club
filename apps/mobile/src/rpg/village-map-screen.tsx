import { Image } from 'expo-image';
import { type Href, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';

import { HomeBannerAd } from '@/ads/HomeBannerAd';
import { useArcade } from '@/arcade/arcade-store';
import { ArcadeSaveNotice } from '@/arcade/arcade-save-notice';
import { FocusedBackgroundAudio } from '@/audio/focused-background-audio';
import { playSfx } from '@/audio/sound-manager';
import { AppText, SeniorButton } from '@/components/ui';
import { FontWeights, Spacing } from '@/constants/theme';
import { PixelFx } from '@/fx/pixel-fx';
import { useReduceMotion } from '@/fx/use-reduce-motion';
import { useEffectiveSafeAreaInsets } from '@/hooks/use-effective-safe-area-insets';
import { useAppState } from '@/hooks/use-app-state';
import { IdlePanel } from '@/world/panels/idle-panel';
import { AlbumPanel, DexPanel } from '@/world/panels/dex-panel';
import { JournalPanel } from '@/world/panels/journal-panel';
import { timeOfDayTint } from '@/world/time-of-day';
import { useSharedValue } from 'react-native-reanimated';

import { BusSheet } from '@/world/hud/bus-sheet';
import { Minimap } from '@/world/hud/minimap';
import { getMap, MAP_IDS, regionName, type MapId } from '@/world/maps';
import { VirtualJoystick } from '@/world/virtual-joystick';
import { WorldView } from '@/world/world-view';
import { useWorldActivities } from '@/world/world-activities';

import { ExitConfirmDialog } from './exit-confirm-dialog';
import { NPC_DISPLAY, PROMOTION_LINES, WALK_LINES } from './companion-lines';
import { BOND_ENDING_LINES, BOND_EPISODES } from './bond-episodes';
import { canClaimDailyWalk, closestNpc, getBond, NPC_IDS, type NpcId } from './bond-logic';
import { todayKey } from './daily-reset';
import { OnboardingOverlay } from './onboarding-overlay';
import { useAndroidBackExit } from './use-android-back-exit';
import { findNearbyNpc, getVillageTile } from './rpg-logic';
import { isStoryActionAvailable, STORY_ACTIONS, storyStatus, storyTrialCompleted, trialResolved } from './story-progress';
import { STORY_CONTINUATION_DIALOGUE } from './story-data';
import { portraitFor } from './rpg-sprites';
import { useRpg } from './rpg-store';
import { GameIcon } from '@/components/game/game-icon';
import { TypewriterText } from '@/components/game/typewriter-text';

import { HudStats } from './hud-stats';
import { askForReviewAt } from './review-prompt';
import { hud } from './village-hud-styles';
import { villageStyles as styles } from './village-styles';
import { BGM_CLUB_LOUNGE } from '@/audio/bgm';

const MASTER_BADGE = require('../../assets/game/rpg/pixel/ui/badge_master.png');
const HUD_BAG = require('../../assets/game/rpg/pixel/hud/bag.png');
const HUD_STORY = require('../../assets/game/rpg/pixel/hud/story.png');
const HUD_MENU = require('../../assets/game/rpg/pixel/hud/menu.png');
/** 안내 문구가 화면에 머무는 시간 */
const NOTICE_MS = 4000;
/** 아침 체조를 하는 마을 광장 (3 x 3) */
const PLAZA = { minX: 26, maxX: 28, minY: 22, maxY: 24 };
const HUD_MAP = require('../../assets/game/rpg/pixel/gameui/mapicon.png');

function offlineDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  return minutes > 0 ? `${minutes}분` : `${Math.floor(seconds)}초`;
}

export function VillageMapScreen() {
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const fadeTransition = reduceMotion === false ? 'fade' : 'none';
  const slideTransition = reduceMotion === false ? 'slide' : 'none';
  const { rankProgress, state: arcadeState, toggleSound, toggleHaptic, toggleReduceMotion, triggerHaptic } = useArcade();
  const {
    state,
    saveProtection,
    resolveLegacyStory,
    currentChapter,
    pendingOfflineReward,
    claimOfflineReward,
    advanceChapter,
    continueStoryAfterFailures,
    performStoryAction,
    chooseBondEpisode,
    stepPlayer,
    walkTo,
    savePosition,
    travelTo,
    doMorningGym,
    takeMedication,
    advanceOnboarding,
    bonds,
    companionId,
    heartWarmth,
    startCompanion,
    stopCompanion,
    claimDailyWalk,
  } = useRpg();

  const [sheet, setSheet] = useState<'journal' | 'menu' | null>(null);
  const [dismissedNpcId, setDismissedNpcId] = useState<string | null>(null);
  const [companionDialogueOpen, setCompanionDialogueOpen] = useState(false);
  const [companionLineIndex, setCompanionLineIndex] = useState(0);
  const [npcLine, setNpcLine] = useState<{ npcId: string; index: number } | null>(null);
  const lastStepHapticAt = useRef(Number.NEGATIVE_INFINITY);
  const insets = useEffectiveSafeAreaInsets();
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionChoiceAt, setActionChoiceAt] = useState<string | null>(null);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [busOpen, setBusOpen] = useState(false);
  const [storyModalOpen, setStoryModalOpen] = useState(false);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  // 안드로이드 뒤로가기 → 종료 확인 (홈 탭에서만)
  const backActionRef = useRef<(() => boolean) | null>(null);
  const backExit = useAndroidBackExit(backActionRef);
  const prologueOpen = saveProtection === 'ready' && state.storyLegacyChoice !== 'pending' && state.onboarding.step === 'prologue';
  const activityCovered = prologueOpen || sheet !== null || minimapOpen || busOpen || storyModalOpen || episodeId !== null || backExit.confirming ||
    (saveProtection === 'ready' && (Boolean(pendingOfflineReward) || state.storyLegacyChoice === 'pending'));
  const activities = useWorldActivities(setActionNotice, activityCovered);
  const walkClaimAvailable = companionId !== null && canClaimDailyWalk(getBond(bonds, companionId), todayKey(new Date(activities.nowMs)));
  const actionLocation = `${state.mapId}:${state.playerPos.x}:${state.playerPos.y}`;
  const actionChoiceOpen = actionChoiceAt === actionLocation;
  // 안내 문구는 잠시 보여 주고 스스로 사라집니다.
  useEffect(() => {
    if (!actionNotice) return;
    const timer = setTimeout(() => setActionNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [actionNotice]);
  const chapterStatus = storyStatus(state, arcadeState.cp);
  const trialDone = storyTrialCompleted(state);
  const trialSkipped = state.storySkippedTrialIds.includes(currentChapter.id);
  const chapterActions = STORY_ACTIONS.filter((action) => action.chapterId === currentChapter.id);
  const recordedLegacyChapter = state.storyLegacyChoice === 'keep' && currentChapter.id === 'chapter_4' && state.completedChapterIds.includes('chapter_4');
  const showOutro = chapterStatus.kind === 'finished' || (trialResolved(state) && chapterStatus.kind !== 'actions') || recordedLegacyChapter;
  const unknownLegacyResult = chapterStatus.kind === 'finished' && !trialDone && !trialSkipped;
  const activeEpisode = BOND_EPISODES.find((episode) => episode.id === episodeId);
  const episodeBond = activeEpisode ? getBond(bonds, activeEpisode.npcId) : null;
  const chosenEpisodeOption = activeEpisode?.choices.find((choice) => choice.id === episodeBond?.sceneChoices?.[activeEpisode.id]);
  const [promotionFx, setPromotionFx] = useState(false);
  const closestNpcId = useMemo(() => closestNpc(bonds), [bonds]);
  // 아침 체조·약 복용 성공 시 마을 위에 잠깐 피어오르는 회복 이펙트 (key로 재시작)
  const [healFxKey, setHealFxKey] = useState(0);
  const { width: viewportWidth, height: viewportHeight, fontScale } = useWindowDimensions();
  const { largeTextEnabled, toggleLargeText } = useAppState();
  const [statusHeight, setStatusHeight] = useState(0);
  const hudDetailTop = insets.top + Math.max(132, Spacing.sm + statusHeight + Spacing.sm);
  const wideHud = fontScale >= 1.4 || largeTextEnabled;
  const compactLocation = viewportWidth < 360 && wideHud;
  const stackRoutine = viewportWidth < 360 || fontScale >= 1.3 || largeTextEnabled;

  const currentTile = useMemo(
    () => getVillageTile(state.playerPos.x, state.playerPos.y, state.mapId),
    [state.playerPos.x, state.playerPos.y, state.mapId],
  );

  const nearbyNpc = useMemo(
    () => findNearbyNpc(state.playerPos.x, state.playerPos.y, state.mapId, companionId),
    [state.playerPos.x, state.playerPos.y, state.mapId, companionId],
  );

  const handleStep = (dx: number, dy: number) => {
    setActionChoiceAt(null);
    setCompanionDialogueOpen(false);
    activities.cancel();
    const result = stepPlayer(dx, dy);
    const direction = dx < 0 ? '왼쪽' : dx > 0 ? '오른쪽' : dy < 0 ? '위쪽' : '아래쪽';
    if (result === 'blocked') {
      const now = Date.now();
      if (now - lastStepHapticAt.current >= 1200) {
        lastStepHapticAt.current = now;
        triggerHaptic('light');
      }
      const notice = `${direction}은 갈 수 없어요. 다른 방향으로 돌아가 보세요.`;
      if (actionNotice === notice) AccessibilityInfo.announceForAccessibility(notice);
      setActionNotice(notice);
      return;
    }
    if (result === 'save_failed') {
      const notice = '이동을 완료하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
      if (actionNotice === notice) AccessibilityInfo.announceForAccessibility(notice);
      setActionNotice(notice);
      return;
    }
    advanceOnboarding('moved');
    setActionNotice(null);
    AccessibilityInfo.announceForAccessibility(`${direction}으로 한 칸 이동했어요.`);
  };

  // 조이스틱 방향은 UI 스레드가 매 프레임 읽습니다.
  const joyX = useSharedValue(0);
  const joyY = useSharedValue(0);
  const joystickMoving = useRef(false);
  const map = getMap(state.mapId);
  const handleVector = (x: number, y: number) => {
    const moving = x !== 0 || y !== 0;
    if (moving && !joystickMoving.current) {
      setActionChoiceAt(null);
      setCompanionDialogueOpen(false);
      activities.cancel();
    }
    joystickMoving.current = moving;
    joyX.set(x);
    joyY.set(y);
  };
  const handleTileChange = useCallback((x: number, y: number, sourceMapId: MapId) => {
    if (walkTo(x, y, sourceMapId)) advanceOnboarding('moved');
  }, [advanceOnboarding, walkTo]);
  const handleMovementEnd = useCallback((x: number, y: number, sourceMapId: MapId) => {
    if (walkTo(x, y, sourceMapId)) savePosition();
  }, [savePosition, walkTo]);
  const handleTravel = (to: typeof state.mapId) => {
    setBusOpen(false);
    if (travelTo(to)) {
      setCompanionDialogueOpen(false);
      setActionNotice(`${getMap(to).name}에 도착했어요.`);
    } else {
      setActionNotice('이동을 저장하지 못했어요. 잠시 뒤 다시 버스를 타 주세요.');
    }
  };

  const enterPlace = (route: string) => {
    // 튜토리얼 3단계는 파크골프 입장으로만 완료됩니다.
    if (route === '/clubs') advanceOnboarding('openedParkGolf');
    router.push({ pathname: route, params: { storyChapter: '' } } as Href);
  };

  const handleMorningGym = () => {
    if (state.lastDailyResetDate === todayKey() && state.stats.dailyMorningGymDone) {
      advanceOnboarding('gymDone');
      setActionNotice('오늘 아침 체조는 이미 상쾌하게 마치셨습니다.');
    } else {
      if (!doMorningGym()) {
        setActionNotice('체조 기록을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
        return;
      }
      advanceOnboarding('gymDone');
      setHealFxKey((key) => key + 1);
      setActionNotice('기운찬 아침 체조 완료! 활력을 채우고 연륜 +50 EXP를 얻었어요.');
    }
  };

  const handleTakeMedication = () => {
    if (state.lastDailyResetDate === todayKey() && state.stats.dailyMedicationTaken) {
      setActionNotice('오늘 혈압약과 영양제를 이미 복용하셨습니다.');
    } else {
      if (!takeMedication()) {
        setActionNotice('복약 기록을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
        return;
      }
      setHealFxKey((key) => key + 1);
      setActionNotice('약 복용 완료! 활력이 가득 차오르고 마을 덕망이 올랐습니다.');
    }
  };

  const handleClaimDailyWalk = () => {
    if (!companionId) return;
    if (!canClaimDailyWalk(getBond(bonds, companionId), todayKey())) {
      setActionNotice('오늘은 이미 함께 걸었어요. 내일 또 만나요.');
      return;
    }
    const claimed = claimDailyWalk();
    if (claimed) playSfx('chime', arcadeState.soundEnabled);
    setActionNotice(
      claimed
        ? `${NPC_DISPLAY[companionId].name}와의 산책 완료! 유대 +15 · 마음 온도를 채웠어요.`
        : '산책 보상을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    );
  };

  const companionDialogueNpc = companionDialogueOpen && companionId
    ? MAP_IDS.flatMap((id) => getMap(id).npcs).find((npc) => npc.id === companionId) ?? null : null;
  const dialogueNpc = companionDialogueNpc ?? (nearbyNpc && nearbyNpc.id !== dismissedNpcId ? nearbyNpc : null);
  useEffect(() => {
    backActionRef.current = () => {
      if (activities.overlay) {
        activities.cancel();
        return true;
      }
      if (dialogueNpc) {
        setCompanionDialogueOpen(false);
        setNpcLine(null);
        setDismissedNpcId(dialogueNpc.id);
        return true;
      }
      return false;
    };
    return () => { backActionRef.current = null; };
  }, [activities, dialogueNpc]);
  const doorHere = map.buildings.find(
    (building) => (building.facilityRoute || building.busStop) && building.door.x === state.playerPos.x && building.door.y === state.playerPos.y,
  );
  const onPlaza = state.mapId === 'field' && state.playerPos.x >= PLAZA.minX && state.playerPos.x <= PLAZA.maxX
    && state.playerPos.y >= PLAZA.minY && state.playerPos.y <= PLAZA.maxY;
  // 겹치는 장소에서는 입장·대화·생활 활동을 모두 고를 수 있습니다.
  const placeAction: { label: string; run: () => void } | null = doorHere?.busStop
    ? { label: '버스 타기', run: () => setBusOpen(true) }
    : doorHere?.facilityRoute
    ? { label: `${doorHere.name}\n들어가기`, run: () => enterPlace(doorHere.facilityRoute!) }
    : null;
  const talkAction = nearbyNpc && !dialogueNpc
    ? { label: `${nearbyNpc.name}에게 말 걸기`, run: () => setDismissedNpcId(null) }
    : null;
  const availableActions = activities.overlay ? [] : [
    ...(placeAction ? [placeAction] : []),
    ...(talkAction ? [talkAction] : []),
    ...activities.actions,
    ...(onPlaza && !state.stats.dailyMorningGymDone ? [{ label: '아침 체조', run: handleMorningGym }] : []),
  ];
  const worldAction = availableActions.length > 1
    ? { label: '활동 선택', run: () => setActionChoiceAt(actionLocation) }
    : availableActions[0] ?? null;
  const modalOpen = prologueOpen || sheet !== null || minimapOpen || busOpen || storyModalOpen || Boolean(activeEpisode) ||
    (actionChoiceOpen && availableActions.length > 1) || backExit.confirming ||
    (saveProtection === 'ready' && (Boolean(pendingOfflineReward) || state.storyLegacyChoice === 'pending'));

  const panelOpen = Boolean(activities.overlay || dialogueNpc);
  const localTime = new Date(activities.nowMs);
  const noticeToast = (
    <View pointerEvents="none" style={hud.noticeToast}>
      <AppText accessibilityLiveRegion="polite" variant="bodyStrong" style={hud.noticeText}>{actionNotice}</AppText>
    </View>
  );

  return (
    <View testID="village-map-screen" style={hud.worldRoot}>
      {/* 화면 전체가 마을입니다 — 카메라가 주인공을 따라갑니다. */}
      <View style={StyleSheet.absoluteFill}>
        <WorldView map={map} joyX={joyX} joyY={joyY} onTileChange={handleTileChange} onMovementEnd={handleMovementEnd} pose={activities.pose} celebration={activities.celebration} celebrationProp={activities.celebrationProp} onCelebrationDone={activities.finishCelebration} nowMs={activities.nowMs} paused={modalOpen} focusY={panelOpen ? 0.27 : 0.5} />
      </View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: timeOfDayTint(localTime.getHours() + localTime.getMinutes() / 60) }]} />
      {healFxKey > 0 ? (
        <PixelFx key={healFxKey} name="heal" scale={1.6} onDone={() => setHealFxKey(0)} style={styles.healFxLayer} />
      ) : null}
      <FocusedBackgroundAudio source={BGM_CLUB_LOUNGE} enabled={arcadeState.soundEnabled} />

      {/* 안드로이드 하드웨어 뒤로가기 종료 확인 */}
      <ExitConfirmDialog
        visible={backExit.confirming}
        onCancel={backExit.cancel}
        onConfirm={backExit.confirm}
        reduceMotion={reduceMotion}
      />

      <Modal visible={actionChoiceOpen && availableActions.length > 1} transparent animationType={fadeTransition} onRequestClose={() => setActionChoiceAt(null)}>
        <View style={[styles.modalBackdrop, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.md }]}>
          <ScrollView style={hud.choiceScroll} contentContainerStyle={hud.choiceContent}>
            <AppText variant="sectionTitle" style={hud.choiceTitle}>무엇을 할까요?</AppText>
            {availableActions.map((item, index) => (
              <SeniorButton key={`${item.label}-${index}`} testID={`world-choice-${index}`} label={item.label} variant="primary"
                onPress={() => { setActionChoiceAt(null); item.run(); }} />
            ))}
            <SeniorButton testID="world-choice-close" label="닫기" variant="secondary" onPress={() => setActionChoiceAt(null)} />
          </ScrollView>
        </View>
      </Modal>

      {/* 0. 오프라인 방치 보상 수령 모달 */}
      {pendingOfflineReward && saveProtection === 'ready' && state.storyLegacyChoice !== 'pending' && !prologueOpen ? (
        <Modal visible transparent animationType={fadeTransition}>
          <View style={[styles.modalBackdrop, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.md }]}>
            <ScrollView style={hud.rewardScroll}>
            <View style={styles.offlineRewardCard}>
              <GameIcon name="gift" size={64} />
              <AppText variant="sectionTitle" style={styles.offlineTitle}>
                어르신, 편히 쉬고 오셨습니까?
              </AppText>
              <AppText variant="body" style={styles.offlineDesc}>
                마을 시설에 배치된 이웃 동료들이 쉬는 동안 부지런히 수련과 살림을 도왔습니다! ({offlineDuration(pendingOfflineReward.cappedElapsedSec)} 누적)
              </AppText>
              <View style={styles.rewardBox}>
                <View style={styles.rewardRow}>
                  <GameIcon name="acorn" />
                  <AppText variant="bodyStrong" style={{ color: '#0E5142', flexShrink: 1 }}>
                    도토리 +{pendingOfflineReward.earnedAcorns.toLocaleString()}개 획득
                  </AppText>
                </View>
                <View style={styles.rewardRow}>
                  <GameIcon name="quest" />
                  <AppText variant="bodyStrong" style={{ color: '#855B00', flexShrink: 1 }}>
                    연륜 +{pendingOfflineReward.earnedExp.toLocaleString()} EXP 누적
                  </AppText>
                </View>
              </View>
              <SeniorButton
                testID="btn-claim-offline-reward"
                label="감사히 받기 (+수령)"
                variant="accent"
                onPress={() => claimOfflineReward(false)}
              />
            </View>
            </ScrollView>
          </View>
        </Modal>
      ) : null}

      {/* 유대 에피소드는 선택과 그 결과를 저장해 다시 열어볼 수 있습니다. */}
      <Modal visible={Boolean(activeEpisode)} transparent animationType={slideTransition} onRequestClose={() => setEpisodeId(null)}>
        <View style={styles.modalBackdrop}>
          <ScrollView style={styles.storyCutsceneCard} contentContainerStyle={styles.storyCutsceneContent}>
            {activeEpisode && episodeBond ? <>
              <AppText variant="sectionTitle" style={{ color: '#FCF9F2' }}>{activeEpisode.title}</AppText>
              <AppText variant="caption" style={{ color: '#F0BF4F' }}>
                {NPC_DISPLAY[activeEpisode.npcId].name} · 유대 {activeEpisode.threshold}
              </AppText>
              <AppText variant="body" style={styles.storyLineText}>{activeEpisode.dialogue}</AppText>
              {chosenEpisodeOption ? <>
                <AppText variant="body" style={styles.storyLineText}>선택: {chosenEpisodeOption.label}</AppText>
                <AppText variant="body" style={styles.storyLineText}>{chosenEpisodeOption.response}</AppText>
              </> : episodeBond.scenesSeen.includes(activeEpisode.id) ? (
                <AppText variant="body" style={styles.storyLineText}>이전에 함께한 이야기입니다.</AppText>
              ) : activeEpisode.choices.map((choice) => (
                <SeniorButton
                  key={choice.id}
                  testID={`bond-choice-${activeEpisode.id}-${choice.id}`}
                  label={choice.label}
                  variant="secondary"
                  onPress={() => chooseBondEpisode(activeEpisode.npcId, activeEpisode.id, choice.id)}
                />
              ))}
            </> : null}
            <SeniorButton label="돌아가기" variant="secondary" onPress={() => setEpisodeId(null)} />
          </ScrollView>
        </View>
      </Modal>

      {/* 여섯 막의 이야기와 CP 등급은 각각 표시합니다. */}
      <Modal visible={storyModalOpen} transparent animationType={slideTransition} onRequestClose={() => setStoryModalOpen(false)}>
        {storyModalOpen ? (
        <View style={styles.modalBackdrop}>
          <ScrollView style={styles.storyCutsceneCard} contentContainerStyle={styles.storyCutsceneContent}>
            <View style={styles.storyHeaderBadge}>
              <AppText variant="caption" style={{ color: '#F0BF4F', fontFamily: FontWeights.strong }}>
                {currentChapter.title} · {currentChapter.rankRequirement}
              </AppText>
            </View>
            <View style={styles.storyDialogueBox}>
              {(showOutro
                ? recordedLegacyChapter ? ['저장된 4막 완료 기록을 이어갑니다. 새 다실 이야기의 사건은 확인되지 않았습니다.']
                  : unknownLegacyResult ? ['이전에 마친 이야기를 이어받았습니다. 시련 결과는 별도로 기록되지 않았습니다.']
                  : trialSkipped ? STORY_CONTINUATION_DIALOGUE[currentChapter.id] ?? [] : currentChapter.outroDialogue
                : currentChapter.introDialogue).map((line, i) => (
                <AppText key={i} variant="body" style={styles.storyLineText}>{line}</AppText>
              ))}
              {currentChapter.id === 'chapter_6' && chapterStatus.kind === 'finished' ? <>
                <AppText variant="bodyStrong" style={{ color: '#F0BF4F' }}>여섯 막 이야기 완료</AppText>
                <AppText variant="body" style={styles.storyLineText}>
                  현재 CP 등급: {rankProgress.current.label} ({arcadeState.cp} CP) · 명인 등급은 3,500 CP부터
                </AppText>
                {NPC_IDS.filter((npcId) => getBond(bonds, npcId).points >= 200).map((npcId) => (
                  <AppText key={npcId} variant="body" style={styles.storyLineText}>{BOND_ENDING_LINES[npcId]}</AppText>
                ))}
              </> : null}
            </View>
            {state.storyLegacyArchive ? <View style={styles.climaxNotice}>
              <AppText variant="bodyStrong" style={{ color: '#0E5142' }}>이전 이야기 기록</AppText>
              <AppText variant="caption" style={{ color: '#24382B' }}>
                완료한 막: {state.storyLegacyArchive.completedChapterIds.join(', ') || '없음'}
              </AppText>
              <AppText variant="caption" style={{ color: '#24382B' }}>
                이전 시련 기록: {state.storyLegacyArchive.completedTrialIds.join(', ') || '없음'} · 4막의 이야기 종류는 확인되지 않았습니다.
              </AppText>
            </View> : null}
            <View style={styles.climaxNotice}>
              <AppText variant="bodyStrong" style={{ color: '#0E5142' }}>
                시련: {currentChapter.climaxTrial.opponentName}
              </AppText>
              <AppText variant="caption" style={{ color: '#24382B' }}>{currentChapter.climaxTrial.description}</AppText>
              <AppText variant="caption" style={{ color: '#24382B' }}>
                {recordedLegacyChapter ? '이전 4막 기록 · 새 시련 결과 미상' : trialDone ? '시련 달성' : trialSkipped ? '시련 미완수 · 이야기 계속 선택' : unknownLegacyResult ? '이전 완료 기록 · 시련 결과 미상' : `시련 실패 ${state.storyTrialFailures[currentChapter.id] ?? 0}/3`}
              </AppText>
            </View>
            {chapterActions.length ? <View style={styles.climaxNotice}>
              <AppText variant="bodyStrong" style={{ color: '#0E5142' }}>마을에서 함께할 일</AppText>
              {chapterActions.map((action) => <AppText key={action.id} variant="caption" style={{ color: '#24382B' }}>
                {state.storyActionFlags[action.id] === 'performed' ? '완료' : state.storyActionFlags[action.id] === 'legacy' ? '이전 이야기 기록' : '남음'} · {NPC_DISPLAY[action.npcId].name}: {action.label}
              </AppText>)}
              {chapterActions.some((action) => !state.storyActionFlags[action.id]) ?
                <AppText variant="caption" style={{ color: '#24382B' }}>마을에서 해당 인물에게 다가가 차례로 행동해 주세요.</AppText> : null}
            </View> : null}
            <View style={{ gap: Spacing.sm }}>
              {chapterStatus.kind !== 'finished' && !trialDone && !recordedLegacyChapter ? <SeniorButton
                label={trialSkipped ? '시련에 다시 도전하기 ▶' : '시련 도전하러 가기 ▶'}
                variant="accent"
                onPress={() => {
                  setStoryModalOpen(false);
                  router.push({ pathname: currentChapter.climaxTrial.targetRoute, params: { storyChapter: currentChapter.id } } as Href);
                }}
              /> : null}
              {chapterStatus.kind === 'trial' && (state.storyTrialFailures[currentChapter.id] ?? 0) >= 3 ? <SeniorButton
                testID="btn-continue-story-after-failures"
                label="시련을 마치지 않고 이야기 계속하기"
                variant="secondary"
                onPress={continueStoryAfterFailures}
              /> : null}
              {chapterStatus.kind === 'trial' && (state.storyTrialFailures[currentChapter.id] ?? 0) >= 3 ?
                <AppText variant="caption" style={styles.storyLineText}>시련 승리나 CP는 추가되지 않습니다. 계속 도전할 수도 있습니다.</AppText> : null}
              <SeniorButton
                label={
                  chapterStatus.kind === 'ready'
                    ? chapterStatus.isFinal ? '여섯 막 이야기 마무리하기' : 'alreadyRecorded' in chapterStatus ? '이전 기록으로 다음 막 보기' : '다음 막으로 넘어가기'
                    : chapterStatus.kind === 'rank'
                      ? `다음 이야기까지 ${chapterStatus.requiredCp} CP (현재 ${arcadeState.cp})`
                      : chapterStatus.kind === 'actions' ? '마을에서 남은 일을 마쳐 주세요'
                        : chapterStatus.kind === 'finished' ? '이야기 완결' : '시련을 먼저 마쳐 주세요'
                }
                variant="secondary"
                disabled={chapterStatus.kind !== 'ready'}
                onPress={() => {
                  if (!advanceChapter(arcadeState.cp)) {
                    Alert.alert('이야기 진행 안내', '진행을 저장하지 못했거나 조건이 바뀌었어요. 다시 확인해 주세요.');
                    return;
                  }
                  playSfx('chime', arcadeState.soundEnabled);
                  setPromotionFx(true);
                  setStoryModalOpen(false);
                  void askForReviewAt('promotion');
                }}
              />
              <SeniorButton label="마을로 돌아가기" variant="secondary" onPress={() => setStoryModalOpen(false)} />
            </View>
          </ScrollView>
        </View>
        ) : null}
      </Modal>

      {/* 이전 4막이 어느 이야기인지 알 수 없으므로 직접 이어갈 경로를 고릅니다. */}
      <Modal visible={saveProtection === 'ready' && state.storyLegacyChoice === 'pending'} transparent animationType={fadeTransition} onRequestClose={() => undefined}>
        <View style={styles.modalBackdrop}>
          <ScrollView style={styles.storyCutsceneCard} contentContainerStyle={styles.storyCutsceneContent}>
            <AppText variant="sectionTitle" style={{ color: '#FCF9F2' }}>이전 이야기 이어가기</AppText>
            <AppText variant="body" style={styles.storyLineText}>
              저장된 4막은 예전 이야기와 새 이야기에서 같은 이름을 사용했습니다. 이어갈 방법을 골라 주세요.
            </AppText>
            <AppText variant="body" style={styles.storyLineText}>
              {state.storyLegacyKeepChapterId === 'chapter_6' ? '기존 기록 유지는 예전 마지막 막을 새 6막에서 이어갑니다.' : '기존 기록 유지는 현재 막 위치와 완료 기록을 그대로 이어갑니다.'} 새 4막부터 보기는 이전 기록을 보관하고 새 이야기를 다시 시작합니다.
            </AppText>
            <AppText variant="body" style={styles.storyLineText}>
              기존 소지품과 구매 기록은 유지되며 이미 받은 막 보상은 다시 지급되지 않습니다.
            </AppText>
            <SeniorButton testID="legacy-story-keep" label="기존 기록 유지" variant="accent" onPress={() => resolveLegacyStory('keep')} />
            <SeniorButton testID="legacy-story-replay" label="새 4막부터 보기" variant="secondary" onPress={() => resolveLegacyStory('replay')} />
          </ScrollView>
        </View>
      </Modal>


      {/* 승급 축하 금빛 폭죽 연출 — pixelfx `ui/confetti` 시트를 3.5초 재생 */}
      {promotionFx ? (
        <View
          pointerEvents="none"
          style={[styles.promotionFxLayer, { height: Math.max(320, viewportHeight * 0.6) }]}>
          <PixelFx name="promotion" scale={1.5} onDone={() => setPromotionFx(false)} />
          {closestNpcId ? (
            <View style={styles.promotionNpcLine}>
              <AppText variant="caption" style={{ color: '#F0BF4F', fontFamily: FontWeights.strong }}>
                {NPC_DISPLAY[closestNpcId].name}
              </AppText>
              <AppText variant="body" style={{ color: '#FCF9F2', textAlign: 'center' }}>
                {PROMOTION_LINES[closestNpcId]}
              </AppText>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── 상단 HUD: 상태 패널 + 원형 버튼 ── */}
      <View pointerEvents="box-none" style={[hud.top, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={hud.statusCard} onLayout={(event) => setStatusHeight(event.nativeEvent.layout.height)} accessible accessibilityLabel={`${rankProgress.current.label}, 활력 ${state.stats.vitality}, 도토리 ${state.stats.acorns}개, 마음 온도 ${heartWarmth}도`}>
          <View style={hud.statusHeader}>
            <Image source={MASTER_BADGE} style={hud.badge} contentFit="contain" />
            <AppText variant="caption" style={hud.rankText}>{rankProgress.current.label}</AppText>
          </View>
          <View style={hud.barTrack}>
            <View style={[hud.barFill, { width: `${Math.round((state.stats.vitality / state.stats.maxVitality) * 100)}%` }]} />
          </View>
          <HudStats vitality={state.stats.vitality} acorns={state.stats.acorns} warmth={heartWarmth} />
        </View>
        <View style={hud.buttonColumn}>
          <HudButton wide={wideHud} testID="hud-journal" icon={HUD_BAG} label="가방" onPress={() => setSheet('journal')} />
          <HudButton wide={wideHud} testID="btn-open-story-cutscene" icon={HUD_STORY} label="이야기" onPress={() => setStoryModalOpen(true)} />
          <HudButton wide={wideHud} testID="hud-menu" icon={HUD_MENU} label="메뉴" onPress={() => setSheet('menu')} />
          <HudButton wide={wideHud} testID="hud-map" icon={HUD_MAP} label="지도" onPress={() => setMinimapOpen(true)} />
        </View>
      </View>

      {/* 현재 위치 · 안내 토스트 · 동행 표시 */}
      <View pointerEvents="none" style={[hud.toastStack, { top: hudDetailTop, right: wideHud ? 112 : 96 }]}>
        <View style={hud.locationPill}>
          <AppText variant="caption" style={hud.locationText}>
            {regionName(state.mapId, state.playerPos.x, state.playerPos.y)}{compactLocation ? '' : ` · ${currentTile.name ?? '길'}`}
          </AppText>
        </View>
        {companionId ? (
          <View style={hud.locationPill}>
            <AppText variant="caption" style={hud.locationText}>{NPC_DISPLAY[companionId].name}와 산책 중</AppText>
          </View>
        ) : null}
        {actionNotice && !panelOpen ? noticeToast : null}
      </View>

      {/* 최초 1회 프롤로그 + 3단계 튜토리얼 배너 (상단 HUD 아래에 띄웁니다) */}
      {saveProtection === 'ready' && state.storyLegacyChoice !== 'pending' ? (
        <View pointerEvents="box-none" style={[hud.tutorialSlot, { top: hudDetailTop }]}>
          <OnboardingOverlay reduceMotion={reduceMotion} />
        </View>
      ) : null}

      {/* ── 하단: RPG 대화창 + 조이스틱 + 행동 버튼 ── */}
      <View pointerEvents="box-none" style={[hud.bottom, { paddingBottom: insets.bottom + Spacing.md }]}>
        {/* 창이 열려 있으면 안내는 창 바로 위에 — 위로 올린 주인공을 가리지 않게 */}
        {actionNotice && panelOpen ? noticeToast : null}
        {activities.overlay}
        {dialogueNpc && !activities.overlay ? (
          <View style={[styles.dialogueCard, hud.dialogue, { maxHeight: viewportHeight * 0.42 }]}>
            <View style={styles.dialogueHeader}>
              <View style={styles.npcPortraitCircle}>
                <Image source={portraitFor(dialogueNpc.id)} style={styles.npcPortraitImage} contentFit="cover" accessibilityLabel={`${dialogueNpc.name} 초상화`} />
              </View>
              <View style={styles.dialogueNameplate}>
                <AppText variant="caption" style={{ color: '#D8B384' }}>{dialogueNpc.title}</AppText>
                <AppText variant="sectionTitle" style={{ color: '#FCF9F2' }}>{dialogueNpc.name}</AppText>
              </View>
              <Pressable testID="btn-close-dialogue" accessibilityRole="button" accessibilityLabel="대화창 닫기" onPress={() => { setCompanionDialogueOpen(false); setNpcLine(null); setDismissedNpcId(dialogueNpc.id); }} style={hud.closeBtn}>
                <AppText variant="bodyStrong" style={{ color: '#FCF9F2' }}>✕</AppText>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: Spacing.sm }}>
              <TypewriterText
                reduceMotion={reduceMotion !== false}
                style={styles.dialogueLine}
                text={`"${companionDialogueNpc && companionId ? WALK_LINES[companionId][companionLineIndex % WALK_LINES[companionId].length] : dialogueNpc.dialogue[(npcLine?.npcId === dialogueNpc.id ? npcLine.index : 0) % dialogueNpc.dialogue.length]}"`}
              />
              {companionDialogueNpc && companionId && WALK_LINES[companionId].length > 1 ? (
                <SeniorButton label="다른 이야기 듣기" variant="secondary" onPress={() => setCompanionLineIndex((index) => index + 1)} />
              ) : !companionDialogueNpc && dialogueNpc.dialogue.length > 1 ? (
                <SeniorButton label="다른 이야기 듣기" variant="secondary" onPress={() => setNpcLine((current) => ({ npcId: dialogueNpc.id, index: current?.npcId === dialogueNpc.id ? current.index + 1 : 1 }))} />
              ) : null}
              {!companionDialogueNpc && dialogueNpc.id === 'tea_manager' && state.currentChapterId === 'chapter_4' && !state.storyActionFlags.reopen_tea_room ? (
                <AppText variant="body" style={styles.dialogueLine}>다실은 손님맞이를 쉬고 있어요. 준비를 마치면 함께 문을 열어요.</AppText>
              ) : !companionDialogueNpc && dialogueNpc.id === 'tea_manager' && state.storyActionFlags.reopen_tea_room ? (
                <AppText variant="body" style={styles.dialogueLine}>다실이 다시 손님을 맞고 있습니다.</AppText>
              ) : null}
              {!companionDialogueNpc && dialogueNpc.id === 'tea_manager' && state.currentChapterId === 'chapter_4' && state.storyActionFlags.collect_supplies && !state.storyActionFlags.deliver_supplies ? (
                <AppText variant="body" style={styles.dialogueLine}>강 원장의 차와 약재 꾸러미를 가지고 있습니다.</AppText>
              ) : null}
              {STORY_ACTIONS.filter((action) => !companionDialogueNpc && action.npcId === dialogueNpc.id && isStoryActionAvailable(state, action.id)).map((action) => (
                <SeniorButton key={action.id} testID={`story-action-${action.id}`} label={action.label} variant="accent"
                  onPress={() => { setActionNotice(performStoryAction(action.id) ? action.notice : '행동을 저장하지 못했거나 조건이 바뀌었어요. 다시 확인해 주세요.'); }} />
              ))}
              {dialogueNpc.facilityRoute && !companionDialogueNpc ? (
                <SeniorButton
                  testID="btn-enter-facility"
                  label={dialogueNpc.id === 'tea_manager' && state.currentChapterId === 'chapter_4' && !state.storyActionFlags.reopen_tea_room
                    ? '사천성 연습하기 ▶' : dialogueNpc.facilityLabel ?? '시설 입장하기 ▶'}
                  variant="accent"
                  onPress={() => enterPlace(dialogueNpc.facilityRoute!)}
                />
              ) : null}
              <SeniorButton
                testID="btn-walk-together"
                label={companionId === dialogueNpc.id ? '산책 마치기 · 헤어지기' : '같이 걸을까요?'}
                variant="secondary"
                onPress={() => {
                  if (companionId === dialogueNpc.id) {
                    setActionNotice(stopCompanion() ? '산책을 마치고 인사를 나눴습니다.' : '산책 기록을 저장하지 못했어요. 다시 시도해 주세요.');
                    setCompanionDialogueOpen(false);
                    return;
                  }
                  if (startCompanion(dialogueNpc.id as NpcId)) {
                    setCompanionDialogueOpen(false);
                    playSfx('chime', arcadeState.soundEnabled);
                    setActionNotice(`${dialogueNpc.name}과 함께 마을을 걷기 시작했습니다.`);
                  } else setActionNotice('산책을 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
                }}
              />
              {companionId === dialogueNpc.id ? (
                <SeniorButton testID="btn-claim-daily-walk" label={walkClaimAvailable ? '오늘의 산책 마치기 (유대 +15)' : '오늘 산책 기록 완료 ✔'} variant={walkClaimAvailable ? 'primary' : 'secondary'} disabled={!walkClaimAvailable} onPress={handleClaimDailyWalk} />
              ) : null}
              {BOND_EPISODES.filter((episode) => episode.npcId === dialogueNpc.id).map((episode) => (
                <SeniorButton
                  key={episode.id}
                  testID={`bond-episode-${episode.id}`}
                  label={`${episode.title} · 유대 ${episode.threshold}${getBond(bonds, episode.npcId).scenesSeen.includes(episode.id) ? ' ✔' : ''}`}
                  disabled={getBond(bonds, episode.npcId).points < episode.threshold}
                  variant="secondary"
                  onPress={() => setEpisodeId(episode.id)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}
        <View pointerEvents="box-none" style={hud.controlsRow}>
          <VirtualJoystick onVector={handleVector} onRelease={savePosition} onStep={handleStep} disabled={modalOpen || !activities.active} reduceMotion={reduceMotion} />
          <Pressable
            testID="btn-world-action"
            accessibilityRole="button"
            accessibilityLabel={availableActions.length > 1
              ? `활동 ${availableActions.length}가지 선택: ${availableActions.map((item) => item.label.replace(/\s+/g, ' ')).join(', ')}`
              : worldAction ? worldAction.label.replace(/\s+/g, ' ') : '주변에 할 일이 없습니다'}
            disabled={!worldAction}
            onPress={worldAction?.run}
            style={({ pressed }) => [hud.actionBtn, !worldAction && hud.actionBtnIdle, pressed && hud.actionBtnPressed]}>
            <AppText variant="bodyStrong" style={hud.actionText}>{worldAction?.label ?? '둘러보기'}</AppText>
          </Pressable>
        </View>
      </View>

      <Minimap map={map} player={state.playerPos} visible={minimapOpen} companionId={companionId} reduceMotion={reduceMotion} onClose={() => setMinimapOpen(false)} />
      <BusSheet from={state.mapId} visible={busOpen} reduceMotion={reduceMotion} hasCompanion={Boolean(companionId)} onClose={() => setBusOpen(false)} onTravel={handleTravel} />

      {/* 가방·메뉴 바텀시트 */}
      <Modal visible={sheet !== null} transparent animationType={slideTransition} onRequestClose={() => setSheet(null)}>
        <View style={hud.sheetBackdrop}>
          <View style={[hud.sheet, { maxHeight: viewportHeight * 0.86, paddingBottom: insets.bottom + Spacing.md }]}>
            <View style={hud.sheetHeader}>
              <AppText variant="sectionTitle" style={{ color: '#182620' }}>{sheet === 'menu' ? '마을 메뉴' : '나들이 가방 · 일지'}</AppText>
              <Pressable testID="btn-close-sheet" accessibilityRole="button" accessibilityLabel="닫기" onPress={() => setSheet(null)} style={hud.sheetClose}>
                <AppText variant="bodyStrong" style={{ color: '#182620' }}>닫기</AppText>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: Spacing.md, paddingBottom: Spacing.lg }}>
              {sheet === 'menu' ? (
                <>
                  <SeniorButton testID="btn-open-master-hall" label="명인전당 가기 ▶" variant="accent" onPress={() => { setSheet(null); router.push('/me' as Href); }} />
                  {companionId ? (
                    <View style={hud.quickSettings}>
                      <AppText variant="sectionTitle" style={hud.settingsTitle}>{NPC_DISPLAY[companionId].name}와 산책 중</AppText>
                      <AppText variant="caption" style={hud.settingsTitle}>마을 어디에서든 오늘의 산책을 기록하거나 동행을 마칠 수 있어요.</AppText>
                      <SeniorButton testID="btn-menu-talk-companion" label="동행과 이야기하기" variant="secondary"
                        onPress={() => { activities.cancel(); setSheet(null); setDismissedNpcId(null); setCompanionLineIndex(0); setCompanionDialogueOpen(true); }} />
                      <SeniorButton testID="btn-menu-claim-walk" label={walkClaimAvailable ? '오늘의 산책 기록하기' : '오늘 산책 기록 완료 ✔'} variant={walkClaimAvailable ? 'primary' : 'secondary'} disabled={!walkClaimAvailable}
                        onPress={() => { setSheet(null); handleClaimDailyWalk(); }} />
                      <SeniorButton testID="btn-menu-end-walk" label="인사하고 동행 마치기" variant="secondary"
                        onPress={() => {
                          setSheet(null);
                          setCompanionDialogueOpen(false);
                          setActionNotice(stopCompanion() ? '산책을 마치고 인사를 나눴습니다.' : '산책 기록을 저장하지 못했어요. 다시 시도해 주세요.');
                        }} />
                    </View>
                  ) : null}
                  <View style={hud.quickSettings}>
                    <AppText variant="sectionTitle" style={hud.settingsTitle}>편안한 화면 설정</AppText>
                    <ArcadeSaveNotice />
                    <QuickSetting label="큰 글씨" value={largeTextEnabled} onChange={toggleLargeText} />
                    <QuickSetting label="효과음과 배경 음악" value={arcadeState.soundEnabled} onChange={toggleSound} />
                    <QuickSetting label="진동" value={arcadeState.hapticEnabled} onChange={toggleHaptic} />
                    <QuickSetting label="화면 움직임 줄이기" value={arcadeState.reduceMotion} onChange={toggleReduceMotion} />
                    <AppText variant="caption" style={hud.settingsTitle}>기기의 움직임 줄이기 설정도 함께 적용됩니다.</AppText>
                  </View>
                  <IdlePanel />
                </>
              ) : sheet === 'journal' ? (
                <>
                  <View style={[styles.morningRoutineCard, stackRoutine && { flexDirection: 'column' }]}>
                    <View style={stackRoutine ? undefined : { flex: 1 }}>
                      <SeniorButton testID="btn-morning-gym" label={state.stats.dailyMorningGymDone ? '체조 완료 ✔' : '아침 체조하기'}
                        variant={state.stats.dailyMorningGymDone ? 'secondary' : 'primary'} onPress={() => { setSheet(null); handleMorningGym(); }} />
                    </View>
                    <View style={stackRoutine ? undefined : { flex: 1 }}>
                      <SeniorButton testID="btn-take-meds" label={state.stats.dailyMedicationTaken ? '약 복용 완료 ✔' : '혈압약 복용하기'}
                        variant={state.stats.dailyMedicationTaken ? 'secondary' : 'accent'} onPress={() => { setSheet(null); handleTakeMedication(); }} />
                    </View>
                  </View>
                  <DexPanel />
                  <AlbumPanel />
                  <JournalPanel onNotice={setActionNotice} nowMs={activities.nowMs} />
                  <HomeBannerAd />
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function QuickSetting({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return (
    <View style={hud.settingRow}>
      <AppText variant="bodyStrong" style={hud.settingLabel}>{label}</AppText>
      <Switch accessibilityLabel={label} hitSlop={10} value={value} onValueChange={onChange} />
    </View>
  );
}

function HudButton({ testID, icon, label, onPress, wide }: { testID: string; icon: number; label: string; onPress: () => void; wide: boolean }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[hud.hudButton, wide && hud.wideHudButton]}>
      <Image source={icon} style={hud.hudIcon} contentFit="contain" />
      <AppText variant="caption" style={hud.hudLabel}>{label}</AppText>
    </Pressable>
  );
}
