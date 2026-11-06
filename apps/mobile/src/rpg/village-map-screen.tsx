import { Image } from 'expo-image';
import { type Href, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { HomeBannerAd } from '@/ads/HomeBannerAd';
import { useArcade } from '@/arcade/arcade-store';
import { FocusedBackgroundAudio } from '@/audio/focused-background-audio';
import { playSfx } from '@/audio/sound-manager';
import { AppText, Card, Screen, SectionHeader, SeniorButton } from '@/components/ui';
import { FontWeights, Layout, Radius, Spacing } from '@/constants/theme';
import { PixelFx } from '@/fx/pixel-fx';

import { ExitConfirmDialog } from './exit-confirm-dialog';
import { NPC_DISPLAY, PROMOTION_LINES } from './companion-lines';
import { BOND_ENDING_LINES, BOND_EPISODES } from './bond-episodes';
import { bondProgress, closestNpc, getBond, NPC_IDS, type NpcId } from './bond-logic';
import { OnboardingOverlay } from './onboarding-overlay';
import { PixelVillageMap } from './pixel-village-map';
import { useAndroidBackExit } from './use-android-back-exit';
import { canMoveTo, findNearbyNpc, getVillageTile } from './rpg-logic';
import { isStoryActionAvailable, STORY_ACTIONS, storyStatus, storyTrialCompleted, trialResolved } from './story-progress';
import { STORY_CONTINUATION_DIALOGUE } from './story-data';
import { portraitFor } from './rpg-sprites';
import { useRpg } from './rpg-store';

const MASTER_BADGE = require('../../assets/game/rpg/pixel/ui/badge_master.png');
const BGM_CLUB_LOUNGE = require('../../assets/audio/bgm_club_lounge_morning_01.m4a');
const MODE_ICON_PARKGOLF = require('../../assets/game/rpg/pixel/ui/mode_parkgolf.png');
const MODE_ICON_ALKKAGI = require('../../assets/game/rpg/pixel/ui/mode_alkkagi.png');
const MODE_ICON_SACHEONSEONG = require('../../assets/game/rpg/pixel/ui/mode_sacheonseong.png');
const DAILY_SEAL_STAMP = require('../../assets/game/rpg/ui/ui_daily_seal_stamp_01.png');

function offlineDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  return minutes > 0 ? `${minutes}분` : `${Math.floor(seconds)}초`;
}

export function VillageMapScreen() {
  const router = useRouter();
  const { rankProgress, state: arcadeState, claimAttendanceStamp } = useArcade();
  const {
    state,
    saveProtection,
    resolveLegacyStory,
    productionRates,
    currentChapter,
    pendingOfflineReward,
    claimOfflineReward,
    upgradeFacility,
    assignPartnerToFacility,
    recruitPartner,
    advanceChapter,
    continueStoryAfterFailures,
    performStoryAction,
    chooseBondEpisode,
    movePlayer,
    doMorningGym,
    takeMedication,
    claimQuestReward,
    useInventoryItem: applyItem,
    advanceOnboarding,
    bonds,
    companionId,
    heartWarmth,
    startCompanion,
    stopCompanion,
    claimDailyWalk,
  } = useRpg();

  const [activeTab, setActiveTab] = useState<'map' | 'idle' | 'story' | 'journal'>('map');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const chapterStatus = storyStatus(state, arcadeState.cp);
  const trialDone = storyTrialCompleted(state);
  const trialSkipped = state.storySkippedTrialIds.includes(currentChapter.id);
  const chapterActions = STORY_ACTIONS.filter((action) => action.chapterId === currentChapter.id);
  const recordedLegacyChapter = state.storyLegacyChoice === 'keep' && currentChapter.id === 'chapter_4' && state.completedChapterIds.includes('chapter_4');
  const showOutro = chapterStatus.kind === 'finished' || (trialResolved(state) && chapterStatus.kind !== 'actions') || recordedLegacyChapter;
  const unknownLegacyResult = chapterStatus.kind === 'finished' && !trialDone && !trialSkipped;
  const [storyModalOpen, setStoryModalOpen] = useState(false);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const activeEpisode = BOND_EPISODES.find((episode) => episode.id === episodeId);
  const episodeBond = activeEpisode ? getBond(bonds, activeEpisode.npcId) : null;
  const chosenEpisodeOption = activeEpisode?.choices.find((choice) => choice.id === episodeBond?.sceneChoices?.[activeEpisode.id]);
  // 안드로이드 뒤로가기 → 종료 확인 (홈 탭에서만)
  const backExit = useAndroidBackExit();
  const [promotionFx, setPromotionFx] = useState(false);
  const closestNpcId = useMemo(() => closestNpc(bonds), [bonds]);
  // 아침 체조·약 복용 성공 시 마을 위에 잠깐 피어오르는 회복 이펙트 (key로 재시작)
  const [healFxKey, setHealFxKey] = useState(0);
  const { height: viewportHeight } = useWindowDimensions();

  const dailyMissions = arcadeState.dailyMissions;
  const missionRows = [
    {
      key: 'parkgolf',
      icon: MODE_ICON_PARKGOLF,
      title: '파크골프',
      subtitle: '1홀 클리어',
      done: dailyMissions.parkGolfDone,
    },
    {
      key: 'alkkagi',
      icon: MODE_ICON_ALKKAGI,
      title: '알까기',
      subtitle: '대국 1승',
      done: dailyMissions.alkkagiDone,
    },
    {
      key: 'sacheonseong',
      icon: MODE_ICON_SACHEONSEONG,
      title: '사천성',
      subtitle: '1판 클리어',
      done: dailyMissions.sacheonseongDone,
    },
  ];

  const currentTile = useMemo(
    () => getVillageTile(state.playerPos.x, state.playerPos.y),
    [state.playerPos.x, state.playerPos.y],
  );

  const nearbyNpc = useMemo(
    () => findNearbyNpc(state.playerPos.x, state.playerPos.y),
    [state.playerPos.x, state.playerPos.y],
  );

  const handleMove = (dx: number, dy: number) => {
    const nx = state.playerPos.x + dx;
    const ny = state.playerPos.y + dy;
    if (canMoveTo(nx, ny)) {
      movePlayer(dx, dy);
      advanceOnboarding('moved');
      setActionNotice(null);
    } else {
      setActionNotice('돌담이나 강가로는 이동할 수 없습니다.');
    }
  };

  const handleMorningGym = () => {
    if (state.stats.dailyMorningGymDone) {
      advanceOnboarding('gymDone');
      setActionNotice('오늘 아침 체조는 이미 상쾌하게 마치셨습니다.');
    } else {
      doMorningGym();
      advanceOnboarding('gymDone');
      setHealFxKey((key) => key + 1);
      setActionNotice('기운찬 아침 체조 완료! 활력 +20 HP · 연륜 +50 EXP 회복!');
    }
  };

  const handleTakeMedication = () => {
    if (state.stats.dailyMedicationTaken) {
      setActionNotice('오늘 혈압약과 영양제를 이미 복용하셨습니다.');
    } else {
      takeMedication();
      setHealFxKey((key) => key + 1);
      setActionNotice('약 복용 완료! 활력이 가득 차오르고 마을 덕망이 올랐습니다.');
    }
  };

  const handleClaimDailyWalk = () => {
    if (!companionId) return;
    const claimed = claimDailyWalk();
    playSfx('chime', arcadeState.soundEnabled);
    setActionNotice(
      claimed
        ? `${NPC_DISPLAY[companionId].name}와의 산책 완료! 유대 +15 · 마음 온도 +5`
        : '오늘은 이미 함께 걸었어요. 내일 또 만나요.',
    );
  };

  const handleClaimAttendanceStamp = () => {
    const claimed = claimAttendanceStamp();
    if (claimed) {
      playSfx('chime', arcadeState.soundEnabled);
      setActionNotice('개근 도장을 찍었습니다! 명예 인장이 모였습니다.');
    }
  };

  return (
    <Screen testID="village-map-screen" contentContainerStyle={styles.container}>
      <FocusedBackgroundAudio source={BGM_CLUB_LOUNGE} enabled={arcadeState.soundEnabled} />
      {/* 최초 1회 프롤로그 + 3단계 튜토리얼 배너 */}
      {saveProtection === 'ready' && state.storyLegacyChoice !== 'pending' ? <OnboardingOverlay /> : null}

      {/* 안드로이드 하드웨어 뒤로가기 종료 확인 */}
      <ExitConfirmDialog
        visible={backExit.confirming}
        onCancel={backExit.cancel}
        onConfirm={backExit.confirm}
      />

      {/* 0. 오프라인 방치 보상 수령 모달 */}
      {pendingOfflineReward && saveProtection === 'ready' && state.storyLegacyChoice !== 'pending' ? (
        <Modal visible transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.offlineRewardCard}>
              <AppText style={{ fontSize: 40, textAlign: 'center' }}>🎁</AppText>
              <AppText variant="sectionTitle" style={styles.offlineTitle}>
                어르신, 편히 쉬고 오셨습니까?
              </AppText>
              <AppText variant="body" style={styles.offlineDesc}>
                마을 시설에 배치된 이웃 동료들이 쉬는 동안 부지런히 수련과 살림을 도왔습니다! ({offlineDuration(pendingOfflineReward.cappedElapsedSec)} 누적)
              </AppText>
              <View style={styles.rewardBox}>
                <AppText variant="bodyStrong" style={{ color: '#0E5142' }}>
                  🌰 도토리 +{pendingOfflineReward.earnedAcorns.toLocaleString()}개 획득
                </AppText>
                <AppText variant="bodyStrong" style={{ color: '#855B00' }}>
                  📖 연륜 +{pendingOfflineReward.earnedExp.toLocaleString()} EXP 누적
                </AppText>
              </View>
              <SeniorButton
                testID="btn-claim-offline-reward"
                label="감사히 받기 (+수령)"
                variant="accent"
                onPress={() => claimOfflineReward(false)}
              />
            </View>
          </View>
        </Modal>
      ) : null}

      {/* 유대 에피소드는 선택과 그 결과를 저장해 다시 열어볼 수 있습니다. */}
      <Modal visible={Boolean(activeEpisode)} transparent animationType="slide" onRequestClose={() => setEpisodeId(null)}>
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
      <Modal visible={storyModalOpen} transparent animationType="slide" onRequestClose={() => setStoryModalOpen(false)}>
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
                🎯 시련: {currentChapter.climaxTrial.opponentName}
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
                  playSfx('chime', arcadeState.soundEnabled);
                  setPromotionFx(true);
                  advanceChapter(arcadeState.cp);
                  setStoryModalOpen(false);
                }}
              />
              <SeniorButton label="마을로 돌아가기" variant="secondary" onPress={() => setStoryModalOpen(false)} />
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* 이전 4막이 어느 이야기인지 알 수 없으므로 직접 이어갈 경로를 고릅니다. */}
      <Modal visible={saveProtection === 'ready' && state.storyLegacyChoice === 'pending'} transparent animationType="fade" onRequestClose={() => undefined}>
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

      {/* 1. 시니어 RPG 상태 헤더 (활력 HP, 연륜 EXP, 마을 도토리, 급수) */}
      <View style={styles.statusPlaque}>
        <View style={styles.plaqueHeaderRow}>
          <Image source={MASTER_BADGE} style={styles.badgeSmall} contentFit="contain" />
          <View style={{ flex: 1 }}>
            <View style={styles.tagRow}>
              <View style={styles.villageTag}>
                <AppText variant="caption" style={styles.villageTagText}>청솔 시니어 마을</AppText>
              </View>
              <AppText variant="caption" style={{ color: '#F0BF4F', fontFamily: FontWeights.strong }}>
                {rankProgress.current.label}
              </AppText>
            </View>
            <AppText variant="title" style={{ color: '#FCF9F2' }}>
              주인공 어르신의 하루
            </AppText>
          </View>
        </View>

        <View style={styles.statsBarGrid}>
          <View style={styles.statBarBox}>
            <View style={styles.barLabelRow}>
              <AppText variant="caption" style={{ color: '#E4EDDA' }}>활력 (HP)</AppText>
              <AppText variant="caption" style={{ color: '#F0BF4F', fontVariant: ['tabular-nums'] }}>
                {state.stats.vitality} / {state.stats.maxVitality}
              </AppText>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFillVitality,
                  { width: `${Math.round((state.stats.vitality / state.stats.maxVitality) * 100)}%` },
                ]}
              />
            </View>
          </View>

          <View style={styles.statBarBox}>
            <View style={styles.barLabelRow}>
              <AppText variant="caption" style={{ color: '#E4EDDA' }}>연륜 (EXP)</AppText>
              <AppText variant="caption" style={{ color: '#F0BF4F', fontVariant: ['tabular-nums'] }}>
                {state.stats.wisdomExp} EXP
              </AppText>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFillWisdom,
                  { width: `${Math.min(100, Math.round((state.stats.wisdomExp / 1000) * 100))}%` },
                ]}
              />
            </View>
          </View>
        </View>

        <View style={styles.currencyRow}>
          <AppText variant="caption" style={styles.currencyText}>
            마을 도토리: 🌰 {state.stats.acorns}개 · 방치 생산: +{productionRates.acornsPerSec}개/초 · 덕망: 🎖 {state.stats.reputation}점
          </AppText>
        </View>
      </View>

      {/* 4단계 인생 드라마 컷신 배너 */}
      <Pressable
        testID="btn-open-story-cutscene"
        accessibilityRole="button"
        onPress={() => setStoryModalOpen(true)}
        style={styles.storyProgressionBanner}>
        <View style={{ flex: 1 }}>
          <AppText variant="caption" style={{ color: '#F0BF4F', fontFamily: FontWeights.strong }}>
            인생 6막 승단 서사: {currentChapter.title}
          </AppText>
          <AppText variant="body" style={{ color: '#FCF9F2', fontSize: 15 }}>
            시험: {currentChapter.climaxTrial.description}
          </AppText>
        </View>
        <View style={styles.storyEnterPill}>
          <AppText variant="caption" style={{ color: '#FCF9F2', fontFamily: FontWeights.strong }}>
            이야기 보기 ▶
          </AppText>
        </View>
      </Pressable>

      {/* 1-1. 동행 산책 카드 — NPC와 함께 걷는 루틴 */}
      {companionId ? (
        <Card style={styles.companionCard}>
          <View style={styles.companionRow}>
            <Image
              source={portraitFor(companionId)}
              style={styles.companionPortrait}
              contentFit="cover"
              accessibilityLabel={`${NPC_DISPLAY[companionId].name} 초상화`}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong" style={{ color: '#182620' }}>
                {NPC_DISPLAY[companionId].name}와 산책 중 🚶
              </AppText>
              <AppText variant="caption" style={{ color: '#526451' }}>
                유대 {bondProgress(getBond(bonds, companionId).points).label} · 마음 온도 {heartWarmth}°
              </AppText>
              <View style={styles.companionTrack}>
                <View
                  style={[
                    styles.companionFill,
                    { width: `${Math.round(bondProgress(getBond(bonds, companionId).points).ratio * 100)}%` },
                  ]}
                />
              </View>
            </View>
          </View>
          <View style={styles.companionActions}>
            <SeniorButton
              testID="btn-claim-daily-walk"
              label={
                getBond(bonds, companionId).lastWalkDay === new Date(
                  new Date().getFullYear(),
                  new Date().getMonth(),
                  new Date().getDate(),
                )
                  .toISOString()
                  .slice(0, 10)
                  ? '오늘 산책 완료 ✔'
                  : '오늘의 산책 마치기 (유대 +15)'
              }
              variant="primary"
              onPress={handleClaimDailyWalk}
            />
            <SeniorButton
              testID="btn-stop-companion"
              label="산책 마치기 · 헤어지기"
              variant="secondary"
              onPress={() => {
                stopCompanion();
                setActionNotice('산책을 마치고 아침 인사를 나눴습니다.');
              }}
            />
          </View>
        </Card>
      ) : null}

      {/* 2. 상쾌한 아침 건강 2종 루틴 (시니어 생활 경험) */}
      <View style={styles.morningRoutineCard}>
        <View style={{ flex: 1 }}>
          <SeniorButton
            testID="btn-morning-gym"
            label={state.stats.dailyMorningGymDone ? '체조 완료 ✔' : '아침 체조하기 🧘'}
            variant={state.stats.dailyMorningGymDone ? 'secondary' : 'primary'}
            onPress={handleMorningGym}
          />
        </View>
        <View style={{ flex: 1 }}>
          <SeniorButton
            testID="btn-take-meds"
            label={state.stats.dailyMedicationTaken ? '약 복용 완료 ✔' : '혈압약 복용 💊'}
            variant={state.stats.dailyMedicationTaken ? 'secondary' : 'accent'}
            onPress={handleTakeMedication}
          />
        </View>
      </View>

      {actionNotice ? (
        <View style={styles.noticeBox}>
          <AppText variant="bodyStrong" style={{ color: '#0E5142' }}>{actionNotice}</AppText>
        </View>
      ) : null}

      {/* 3. 모드 탭 전환 (청솔마을 맵 vs 퀘스트 일지/가방) */}
      <View style={styles.tabToggleRow}>
        <Pressable
          testID="tab-toggle-map"
          accessibilityRole="button"
          onPress={() => setActiveTab('map')}
          style={[styles.toggleBtn, activeTab === 'map' && styles.toggleBtnActive]}>
          <AppText
            variant="caption"
            style={{ color: activeTab === 'map' ? '#182620' : '#FCF9F2', fontFamily: FontWeights.strong }}>
            🏡 마을 걷기
          </AppText>
        </Pressable>
        <Pressable
          testID="tab-toggle-idle"
          accessibilityRole="button"
          onPress={() => setActiveTab('idle')}
          style={[styles.toggleBtn, activeTab === 'idle' && styles.toggleBtnActive]}>
          <AppText
            variant="caption"
            style={{ color: activeTab === 'idle' ? '#182620' : '#FCF9F2', fontFamily: FontWeights.strong }}>
            🌾 방치 시설
          </AppText>
        </Pressable>
        <Pressable
          testID="tab-toggle-story"
          accessibilityRole="button"
          onPress={() => setActiveTab('story')}
          style={[styles.toggleBtn, activeTab === 'story' && styles.toggleBtnActive]}>
          <AppText
            variant="caption"
            style={{ color: activeTab === 'story' ? '#182620' : '#FCF9F2', fontFamily: FontWeights.strong }}>
            📖 인생 6막
          </AppText>
        </Pressable>
        <Pressable
          testID="tab-toggle-journal"
          accessibilityRole="button"
          onPress={() => setActiveTab('journal')}
          style={[styles.toggleBtn, activeTab === 'journal' && styles.toggleBtnActive]}>
          <AppText
            variant="caption"
            style={{ color: activeTab === 'journal' ? '#182620' : '#FCF9F2', fontFamily: FontWeights.strong }}>
            📜 일지/가방
          </AppText>
        </Pressable>
      </View>

      {activeTab === 'map' ? (
        <>
          {/* 4. 15 x 15 픽셀 타일 청솔마을 뷰포트 (카메라가 주인공을 따라갑니다) */}
          <View style={styles.mapViewportFrame}>
            <PixelVillageMap />

            {/* 체조·약 복용 회복 연출 — pixelfx `holy/heal` */}
            {healFxKey > 0 ? (
              <PixelFx
                key={healFxKey}
                name="heal"
                scale={1.6}
                onDone={() => setHealFxKey(0)}
                style={styles.healFxLayer}
              />
            ) : null}

            {/* 현재 발 딛은 위치 안내 캡션 */}
            <View style={styles.locationBanner} pointerEvents="none">
              <AppText variant="caption" style={styles.locationBannerText}>
                현재 위치: {currentTile.name ?? '마을 길'} ({state.playerPos.x}, {state.playerPos.y})
              </AppText>
            </View>
          </View>

          {/* 5. 고전 원목 대화창 & 시설 입장 액션 */}
          {nearbyNpc ? (
            <Card style={styles.dialogueCard}>
              <View style={styles.dialogueHeader}>
                <View style={styles.npcPortraitCircle}>
                  <Image
                    source={portraitFor(nearbyNpc.id)}
                    style={styles.npcPortraitImage}
                    contentFit="cover"
                    accessibilityLabel={`${nearbyNpc.name} 초상화`}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="caption" style={{ color: '#D8B384' }}>{nearbyNpc.title}</AppText>
                  <AppText variant="sectionTitle" style={{ color: '#FCF9F2' }}>{nearbyNpc.name}</AppText>
                </View>
              </View>
              <View style={styles.dialogueBody}>
                {nearbyNpc.dialogue.map((line, i) => (
                  <AppText key={i} variant="body" style={styles.dialogueLine}>
                    {`"${line}"`}
                  </AppText>
                ))}
                {nearbyNpc.id === 'tea_manager' && state.currentChapterId === 'chapter_4' && !state.storyActionFlags.reopen_tea_room ? (
                  <AppText variant="body" style={styles.dialogueLine}>다실은 손님맞이를 쉬고 있어요. 준비를 마치면 함께 문을 열어요.</AppText>
                ) : nearbyNpc.id === 'tea_manager' && state.storyActionFlags.reopen_tea_room ? (
                  <AppText variant="body" style={styles.dialogueLine}>다실이 다시 손님을 맞고 있습니다.</AppText>
                ) : null}
                {nearbyNpc.id === 'tea_manager' && state.currentChapterId === 'chapter_4' && state.storyActionFlags.collect_supplies && !state.storyActionFlags.deliver_supplies ? (
                  <AppText variant="body" style={styles.dialogueLine}>강 원장의 차와 약재 꾸러미를 가지고 있습니다.</AppText>
                ) : null}
              </View>
              <View style={styles.dialogueActions}>
                {STORY_ACTIONS.filter((action) => action.npcId === nearbyNpc.id && isStoryActionAvailable(state, action.id)).map((action) => (
                  <SeniorButton
                    key={action.id}
                    testID={`story-action-${action.id}`}
                    label={action.label}
                    variant="accent"
                    onPress={() => {
                      performStoryAction(action.id);
                      setActionNotice(action.notice);
                    }}
                  />
                ))}
                {BOND_EPISODES.filter((episode) => episode.npcId === nearbyNpc.id).map((episode) => (
                  <SeniorButton
                    key={episode.id}
                    testID={`bond-episode-${episode.id}`}
                    label={`${episode.title} · 유대 ${episode.threshold}${getBond(bonds, episode.npcId).scenesSeen.includes(episode.id) ? ' ✔' : ''}`}
                    disabled={getBond(bonds, episode.npcId).points < episode.threshold}
                    variant="secondary"
                    onPress={() => setEpisodeId(episode.id)}
                  />
                ))}
                <SeniorButton
                  testID="btn-walk-together"
                  label={
                    companionId === nearbyNpc.id ? '산책 중입니다 ✔' : '같이 걸을까요?'
                  }
                  variant="secondary"
                  onPress={() => {
                    if (companionId === nearbyNpc.id) return;
                    startCompanion(nearbyNpc.id as NpcId);
                    playSfx('chime', arcadeState.soundEnabled);
                    setActionNotice(
                      `${nearbyNpc.name}과 함께 마을을 걷기 시작했습니다.`,
                    );
                  }}
                />
                {nearbyNpc.facilityRoute ? (
                  <SeniorButton
                    testID="btn-enter-facility"
                    label={nearbyNpc.id === 'tea_manager' && state.currentChapterId === 'chapter_4' && !state.storyActionFlags.reopen_tea_room
                      ? '사천성 연습하기 ▶' : nearbyNpc.facilityLabel ?? '시설 입장하기 ▶'}
                    variant="accent"
                    onPress={() => {
                      // 튜토리얼 3단계는 파크골프 입장으로만 완료됩니다.
                      if (nearbyNpc.facilityRoute === '/clubs') advanceOnboarding('openedParkGolf');
                      router.push({ pathname: nearbyNpc.facilityRoute, params: { storyChapter: '' } } as Href);
                    }}
                  />
                ) : null}
              </View>
            </Card>
          ) : (
            <Card style={styles.strollCard}>
              <AppText variant="bodyStrong" style={{ color: '#182620' }}>
                마을 산책 중입니다
              </AppText>
              <AppText variant="caption" style={{ color: '#526451' }}>
                아래 십자키(D-pad)를 눌러 마을 길을 따라 걸어가 보세요. 마을회관은 북쪽, 파크골프장·매화다실은
                서쪽, 송학기원·청솔 한약방은 동쪽에 있습니다.
              </AppText>
            </Card>
          )}

          {/* 6. 시니어 친화 큼직한 레트로 4방향 십자키 컨트롤 (56dp 타깃) */}
          <View style={styles.dpadContainer}>
            <Pressable
              testID="dpad-up"
              accessibilityRole="button"
              accessibilityLabel="위로 걷기"
              onPress={() => handleMove(0, -1)}
              style={styles.dpadBtn}>
              <AppText variant="title" style={styles.dpadArrowText}>▲</AppText>
            </Pressable>
            <View style={styles.dpadMiddleRow}>
              <Pressable
                testID="dpad-left"
                accessibilityRole="button"
                accessibilityLabel="왼쪽으로 걷기"
                onPress={() => handleMove(-1, 0)}
                style={styles.dpadBtn}>
                <AppText variant="title" style={styles.dpadArrowText}>◀</AppText>
              </Pressable>
              <View style={styles.dpadCenterHub}>
                <AppText variant="caption" style={{ color: '#D8B384', fontSize: 11 }}>이동</AppText>
              </View>
              <Pressable
                testID="dpad-right"
                accessibilityRole="button"
                accessibilityLabel="오른쪽으로 걷기"
                onPress={() => handleMove(1, 0)}
                style={styles.dpadBtn}>
                <AppText variant="title" style={styles.dpadArrowText}>▶</AppText>
              </Pressable>
            </View>
            <Pressable
              testID="dpad-down"
              accessibilityRole="button"
              accessibilityLabel="아래로 걷기"
              onPress={() => handleMove(0, 1)}
              style={styles.dpadBtn}>
              <AppText variant="title" style={styles.dpadArrowText}>▼</AppText>
            </Pressable>
          </View>
        </>
      ) : activeTab === 'idle' ? (
        /* 방치형 시설 및 동료 탭 */
        <View style={{ gap: Spacing.md }}>
          <SectionHeader title="마을 방치 수련 시설" description="시설 레벨을 올리고 동료를 배치해 자동 수급량을 늘리세요" />
          {state.facilities.map((fac) => {
            const assignedPartner = state.partners.find((p) => p.assignedFacilityId === fac.id);
            const canUpgrade = state.stats.acorns >= fac.upgradeCost;
            return (
              <Card key={fac.id} style={styles.facilityCard}>
                <View style={styles.facilityTopRow}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" style={{ color: '#182620' }}>
                      {fac.name} (Lv.{fac.level})
                    </AppText>
                    <AppText variant="caption" style={{ color: '#526451' }}>
                      기본 생산: +{fac.baseAcornsPerSec} 도토리/초 · +{fac.baseExpPerSec} EXP/초
                    </AppText>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => upgradeFacility(fac.id)}
                    style={[styles.upgradeBtn, !canUpgrade && { opacity: 0.55 }]}>
                    <AppText variant="caption" style={{ color: '#FCF9F2', fontFamily: FontWeights.strong }}>
                      레벨업 (🌰 {fac.upgradeCost}개)
                    </AppText>
                  </Pressable>
                </View>
                <View style={styles.partnerAssignRow}>
                  <AppText variant="caption" style={{ color: '#0E5142', fontFamily: FontWeights.emphasis }}>
                    담당 파트너: {assignedPartner ? `${assignedPartner.avatar} ${assignedPartner.name} (${assignedPartner.roleTitle})` : '미배치 (효과 없음)'}
                  </AppText>
                </View>
              </Card>
            );
          })}

          <SectionHeader title="영입 가능한 이웃 동료" description="마을 어르신을 영입하고 시설에 배치하세요" />
          <View style={{ gap: Spacing.sm }}>
            {state.partners.map((partner) => {
              const canRecruit = !partner.recruited && state.stats.acorns >= partner.recruitCost;
              return (
                <Card key={partner.id} style={styles.partnerCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                    <AppText style={{ fontSize: 32 }}>{partner.avatar}</AppText>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyStrong" style={{ color: '#182620' }}>
                        {partner.name} · {partner.roleTitle}
                      </AppText>
                      <AppText variant="caption" style={{ color: '#526451' }}>
                        {partner.description}
                      </AppText>
                    </View>
                    {partner.recruited ? (
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        {(['parkgolf', 'alkkagi', 'sacheonseong'] as const).map((fid) => (
                          <Pressable
                            key={fid}
                            onPress={() => assignPartnerToFacility(partner.id, fid)}
                            style={[
                              styles.assignMiniBtn,
                              partner.assignedFacilityId === fid && styles.assignMiniBtnActive,
                            ]}>
                            <AppText variant="caption" style={{ fontSize: 11, color: partner.assignedFacilityId === fid ? '#FCF9F2' : '#182620' }}>
                              {fid === 'parkgolf' ? '골프' : fid === 'alkkagi' ? '기원' : '다실'}
                            </AppText>
                          </Pressable>
                        ))}
                      </View>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => recruitPartner(partner.id)}
                        style={[styles.upgradeBtn, !canRecruit && { opacity: 0.55 }]}>
                        <AppText variant="caption" style={{ color: '#FCF9F2', fontFamily: FontWeights.strong }}>
                          영입 (🌰 {partner.recruitCost}개)
                        </AppText>
                      </Pressable>
                    )}
                  </View>
                </Card>
              );
            })}
          </View>
        </View>
      ) : activeTab === 'story' ? (
        /* 4단계 인생 스토리 열람 탭 */
        <View style={{ gap: Spacing.md }}>
          <SectionHeader title="인생 6막 승단 스토리" description="어르신의 발자취와 다음 시험을 확인하세요" />
          <Card style={styles.storyCardLarge}>
            <AppText variant="caption" style={{ color: '#D8B384', fontFamily: FontWeights.strong }}>
              현재 진행: {currentChapter.title}
            </AppText>
            <AppText variant="sectionTitle" style={{ color: '#FCF9F2' }}>
              필요 급수: {currentChapter.rankRequirement}
            </AppText>
            <View style={styles.storyDialogueBox}>
              <AppText variant="body" style={styles.storyLineText}>
                {chapterStatus.kind === 'finished' ? '여섯 막 이야기를 마쳤습니다.' : recordedLegacyChapter ? '이전 완료 기록을 이어갑니다.' : '시련과 마을에서 함께할 일을 확인해 주세요.'}
              </AppText>
            </View>
            <SeniorButton
              label="이야기와 진행 상황 보기 ▶"
              variant="accent"
              onPress={() => setStoryModalOpen(true)}
            />
          </Card>
        </View>
      ) : (
        /* 퀘스트 저널 및 가방 탭 */
        <View style={{ gap: Spacing.md }}>
          <Card style={styles.dailyCard}>
            <SectionHeader
              title="오늘의 일과"
              description="매일 자정에 새로워집니다 · 파크골프·알까기·사천성 각 1회"
            />
            {missionRows.map((mission) => (
              <View key={mission.key} style={styles.missionRow}>
                <Image
                  source={mission.icon}
                  style={styles.missionIcon}
                  contentFit="contain"
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" style={{ color: '#182620' }}>
                    {mission.title}
                  </AppText>
                  <AppText variant="caption" style={{ color: '#526451' }}>
                    {mission.subtitle}
                  </AppText>
                </View>
                <AppText
                  variant="caption"
                  style={{
                    color: mission.done ? '#236B4D' : '#855B00',
                    fontFamily: FontWeights.strong,
                  }}>
                  {mission.done ? '완료 ✔' : '남음'}
                </AppText>
              </View>
            ))}

            <View style={styles.dailyDivider} />

            <View style={styles.attendanceRow}>
              <Image
                source={DAILY_SEAL_STAMP}
                style={styles.attendanceSeal}
                contentFit="contain"
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyStrong" style={{ color: '#182620' }}>
                  아침 개근 도장
                </AppText>
                <AppText variant="caption" style={{ color: '#526451' }}>
                  하루 한 번 개근 도장을 찍고 인장을 받으세요
                </AppText>
              </View>
            </View>
            <SeniorButton
              testID="btn-claim-attendance-stamp"
              label={
                dailyMissions.attendanceStampClaimed
                  ? '오늘 개근 도장을 찍었습니다 ✔'
                  : '개근 도장 찍기'
              }
              variant={dailyMissions.attendanceStampClaimed ? 'secondary' : 'accent'}
              disabled={dailyMissions.attendanceStampClaimed}
              onPress={handleClaimAttendanceStamp}
            />
          </Card>

          <SectionHeader title="마을 의뢰 퀘스트" description="어르신들의 고민을 해결하고 보상을 받으세요" />
          {state.quests.map((q) => (
            <Card key={q.id} style={styles.questCard}>
              <View style={styles.questHeaderRow}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" style={{ color: '#182620' }}>{q.title}</AppText>
                  <AppText variant="caption" style={{ color: '#526451' }}>
                    의뢰인: {q.clientName} ({q.clientRole}) · 장소: {q.locationName}
                  </AppText>
                </View>
                <View style={[styles.questBadge, q.completed && styles.questBadgeDone]}>
                  <AppText variant="caption" style={{ color: q.completed ? '#0E5142' : '#855B00', fontFamily: FontWeights.strong }}>
                    {q.claimed ? '보상 완료' : q.completed ? '달성 완료' : `${q.currentCount}/${q.requiredCount}`}
                  </AppText>
                </View>
              </View>
              <AppText variant="body" style={{ color: '#24382B', fontSize: 16 }}>{q.description}</AppText>
              <View style={styles.questFooterRow}>
                <AppText variant="caption" style={{ color: '#C2410C' }}>
                  보상: +{q.rewardExp} EXP · 🌰 {q.rewardAcorns}개
                </AppText>
                {q.completed && !q.claimed ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => claimQuestReward(q.id)}
                    style={styles.claimBtn}>
                    <AppText variant="bodyStrong" style={{ color: '#FCF9F2', fontSize: 14 }}>보상 받기</AppText>
                  </Pressable>
                ) : null}
              </View>
            </Card>
          ))}

          <SectionHeader title="함께한 기록" description="마을 사람들과의 유대가 곧 성장입니다" />
          <Card style={styles.bondCard}>
            <View style={styles.bondHeaderRow}>
              <AppText variant="bodyStrong" style={{ color: '#182620' }}>오늘의 마음 온도</AppText>
              <AppText variant="title" style={{ color: '#C2410C' }}>{heartWarmth}°</AppText>
            </View>
            <View style={styles.companionTrack}>
              <View style={[styles.companionFillWarm, { width: `${heartWarmth}%` }]} />
            </View>
            <AppText variant="caption" style={{ color: '#526451' }}>
              산책·함께 한 판·회고로 오르고, 하루가 지나면 조금씩 식습니다.
            </AppText>
          </Card>
          {state.bonds.map((bond) => {
            const progress = bondProgress(bond.points);
            const info = NPC_DISPLAY[bond.npcId];
            return (
              <Card key={bond.npcId} style={styles.bondCard}>
                <View style={styles.bondHeaderRow}>
                  <View style={styles.npcPortraitCircle}>
                    <Image
                      source={portraitFor(bond.npcId)}
                      style={styles.companionPortraitSmall}
                      contentFit="cover"
                      accessibilityLabel={`${info.name} 초상화`}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="bodyStrong" style={{ color: '#182620' }}>
                      {info.name} ({info.title})
                    </AppText>
                    <AppText variant="caption" style={{ color: '#526451' }}>
                      유대 {progress.level}단계 · {progress.label}
                    </AppText>
                  </View>
                  <AppText variant="caption" style={{ color: '#F0BF4F', fontFamily: FontWeights.strong }}>
                    {bond.points}
                  </AppText>
                </View>
                <View style={styles.companionTrack}>
                  <View
                    style={[styles.companionFill, { width: `${Math.round(progress.ratio * 100)}%` }]}
                  />
                </View>
                <AppText variant="caption" style={{ color: '#855B00' }}>
                  {bond.lastWalkDay
                    ? `마지막 산책: ${bond.lastWalkDay}`
                    : '아직 함께 걷지 않았습니다 · 대화 카드에서 [같이 걷을까요?]'}
                </AppText>
              </Card>
            );
          })}

          <SectionHeader title="어르신의 나들이 가방" description="소지품을 터치해 건강을 회복하세요" />
          <View style={styles.inventoryGrid}>
            {state.inventory.map((item) => (
              <Card key={item.id} style={styles.invCard}>
                <AppText style={{ fontSize: 32 }}>{item.icon}</AppText>
                <AppText variant="bodyStrong" style={{ color: '#182620' }}>{item.name}</AppText>
                <AppText variant="caption" style={{ color: '#526451', textAlign: 'center' }}>
                  {item.description}
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => applyItem(item.id)}
                  style={styles.invUseBtn}>
                  <AppText variant="caption" style={{ color: '#FCF9F2', fontFamily: FontWeights.emphasis }}>
                    사용 ({item.count}개 남음)
                  </AppText>
                </Pressable>
              </Card>
            ))}
          </View>
        </View>
      )}

      <HomeBannerAd />
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
  statusPlaque: {
    backgroundColor: '#24382B',
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: '#D8B384',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  plaqueHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  badgeSmall: {
    width: 60,
    height: 60,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  villageTag: {
    backgroundColor: '#0E5142',
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#D8B384',
  },
  villageTagText: {
    color: '#FCF9F2',
    fontFamily: FontWeights.emphasis,
  },
  statsBarGrid: {
    gap: 6,
  },
  statBarBox: {
    gap: 2,
  },
  barLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barTrack: {
    height: 10,
    borderRadius: Radius.pill,
    backgroundColor: '#142219',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#6E4228',
  },
  barFillVitality: {
    height: '100%',
    backgroundColor: '#277357',
    borderRadius: Radius.pill,
  },
  barFillWisdom: {
    height: '100%',
    backgroundColor: '#F0BF4F',
    borderRadius: Radius.pill,
  },
  currencyRow: {
    paddingTop: 2,
  },
  currencyText: {
    color: '#D8B384',
    fontFamily: FontWeights.emphasis,
  },
  morningRoutineCard: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  noticeBox: {
    backgroundColor: '#E3F3EA',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#277357',
  },
  tabToggleRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  toggleBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: '#6E4228',
    backgroundColor: '#24382B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: {
    backgroundColor: '#F0BF4F',
    borderColor: '#FCF9F2',
  },
  mapViewportFrame: {
    width: '100%',
    height: 440,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#6E4228',
    position: 'relative',
    backgroundColor: '#356347',
  },
  locationBanner: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(24, 38, 32, 0.88)',
    borderRadius: Radius.sm,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  locationBannerText: {
    color: '#FCF9F2',
    fontFamily: FontWeights.emphasis,
  },
  dialogueCard: {
    backgroundColor: '#24382B',
    borderWidth: 2,
    borderColor: '#D8B384',
    gap: Spacing.sm,
  },
  dialogueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  npcPortraitCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0E5142',
    borderWidth: 1.5,
    borderColor: '#F0BF4F',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  npcPortraitImage: {
    width: '100%',
    height: '100%',
  },
  dialogueBody: {
    backgroundColor: '#182620',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#6E4228',
    gap: 4,
  },
  dialogueLine: {
    color: '#FCF9F2',
    lineHeight: 24,
  },
  strollCard: {
    backgroundColor: '#FCF9F2',
    borderWidth: 2,
    borderColor: '#D8B384',
    gap: 4,
  },
  dpadContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginVertical: 4,
  },
  dpadMiddleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dpadBtn: {
    width: 68,
    height: 60,
    borderRadius: Radius.md,
    backgroundColor: '#24382B',
    borderWidth: 2,
    borderColor: '#D8B384',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  dpadCenterHub: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#182620',
    borderWidth: 1.5,
    borderColor: '#6E4228',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dpadArrowText: {
    color: '#F0BF4F',
  },
  questCard: {
    backgroundColor: '#FCF9F2',
    borderWidth: 2,
    borderColor: '#D8B384',
    gap: Spacing.xs,
  },
  questHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  questBadge: {
    backgroundColor: '#FFF1C7',
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#855B00',
  },
  questBadgeDone: {
    backgroundColor: '#E3F3EA',
    borderColor: '#277357',
  },
  questFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  claimBtn: {
    backgroundColor: '#C2410C',
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  inventoryGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  invCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D8B384',
    alignItems: 'center',
    gap: 4,
    padding: Spacing.md,
  },
  invUseBtn: {
    backgroundColor: '#0E5142',
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  offlineRewardCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FCF9F2',
    borderRadius: Radius.lg,
    borderWidth: 3,
    borderColor: '#F0BF4F',
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.md,
  },
  offlineTitle: {
    color: '#182620',
    textAlign: 'center',
  },
  offlineDesc: {
    color: '#24382B',
    textAlign: 'center',
    lineHeight: 22,
  },
  rewardBox: {
    width: '100%',
    backgroundColor: '#E4EDDA',
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 4,
    borderWidth: 1,
    borderColor: '#779367',
  },
  storyCutsceneCard: {
    width: '100%',
    maxWidth: 440,
    flexGrow: 0,
    flexShrink: 1,
    backgroundColor: '#24382B',
    borderRadius: Radius.lg,
    borderWidth: 3,
    borderColor: '#D8B384',
    maxHeight: '90%',
  },
  storyCutsceneContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  storyHeaderBadge: {
    backgroundColor: '#0E5142',
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#F0BF4F',
    alignSelf: 'flex-start',
  },
  climaxNotice: {
    backgroundColor: '#FFF1C7',
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 2,
    borderWidth: 1,
    borderColor: '#F0BF4F',
  },
  promotionNpcLine: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(24, 38, 32, 0.88)',
    borderWidth: 1.5,
    borderColor: '#F0BF4F',
    maxWidth: 320,
    gap: 2,
  },
  companionCard: {
    backgroundColor: '#FFF6DC',
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: '#F0BF4F',
    gap: Spacing.sm,
  },
  companionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  companionPortrait: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#D8B384',
  },
  companionPortraitSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  companionTrack: {
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: '#EFE3C8',
    overflow: 'hidden',
  },
  companionFill: {
    height: '100%',
    backgroundColor: '#F0BF4F',
  },
  companionFillWarm: {
    height: '100%',
    backgroundColor: '#C2410C',
  },
  companionActions: {
    gap: Spacing.xs,
  },
  dialogueActions: {
    gap: Spacing.xs,
  },
  bondCard: {
    gap: Spacing.sm,
  },
  bondHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  storyProgressionBanner: {
    backgroundColor: '#0E5142',
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: '#F0BF4F',
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  storyEnterPill: {
    backgroundColor: '#C2410C',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
  },
  facilityCard: {
    backgroundColor: '#FCF9F2',
    borderColor: '#D8B384',
    borderWidth: 2,
    gap: Spacing.xs,
  },
  facilityTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  upgradeBtn: {
    backgroundColor: '#C2410C',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  partnerAssignRow: {
    backgroundColor: '#E4EDDA',
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 2,
  },
  partnerCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#6E4228',
    borderWidth: 1.5,
  },
  assignMiniBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#6E4228',
    backgroundColor: '#FCF9F2',
  },
  assignMiniBtnActive: {
    backgroundColor: '#0E5142',
    borderColor: '#0E5142',
  },
  storyCardLarge: {
    backgroundColor: '#24382B',
    borderColor: '#D8B384',
    borderWidth: 2,
    gap: Spacing.md,
  },
  storyDialogueBox: {
    backgroundColor: '#182620',
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: '#6E4228',
    padding: Spacing.md,
    gap: 6,
  },
  storyLineText: {
    color: '#FCF9F2',
    lineHeight: 24,
  },
  dailyCard: {
    backgroundColor: '#FCF9F2',
    borderWidth: 2,
    borderColor: '#D8B384',
    gap: Spacing.sm,
  },
  missionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  missionIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    backgroundColor: '#E4EDDA',
  },
  dailyDivider: {
    borderTopWidth: 1,
    borderTopColor: '#E3EAE6',
    marginVertical: 2,
  },
  attendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  attendanceSeal: {
    width: 84,
    height: 84,
  },
  promotionFxLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  healFxLayer: {
    position: 'absolute',
    left: '50%',
    top: '22%',
    marginLeft: -64,
    zIndex: 30,
  },
});
