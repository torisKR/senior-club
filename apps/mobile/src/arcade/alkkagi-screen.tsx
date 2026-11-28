import { randomUUID } from 'expo-crypto';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { PixelRadius } from '@/components/game/pixel-theme';
import { AppText, Card, Screen, SeniorButton } from '@/components/ui';
import { FontWeights, Layout, Radius, Spacing } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';

import { playSfx } from '@/audio/sound-manager';
import { FocusedBackgroundAudio } from '@/audio/focused-background-audio';

import { createInitialAlkkagiStones, hasAlkkagiProgress, type AlkkagiStone } from './arcade-logic';
import { createSeededRandom } from './alkkagi-ai';
import { AlkkagiBoard, type AlkkagiPlayback } from './alkkagi-board';
import { shotToward, type AlkkagiShot } from './alkkagi-physics';
import { resolveAlkkagiTurn, type AlkkagiTurn } from './alkkagi-turn';
import { useArcade } from './arcade-store';
import { alkkagiStars } from './round-stars';
import { RoundStarsView } from './round-stars-view';
import { ArcadeSaveNotice } from './arcade-save-notice';
import { ArcadeQuickSettings } from './arcade-quick-settings';
import { CompanionCoach } from '@/rpg/companion-coach';
import { GAME_COACH } from '@/rpg/companion-lines';
import { useRpg } from '@/rpg/rpg-store';
import { getRpgStorage } from '@/rpg/rpg-db';
import { isAlkkagiRound, loadRoundState, type AlkkagiRound } from './round-save';
import { RoundSaveNotice, useRoundSave } from './round-save-notice';
import { ChangeConfirmation } from './change-confirmation';
import { PixelFx } from '@/fx/pixel-fx';
import { useReduceMotion } from '@/fx/use-reduce-motion';
import { getStoryTrial, StoryTrialNotice } from './story-trial';
import { BGM_CLUB_LOUNGE } from '@/audio/bgm';

// sprite-gen(codex gpt-6.2-sol) → pixelize arcadeart: 비자나무 바둑판 결
const BOARD_ART = {
  board: require('../../assets/game/rpg/pixel/arcadeart/alkkagi_board.png'),
  blackStone: require('../../assets/game/rpg/pixel/arcade/stone_black.png'),
  whiteStone: require('../../assets/game/rpg/pixel/arcade/stone_white.png'),
};
const ROUND_KEY = 'senior_club_alkkagi_round_v1';
const MAX_BOARD_SIZE = 420;
const START_BANNER = '내 흑석(★)을 튕겨 상대 백석(◎)을 판 밖으로 밀어내세요. 내 돌도 판 밖으로 나갈 수 있어요.';

const AI_OPPONENTS = [
  { id: '18k', name: '18급 박 회원', title: '입문 대국' },
  { id: '9k', name: '9급 최 유단자', title: '정석 대국' },
  { id: 'master', name: '명인 김 사범', title: '명인 초청전' },
] as const;

type PowerMode = AlkkagiRound['powerMode'];
/** 버튼으로 튕길 때의 힘. 저장 형식(powerMode)은 그대로 씁니다. */
const BUTTON_POWERS: readonly { id: PowerMode; label: string; sub: string; power: number }[] = [
  { id: 'precision', label: '살살', sub: '힘 60% · 내 돌이 덜 나가요', power: 0.6 },
  { id: 'strong', label: '보통', sub: '힘 80% · 가까운 돌 밀기', power: 0.8 },
  { id: 'double', label: '세게', sub: '힘 100% · 멀리 밀어내기', power: 1 },
];

const mark = (id: string) => `${id.startsWith('p') ? '★' : '◎'}${id.slice(1)}`;
const marks = (ids: readonly string[]) => [...ids].sort().map(mark).join(', ');
const aliveOf = (stones: readonly AlkkagiStone[], owner: AlkkagiStone['owner']) => stones.filter((stone) => stone.owner === owner && stone.alive);

/** 한 차례(내 튕기기 + 상대 응수)에 일어난 일을 글로 풀어 줍니다. */
function describeTurn(turn: AlkkagiTurn, opponentName: string): string {
  const mine = [
    turn.knockedOutByMe.length ? `상대 돌 ${marks(turn.knockedOutByMe)} 장외` : '상대 돌을 밀어내지 못했어요',
    turn.lostByMe.length ? `내 돌 ${marks(turn.lostByMe)}도 장외` : '',
  ];
  const theirs = turn.aiShooterId ? [
    `${opponentName}이 ${mark(turn.aiShooterId)}을 튕겼어요`,
    turn.knockedOutByOpponent.length ? `내 돌 ${marks(turn.knockedOutByOpponent)} 장외` : '내 돌은 무사해요',
    turn.lostByOpponent.length ? `상대 돌 ${marks(turn.lostByOpponent)}은 스스로 장외` : '',
  ] : [];
  return [...mine, ...theirs].filter(Boolean).join(' · ');
}

function ModeSwitch({ dragMode, stacked, onChange }: { dragMode: boolean; stacked: boolean; onChange: (drag: boolean) => void }) {
  const options = [
    { id: 'drag', drag: true, label: '끌어서 튕기기', sub: '돌을 당겼다 놓기' },
    { id: 'buttons', drag: false, label: '버튼으로 튕기기', sub: '끌기가 어려울 때' },
  ] as const;
  return (
    <View style={[styles.powerSelectRow, stacked && styles.stackedRow]} accessibilityLabel="조작 방법 고르기">
      {options.map((option) => {
        const selected = option.drag === dragMode;
        return (
          <Pressable
            key={option.id}
            testID={`alkkagi-mode-${option.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.label}, ${option.sub}${selected ? ', 선택됨' : ''}`}
            onPress={() => onChange(option.drag)}
            style={[styles.modeChip, stacked && styles.stackedControl, selected && styles.modeChipSelected]}>
            <AppText variant="bodyStrong" style={{ color: selected ? '#FFFFFF' : '#182620', textAlign: 'center' }}>
              {selected ? '✓ ' : ''}{option.label}
            </AppText>
            <AppText variant="caption" style={{ color: selected ? '#FFFFFF' : '#526451', textAlign: 'center' }}>{option.sub}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function ButtonControls({ stacked, powerMode, disabled, onPower, onNextShooter, onNextTarget, onFlick }: {
  stacked: boolean; powerMode: PowerMode; disabled: boolean;
  onPower: (mode: PowerMode) => void; onNextShooter: () => void; onNextTarget: () => void; onFlick: () => void;
}) {
  return (
    <>
      <View style={[styles.powerSelectRow, stacked && styles.stackedRow]}>
        {BUTTON_POWERS.map((mode) => {
          const selected = powerMode === mode.id;
          return (
            <Pressable
              key={mode.id}
              testID={`alkkagi-power-${mode.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onPower(mode.id)}
              style={[styles.powerChip, stacked && styles.stackedControl, selected && styles.powerChipSelected]}>
              <AppText variant="bodyStrong" style={{ color: selected ? '#FFFFFF' : '#182620', textAlign: 'center' }}>{mode.label}</AppText>
              <AppText variant="caption" style={{ color: selected ? '#FFFFFF' : '#526451', textAlign: 'center' }}>{mode.sub}</AppText>
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.actionRow, stacked && styles.stackedRow]}>
        <View style={stacked ? styles.stackedControl : { flex: 1 }}>
          <SeniorButton testID="btn-alkkagi-switch-stone" label="내 알 바꾸기" variant="secondary" onPress={onNextShooter} />
        </View>
        <View style={stacked ? styles.stackedControl : { flex: 1 }}>
          <SeniorButton testID="btn-alkkagi-switch-target" label="목표 알 바꾸기" variant="secondary" onPress={onNextTarget} />
        </View>
      </View>
      <SeniorButton
        testID="btn-alkkagi-flick"
        label={disabled ? '위쪽에서 상대 변경을 확인해 주세요' : '알 튕기기 (타격!)'}
        variant="accent"
        disabled={disabled}
        onPress={onFlick}
      />
    </>
  );
}

export function AlkkagiBoardScreen({ storyChapter, onLeaveStory }: { storyChapter?: string; onLeaveStory?: () => void } = {}) {
  const { width, fontScale } = useWindowDimensions();
  const { largeTextEnabled } = useAppState();
  const stackControls = width < 360 || fontScale >= 1.3 || largeTextEnabled;
  const boardSize = Math.min(MAX_BOARD_SIZE, width - Layout.screenPadding * 2);
  const reduceMotion = useReduceMotion();
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
  const flickPending = useRef(false);
  useEffect(() => { flickPending.current = false; }, [stones]);
  const [random] = useState(() => createSeededRandom(Date.now()));
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(savedRound?.selectedPlayerId ?? 'p2');
  const [selectedTargetId, setSelectedTargetId] = useState<string>(savedRound?.selectedTargetId ?? 'a2');
  const [powerMode, setPowerMode] = useState<PowerMode>(savedRound?.powerMode ?? 'double');
  const [matchDoubleKnockouts, setMatchDoubleKnockouts] = useState(savedRound?.matchDoubleKnockouts ?? 0);
  const [bannerText, setBannerText] = useState<string>(savedRound?.bannerText ?? START_BANNER);
  const [storyAttemptId, setStoryAttemptId] = useState(() => story ? savedRound?.storyAttemptId ?? randomUUID() : undefined);
  const roundSave = useRoundSave(storage, roundKey, loadedRound, { opponentIdx, stones, selectedPlayerId, selectedTargetId, powerMode, matchDoubleKnockouts, bannerText, storyAttemptId });
  const [pendingOpponent, setPendingOpponent] = useState<number | null>(null);
  const [scrollCallout, setScrollCallout] = useState<string | null>(null);
  // 돌이 굴러가는 동안의 재생 정보. 결과(stones)는 튕긴 즉시 저장하고, 화면은 재생이 끝난 뒤 결과를 보여 줍니다.
  const [playback, setPlayback] = useState<AlkkagiPlayback | null>(null);
  const [opponentMoving, setOpponentMoving] = useState(false);
  // 조작 방법: 고르기 전에는 TalkBack 이 켜져 있으면 버튼, 아니면 끌기.
  const [screenReader, setScreenReader] = useState(false);
  const [chosenDrag, setChosenDrag] = useState<boolean | null>(null);
  const dragMode = chosenDrag ?? !screenReader;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isScreenReaderEnabled().then((enabled) => { if (active) setScreenReader(enabled); }, () => {});
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => { active = false; subscription?.remove(); };
  }, []);
  // 동작 줄이기를 켜면 굴러가는 장면 없이 바로 결과를 보여 줍니다.
  const moving = playback !== null && reduceMotion === false;

  // 재생 중에는 아직 결과가 보이지 않도록, 그 시점까지의 판으로 현황을 셉니다.
  const shownStones = moving ? playback.frames[opponentMoving && playback.aiStartFrame !== null ? playback.aiStartFrame : 0] : stones;
  const alivePlayers = useMemo(() => aliveOf(stones, 'player'), [stones]);
  const aliveEnemies = useMemo(() => aliveOf(stones, 'ai'), [stones]);
  const won = !moving && aliveEnemies.length === 0;
  const lost = !moving && !won && alivePlayers.length === 0;
  const matchOver = aliveEnemies.length === 0 || alivePlayers.length === 0;

  const activeShooter = alivePlayers.find((s) => s.id === selectedPlayerId) ?? alivePlayers[0];
  const activeTarget = aliveEnemies.find((s) => s.id === selectedTargetId) ?? aliveEnemies[0];
  const buttonPower = BUTTON_POWERS.find((mode) => mode.id === powerMode)?.power ?? 1;

  const resetMatch = (nextOppIdx = opponentIdx) => {
    triggerHaptic('light');
    setOpponentIdx(nextOppIdx);
    setStones(createInitialAlkkagiStones());
    setSelectedPlayerId('p2');
    setSelectedTargetId('a2');
    setMatchDoubleKnockouts(0);
    setScrollCallout(null);
    setPlayback(null);
    setOpponentMoving(false);
    if (story) setStoryAttemptId(randomUUID());
    setPendingOpponent(null);
    setBannerText(`${story?.climaxTrial.opponentName ?? AI_OPPONENTS[nextOppIdx].name}과의 새 대국이 시작되었습니다!`);
  };

  const selectOpponent = (idx: number) => {
    if (moving) return;
    if (idx === opponentIdx) {
      setPendingOpponent(null);
      return;
    }
    if (!matchOver && hasAlkkagiProgress(stones)) setPendingOpponent(idx);
    else resetMatch(idx);
  };

  const cycle = (list: readonly AlkkagiStone[], currentId: string | undefined, select: (id: string) => void) => {
    if (!list.length) return;
    triggerHaptic('light');
    select(list[(list.findIndex((s) => s.id === currentId) + 1) % list.length].id);
  };

  const selectStone = (stone: AlkkagiStone) => {
    triggerHaptic('light');
    if (stone.owner === 'player') setSelectedPlayerId(stone.id);
    else setSelectedTargetId(stone.id);
  };

  const finishWin = (doubles: number, detail: string) => {
    playSfx('chime', state.soundEnabled);
    const storyRecorded = story && storyAttemptId ? recordStoryResult({ type: 'alkkagi', doubleKnockouts: doubles, chapterId: story.id, attemptId: storyAttemptId }) : false;
    const storyNote = story ? (!storyRecorded ? ' 이야기 기록이 반영되지 않았어요. 마을에서 진행 상태를 확인해 주세요.' : story.id === 'chapter_2' || doubles > 0 ? ' 이야기 목표를 마쳤습니다.' : ' 이야기 목표인 일석이조는 이루지 못해 다시 도전할 수 있습니다.') : '';
    setBannerText(`대국 승리! 상대 알을 모두 장외로 밀어냈습니다! (+${160 + doubles * 50} CP · 인장 +1) · ${detail}${storyNote}`);
    recordAlkkagiWin(doubles);
    completeQuestStep('alkkagi');
    recordGameWithNpc(GAME_COACH.alkkagi);
  };

  const finishLoss = (detail: string) => {
    if (story && storyAttemptId) recordStoryResult({ type: 'alkkagi', outcome: 'failure', chapterId: story.id, attemptId: storyAttemptId });
    setBannerText(`아쉽게 졌어요. 내 돌이 모두 판 밖으로 나갔습니다. ${detail}${story ? ' · 완료하지 못한 시도로 기록했어요.' : ''}`);
  };

  const handleShot = (shot: AlkkagiShot) => {
    if (flickPending.current || moving || pendingOpponent !== null || matchOver) return;
    flickPending.current = true;
    triggerHaptic('medium');
    playSfx('stoneClack', state.soundEnabled);

    const turn = resolveAlkkagiTurn(stones, shot, opponentIdx, random);
    const doubles = matchDoubleKnockouts + (turn.doubleKnockout ? 1 : 0);
    const detail = describeTurn(turn, opponent.name);
    setStones(turn.stones);
    setMatchDoubleKnockouts(doubles);
    if (turn.doubleKnockout) playSfx('combo', state.soundEnabled);
    setScrollCallout(turn.doubleKnockout ? '일석이조(一石二鳥)! 승리 보상 +50 CP' : null);
    setOpponentMoving(false);
    setPlayback(reduceMotion === false && turn.frames.length > 1 ? { key: Date.now(), frames: turn.frames, hits: turn.hits, aiStartFrame: turn.aiStartFrame } : null);

    if (turn.result === 'win') finishWin(doubles, detail);
    else if (turn.result === 'lose') finishLoss(detail);
    else setBannerText(`${detail} · 남은 돌: 나 ${aliveOf(turn.stones, 'player').length}개, 상대 ${aliveOf(turn.stones, 'ai').length}개`);
    const nextShooter = aliveOf(turn.stones, 'player');
    const nextTarget = aliveOf(turn.stones, 'ai');
    if (nextShooter.length && !nextShooter.some((s) => s.id === shot.stoneId)) setSelectedPlayerId(nextShooter[0].id);
    if (nextTarget.length && !nextTarget.some((s) => s.id === activeTarget?.id)) setSelectedTargetId(nextTarget[0].id);
  };

  const handleButtonFlick = () => {
    if (activeShooter && activeTarget) handleShot(shotToward(activeShooter, activeTarget, buttonPower));
  };

  const liveBanner = !moving ? bannerText : opponentMoving ? `${opponent.name}이 돌을 튕겼습니다…` : '돌이 굴러갑니다…';

  return (
    <Screen testID="alkkagi-screen" contentContainerStyle={styles.container}>
      <FocusedBackgroundAudio source={BGM_CLUB_LOUNGE} enabled={state.soundEnabled} />
      <ArcadeSaveNotice />
      <ArcadeQuickSettings />
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
        <AppText variant="caption" style={{ color: '#E4EDDA' }}>
          {story ? '번갈아 한 번씩 튕깁니다. 여유롭게 조준해 보세요.' : '번갈아 한 번씩 튕깁니다. 급수가 높을수록 상대가 더 정확하게 튕겨요.'}
        </AppText>

        <View style={[styles.versusRow, stackControls && styles.stackedRow]}>
          <View style={stackControls ? styles.stackedStatBox : styles.sideStatBox}>
            <AppText variant="caption" style={styles.sideLabel}>나 (흑석 ★)</AppText>
            <AppText variant="title" style={styles.playerStoneCount}>
              남은 알 {aliveOf(shownStones, 'player').length}개
            </AppText>
          </View>
          <View style={styles.vsBadge}>
            <AppText variant="bodyStrong" style={{ color: '#F0BF4F' }}>VS</AppText>
          </View>
          <View style={[stackControls ? styles.stackedStatBox : styles.sideStatBox, { alignItems: stackControls ? 'flex-start' : 'flex-end' }]}>
            <AppText variant="caption" style={styles.sideLabel}>{opponent.name} (백석)</AppText>
            <AppText variant="title" style={styles.enemyStoneCount}>
              남은 알 {aliveOf(shownStones, 'ai').length}개
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
      {story && storyAttemptId ? <StoryTrialNotice chapter={story} onLeave={onLeaveStory} canAbandon={!matchOver && !moving} onAbandon={() => {
        recordStoryResult({ type: 'alkkagi', outcome: 'failure', chapterId: story.id, attemptId: storyAttemptId });
        resetMatch(opponentIdx);
      }} /> : null}

      {/* 일석이조 족자 배너 */}
      {scrollCallout && !moving ? (
        <View style={styles.scrollBanner}>
          <View style={styles.scrollBannerEmblem}>
          <PixelFx name="match" scale={0.42} />
          </View>
          <AppText variant="sectionTitle" style={styles.scrollBannerText}>
            {scrollCallout}
          </AppText>
        </View>
      ) : null}

      {/* 함께 한 판 — 최 사범 코치 패널 */}
      <CompanionCoach npcId={GAME_COACH.alkkagi} mood={won ? 'success' : 'start'} />

      <AppText variant="caption" style={styles.selectionGuide}>
        {dragMode
          ? '내 흑석(★)을 누른 채 뒤로 당겼다 놓으면 반대쪽으로 날아갑니다. 길게 당길수록 세게 나가요.'
          : '돌을 직접 누르거나 아래 버튼으로 내 돌과 목표 돌을 고른 뒤 [알 튕기기]를 누르세요.'}
      </AppText>
      <AlkkagiBoard
        art={BOARD_ART}
        size={boardSize}
        stones={stones}
        playback={moving ? playback : null}
        dragEnabled={dragMode}
        locked={matchOver || pendingOpponent !== null}
        shooterId={activeShooter?.id}
        targetId={activeTarget?.id}
        buttonPower={buttonPower}
        celadon={appearance.stone === 'celadon'}
        onSelectStone={selectStone}
        onFlick={handleShot}
        onHit={() => { playSfx('stoneClack', state.soundEnabled); triggerHaptic('light'); }}
        onOpponentStart={() => setOpponentMoving(true)}
        onPlaybackDone={() => { setPlayback(null); setOpponentMoving(false); }}
      />

      {/* 3. 하단 조준 및 타격 컨트롤 */}
      {won || lost ? (
        <Card style={won ? styles.victoryCard : styles.defeatCard}>
          {won ? <RoundStarsView stars={alkkagiStars(alivePlayers.length)} title="대국 승리!" /> : null}
          <AppText variant="sectionTitle" accessibilityLiveRegion="polite" style={{ color: won ? '#0E5142' : '#762E10' }}>
            {bannerText}
          </AppText>
          <SeniorButton
            testID="btn-alkkagi-same-opponent"
            label={won ? '같은 상대와 다시 대국하기' : '다시 대국하기'}
            variant={won ? 'secondary' : 'primary'}
            onPress={() => resetMatch(opponentIdx)}
          />
          {won && !story ? <SeniorButton
            testID="btn-alkkagi-rematch"
            label="다음 사범과 새 대국 시작하기 ▶"
            variant="primary"
            onPress={() => resetMatch((opponentIdx + 1) % AI_OPPONENTS.length)}
          /> : null}
        </Card>
      ) : (
        <Card style={styles.controlCard}>
          <AppText variant="bodyStrong" accessibilityLiveRegion="polite" style={{ color: '#182620' }}>
            {liveBanner}
          </AppText>
          {/* 굴러가는 동안에도 그대로 둡니다 — 카드 높이가 바뀌면 바둑판이 화면에서 밀려납니다. */}
          <ModeSwitch dragMode={dragMode} stacked={stackControls} onChange={(drag) => { triggerHaptic('light'); setChosenDrag(drag); }} />
          {dragMode ? null : (
            <>
              <AppText variant="caption" accessibilityLiveRegion="polite" style={styles.selectionGuide}>
                내 돌 ★{activeShooter?.id.slice(1)} · 목표 돌 ◎{activeTarget?.id.slice(1)} 선택 중. 점선이 날아갈 방향과 힘을 보여 줍니다.
              </AppText>
              <ButtonControls
                stacked={stackControls}
                powerMode={powerMode}
                disabled={pendingOpponent !== null}
                onPower={(mode) => { triggerHaptic('light'); setPowerMode(mode); }}
                onNextShooter={() => cycle(alivePlayers, activeShooter?.id, setSelectedPlayerId)}
                onNextTarget={() => cycle(aliveEnemies, activeTarget?.id, setSelectedTargetId)}
                onFlick={handleButtonFlick}
              />
            </>
          )}
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
    borderRadius: PixelRadius,
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
    borderRadius: PixelRadius,
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
  stackedStatBox: {
    alignSelf: 'stretch',
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
    borderRadius: PixelRadius,
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
  selectionGuide: { color: '#315B38' },
  victoryCard: {
    backgroundColor: '#FFF1C7',
    borderColor: '#F0BF4F',
    borderWidth: 2,
    gap: Spacing.md,
  },
  defeatCard: {
    backgroundColor: '#FFF1C7',
    borderColor: '#9A3412',
    borderWidth: 2,
    gap: Spacing.md,
  },
  modeChip: {
    flex: 1,
    minWidth: 48,
    minHeight: 56,
    borderRadius: PixelRadius,
    borderWidth: 1.5,
    borderColor: '#6E4228',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  modeChipSelected: {
    backgroundColor: '#0E5142',
    borderColor: '#182620',
  },
  controlCard: {
    backgroundColor: '#FCF9F2',
    borderColor: '#6E4228',
    borderWidth: 2,
    gap: Spacing.sm,
  },
  powerSelectRow: {
    flexDirection: 'row',
    gap: 6,
  },
  powerChip: {
    flex: 1,
    minWidth: 48,
    minHeight: 54,
    borderRadius: PixelRadius,
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
