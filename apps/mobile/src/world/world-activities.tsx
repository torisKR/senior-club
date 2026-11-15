import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { useArcade } from '@/arcade/arcade-store';
import { playSfx } from '@/audio/sound-manager';
import { AppText, SeniorButton } from '@/components/ui';
import { FontWeights, Radius, Spacing } from '@/constants/theme';
import { todayKey } from '@/rpg/daily-reset';
import { FARM_PLOTS, getVillageTile } from '@/rpg/rpg-logic';
import { getMap, type MapId } from '@/world/maps';
import { FISH_SPRITES, LIFE_PROP_SPRITES, POSTCARDS, type PlayerPose } from '@/rpg/rpg-sprites';
import { useRpg } from '@/rpg/rpg-store';

import {
  canRest,
  CROP_IDS,
  CROPS,
  cropRemainingMs,
  cropStage,
  DIARY_MAX_CHARS,
  FISH,
  FISH_CATCH_WINDOW_MS,
  type FishId,
  gainItem,
  harvestPlot,
  houseComfort,
  isCatchInTime,
  isForaged,
  markForaged,
  markRested,
  plantCrop,
  recordCatch,
  REST_VITALITY,
  REST_WARMTH,
  rollBiteDelayMs,
  rollFish,
  takePhoto,
  waterPlot,
  writeDiary,
} from './life';
import { FORAGE, forageSpawns, photoSpotAt, type ForageSpawn, type PhotoSpot } from './explore';
import { withObjectParticle } from './josa';
import { useWorldActive } from './use-world-active';

/** 작물이 자라는 모습이 화면에 반영되는 주기 */
const GROWTH_TICK_MS = 30_000;
const HOUR_MS = 60 * 60 * 1000;

type Activity =
  | { kind: 'plant'; plot: number }
  | { kind: 'fishing'; biteAt: number; bitten: boolean }
  | { kind: 'caught'; fishId: FishId | null; isNew: boolean }
  | { kind: 'rest' }
  | { kind: 'photo'; spot: PhotoSpot; isNew: boolean };

export interface WorldAction {
  label: string;
  run: () => void;
}

const isNextTo = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

function benchNearby(x: number, y: number, mapId: MapId): boolean {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => getVillageTile(x + dx, y + dy, mapId).type === 'bench');
}

function hoursLeft(ms: number): string {
  const hours = ms / HOUR_MS;
  return hours >= 1 ? `${Math.ceil(hours)}시간` : `${Math.max(1, Math.ceil(ms / 60_000))}분`;
}

/**
 * 서 있는 자리에 따라 텃밭·낚시·쉬기 행동을 고르고, 진행 중인 활동의 화면(오버레이)과 주인공 포즈를 돌려줍니다.
 */
export function useWorldActivities(onNotice: (text: string) => void, paused = false) {
  const { state, applyLife } = useRpg();
  const { state: arcade, triggerHaptic } = useArcade();
  const worldActive = useWorldActive();
  const active = worldActive && !paused;
  const { height } = useWindowDimensions();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [celebration, setCelebration] = useState<{ sequence: number; visible: boolean; prop: 'wateringCan' | 'basket' | null; pose: PlayerPose | null }>({ sequence: 0, visible: false, prop: null, pose: null });
  const celebrate = (prop: 'wateringCan' | 'basket' | null = null, pose: PlayerPose | null = null) => setCelebration((current) => ({ sequence: current.sequence + 1, visible: true, prop, pose }));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [diaryText, setDiaryText] = useState('');
  const [diaryDraftDay, setDiaryDraftDay] = useState<string | null>(null);
  const pulledRef = useRef<number | null>(null);
  const pausedAtRef = useRef<number | null>(null);
  const resumingRef = useRef(false);

  useEffect(() => {
    if (!worldActive) return;
    const refresh = setTimeout(() => setNowMs(Date.now()), 0);
    const timer = setInterval(() => setNowMs(Date.now()), GROWTH_TICK_MS);
    return () => {
      clearTimeout(refresh);
      clearInterval(timer);
    };
  }, [worldActive]);

  // 다른 화면이나 앱으로 잠시 이동해도 낚시 시간을 소비하지 않습니다.
  useEffect(() => {
    if (!active) {
      const timer = setTimeout(() => setCelebration((current) => ({ ...current, visible: false })), 0);
      if (pausedAtRef.current === null) pausedAtRef.current = Date.now();
      return () => clearTimeout(timer);
    }
    const pausedAt = pausedAtRef.current;
    pausedAtRef.current = null;
    if (pausedAt === null) return;
    const elapsed = Math.max(0, Date.now() - pausedAt);
    resumingRef.current = true;
    setNowMs(Date.now());
    setActivity((current) => current?.kind === 'fishing'
      ? { ...current, biteAt: current.biteAt + elapsed }
      : current);
  }, [active]);

  // 낚시: 찌가 흔들리는 순간과, 넉넉한 입력 창이 끝나는 순간
  useEffect(() => {
    if (resumingRef.current) {
      resumingRef.current = false;
      return;
    }
    if (!active || activity?.kind !== 'fishing') return;
    const wait = activity.biteAt - Date.now();
    const timer = activity.bitten
      ? setTimeout(() => {
          setActivity({ kind: 'caught', fishId: null, isNew: false });
        }, Math.max(0, wait + FISH_CATCH_WINDOW_MS))
      : setTimeout(() => {
          playSfx('chime', arcade.soundEnabled);
          triggerHaptic('light');
          setActivity({ ...activity, biteAt: Date.now(), bitten: true });
        }, Math.max(0, wait));
    return () => clearTimeout(timer);
  }, [activity, active, arcade.soundEnabled, triggerHaptic]);

  const pos = state.playerPos;
  const today = todayKey();
  const mapId = state.mapId;
  // 텃밭은 청솔 들녘에만 있습니다.
  const plotIndexes = mapId === 'field' ? FARM_PLOTS.flatMap((spot, index) => isNextTo(spot, pos) ? [index] : []) : [];
  const onDock = getVillageTile(pos.x, pos.y, mapId).type === 'dock';
  const pavilion = getMap(mapId).buildings.find((building) => building.id === 'pavilion');
  const atRestSpot = benchNearby(pos.x, pos.y, mapId) || (pavilion?.door.x === pos.x && pavilion?.door.y === pos.y);

  const gardenAction = (plotIndex: number): WorldAction => {
    const plotLabel = plotIndexes.length > 1 ? `${plotIndex + 1}번 밭 · ` : '';
    const plot = state.life.garden[plotIndex];
    if (!plot?.cropId) return { label: `${plotLabel}씨앗 심기`, run: () => setActivity({ kind: 'plant', plot: plotIndex }) };
    const crop = CROPS[plot.cropId];
    if (cropStage(plot, nowMs) === 2) {
      return {
        label: `${plotLabel}${crop.name} 수확하기`,
        run: () => {
          let discovered = false;
          const done = applyLife(({ life }) => {
            const currentPlot = life.garden[plotIndex];
            if (currentPlot?.cropId !== plot.cropId || currentPlot.plantedAtMs !== plot.plantedAtMs) return null;
            const harvest = harvestPlot(life, plotIndex, Date.now());
            if (!harvest) return null;
            const gained = gainItem(harvest.life, harvest.cropId);
            discovered = gained.isNew;
            return { life: gained.life, acorns: harvest.acorns, warmth: 2 };
          });
          if (done) {
            celebrate('basket', 'harvest');
            playSfx('chime', arcade.soundEnabled);
            triggerHaptic('light');
            onNotice(`${withObjectParticle(crop.name)} 수확했어요! 도토리 +${crop.acorns}${discovered ? ' · 도감에 새로 등록' : ''}`);
          } else onNotice('수확을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
        },
      };
    }
    if (plot.wateredDay !== today) {
      return {
        label: `${plotLabel}물 주기`,
        run: () => {
          let readyToHarvest = false;
          const watered = applyLife(({ life }) => {
            const currentPlot = life.garden[plotIndex];
            if (currentPlot?.cropId !== plot.cropId || currentPlot.plantedAtMs !== plot.plantedAtMs) return null;
            const now = Date.now();
            if (cropStage(currentPlot, now) === 2) {
              readyToHarvest = true;
              return null;
            }
            const watered = waterPlot(life, plotIndex, todayKey(), now);
            return watered && { life: watered };
          });
          if (watered) {
            celebrate('wateringCan', 'watering');
            playSfx('tileMatch', arcade.soundEnabled);
            triggerHaptic('light');
            onNotice(`${crop.name}에 물을 줬어요. 조금 더 빨리 자랍니다.`);
          } else if (readyToHarvest) {
            setNowMs(Date.now());
            onNotice(`${crop.name}가 다 자랐어요. 수확해 주세요.`);
          } else onNotice('물을 주지 못했어요. 잠시 뒤 다시 시도해 주세요.');
        },
      };
    }
    return { label: `${plotLabel}텃밭 살피기`, run: () => {
      const now = Date.now();
      if (cropStage(plot, now) === 2) {
        setNowMs(now);
        onNotice(`${crop.name}가 다 자랐어요. 수확해 주세요.`);
      } else onNotice(`${crop.name}가 자라는 중이에요. 약 ${hoursLeft(cropRemainingMs(plot, now))} 뒤 수확할 수 있어요.`);
    } };
  };

  const fishingAction = (): WorldAction | null =>
    onDock
      ? {
          label: '낚싯대 던지기',
          run: () => setActivity({ kind: 'fishing', biteAt: Date.now() + rollBiteDelayMs(Math.random()), bitten: false }),
        }
      : null;

  const restAction = (): WorldAction | null =>
    atRestSpot
      ? {
          label: '앉아 쉬기',
          run: () => {
            const actionDay = todayKey();
            const savedDraft = state.life.diary.find((entry) => entry.day === diaryDraftDay)?.text ?? '';
            const hasUnsavedDraft = diaryDraftDay !== null && diaryText.trim() !== '' && diaryText.trim() !== savedDraft;
            if (diaryDraftDay !== actionDay && !hasUnsavedDraft) {
              setDiaryDraftDay(actionDay);
              setDiaryText(state.life.diary.find((entry) => entry.day === actionDay)?.text ?? '');
            }
            setActivity({ kind: 'rest' });
            if (!canRest(state.life, actionDay)) {
              onNotice('바람이 선선하네요. 오늘 쉬기 보상은 이미 받았어요.');
              return;
            }
            // 저장 직전의 최신 상태로 다시 확인해 연타해도 하루 한 번만 받습니다.
            if (applyLife(({ life }) => (canRest(life, actionDay) ? { life: markRested(life, actionDay), vitality: REST_VITALITY, warmth: REST_WARMTH + houseComfort(life) } : null))) {
              celebrate();
              playSfx('chime', arcade.soundEnabled);
              triggerHaptic('light');
              onNotice('한숨 돌렸어요. 활력과 마음 온도를 채웠어요.');
            } else onNotice('쉬기 보상을 저장하지 못했어요. 다시 앉아 시도해 주세요.');
          },
        }
      : null;

  const forageHere = forageSpawns(getMap(mapId), today).filter(
    (spawn) => Math.abs(spawn.x - pos.x) + Math.abs(spawn.y - pos.y) <= 1 && !isForaged(state.life, today, `${mapId}:${spawn.key}`),
  );
  const forageAction = (spawn: ForageSpawn): WorldAction => {
    const info = FORAGE[spawn.itemId];
    const direction = spawn.x < pos.x ? '왼쪽' : spawn.x > pos.x ? '오른쪽' : spawn.y < pos.y ? '위쪽' : spawn.y > pos.y ? '아래쪽' : '발밑';
    return {
      label: `${info.name} 줍기${forageHere.length > 1 ? ` · ${direction}` : ''}`,
      run: () => {
        if (todayKey() !== today) {
          setNowMs(Date.now());
          onNotice('새로운 하루의 채집물을 살펴봐 주세요.');
          return;
        }
        let isNew = false;
        const done = applyLife(({ life }) => {
          const marked = markForaged(life, today, `${mapId}:${spawn.key}`);
          if (!marked) return null;
          const gained = gainItem(marked, spawn.itemId);
          isNew = gained.isNew;
          return { life: gained.life, acorns: info.acorns };
        });
        if (!done) {
          onNotice('채집을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
          return;
        }
        celebrate('basket', 'harvest');
        playSfx('chime', arcade.soundEnabled);
        triggerHaptic('light');
        onNotice(`${withObjectParticle(info.name)} 주웠어요. 도토리 +${info.acorns}${isNew ? ' · 도감에 새로 등록!' : ''}`);
      },
    };
  };

  const spot = photoSpotAt(mapId, pos.x, pos.y);
  const photoAction = (): WorldAction | null =>
    spot
      ? {
          label: '사진 찍기',
          run: () => {
            const actionDay = todayKey();
            let isNew = false;
            if (!applyLife(({ life }) => {
              const taken = takePhoto(life, spot.id, actionDay);
              isNew = taken.isNew;
              return { life: taken.life, warmth: taken.isNew ? 2 : 0 };
            })) {
              onNotice('사진을 저장하지 못했어요. 잠시 뒤 다시 찍어 주세요.');
              return;
            }
            celebrate();
            playSfx('chime', arcade.soundEnabled);
            triggerHaptic('light');
            setActivity({ kind: 'photo', spot, isNew });
          },
        }
      : null;

  const actions = activity ? [] : [...forageHere.map(forageAction), photoAction(), ...plotIndexes.map(gardenAction), fishingAction(), restAction()]
    .filter((candidate): candidate is WorldAction => candidate !== null);
  const action = actions[0] ?? null;

  const pullLine = () => {
    if (activity?.kind !== 'fishing') return;
    const now = Date.now();
    if (!activity.bitten || now < activity.biteAt) {
      onNotice('아직이에요. 찌가 쏙 들어갈 때 당겨 주세요.');
      return;
    }
    if (!isCatchInTime(activity.biteAt, now)) {
      setActivity({ kind: 'caught', fishId: null, isNew: false });
      return;
    }
    // 같은 입질을 두 번 당겨도 한 마리만: 결과 화면으로 넘어가기 전 연타를 막습니다.
    if (pulledRef.current === activity.biteAt) return;
    pulledRef.current = activity.biteAt;
    const fish = rollFish(Math.random());
    let isNew = false;
    if (!applyLife(({ life }) => {
      const gained = gainItem(life, fish.id);
      isNew = gained.isNew;
      return { life: recordCatch(gained.life, fish.id), acorns: fish.acorns, warmth: 1 };
    })) {
      onNotice('저장이 잠시 막혀 있어요. 잠시 뒤 다시 낚아 주세요.');
      setActivity(null);
      return;
    }
    celebrate();
    playSfx('chime', arcade.soundEnabled);
    triggerHaptic('light');
    setActivity({ kind: 'caught', fishId: fish.id, isNew });
  };

  const saveDiary = () => {
    if (applyLife(({ life }) => {
      const written = writeDiary(life, diaryDraftDay ?? today, diaryText);
      return written && { life: written };
    })) onNotice('한 마디를 일지에 적었어요.');
    else onNotice('일지를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  };

  const caughtFish = activity?.kind === 'caught' ? FISH.find((fish) => fish.id === activity.fishId) : undefined;

  const overlay = activity ? (
    <ScrollView style={[styles.panel, { maxHeight: height * 0.5 }]} contentContainerStyle={styles.panelContent} keyboardShouldPersistTaps="handled" testID={`activity-${activity.kind}`}>
      {activity.kind === 'plant' ? (
        <>
          <AppText variant="sectionTitle" style={styles.title}>어떤 씨앗을 심을까요?</AppText>
          {CROP_IDS.map((cropId) => (
            <SeniorButton
              key={cropId}
              testID={`plant-${cropId}`}
              label={`${CROPS[cropId].name} · ${CROPS[cropId].growMs / HOUR_MS}시간 · 도토리 ${CROPS[cropId].acorns}`}
              variant="primary"
              onPress={() => {
                const planted = applyLife(({ life }) => {
                  const planted = plantCrop(life, activity.plot, cropId, Date.now());
                  return planted && { life: planted };
                });
                if (!planted) {
                  onNotice('씨앗을 심지 못했어요. 잠시 뒤 다시 시도해 주세요.');
                  return;
                }
                celebrate('basket');
                playSfx('tileMatch', arcade.soundEnabled);
                triggerHaptic('light');
                onNotice(`${CROPS[cropId].name} 씨앗을 심었어요. 하루 한 번 물을 주면 더 빨리 자라요.`);
                setNowMs(Date.now());
                setActivity(null);
              }}
            />
          ))}
        </>
      ) : activity.kind === 'fishing' ? (
        <>
          <View style={styles.row}>
            <Image source={LIFE_PROP_SPRITES.bobber} style={[styles.bobber, activity.bitten && styles.bobberBite]} contentFit="contain" />
            <AppText variant="sectionTitle" accessibilityLiveRegion="polite" style={styles.title}>
              {activity.bitten ? '찌가 움직여요! 천천히 당겨 보세요.' : '찌를 지켜보는 중…'}
            </AppText>
          </View>
          <AppText variant="body" style={styles.body}>
            {`찌가 움직이면 ${FISH_CATCH_WINDOW_MS / 1000}초 안에 당겨 주세요. 다른 화면을 보는 동안에는 시간이 멈춰요. 이동하면 낚시를 그만둡니다.`}
          </AppText>
          <SeniorButton testID="btn-pull-line" label="낚싯대 당기기" variant="accent" onPress={pullLine} />
        </>
      ) : activity.kind === 'photo' ? (
        <>
          <Image source={POSTCARDS[activity.spot.id]} style={styles.postcard} contentFit="cover" accessibilityLabel={`${activity.spot.name} 사진`} />
          <AppText variant="sectionTitle" style={styles.title}>{activity.spot.name}</AppText>
          <AppText variant="body" style={styles.body}>
            {activity.spot.caption} {activity.isNew ? '앨범에 새 사진을 붙였어요.' : '앨범 사진을 오늘 날짜로 바꿨어요.'}
          </AppText>
        </>
      ) : activity.kind === 'caught' ? (
        <>
          {caughtFish ? (
            <View style={styles.row}>
              <Image source={FISH_SPRITES[caughtFish.id]} style={styles.fish} contentFit="contain" />
              <AppText variant="sectionTitle" style={styles.title}>
                {withObjectParticle(caughtFish.name)} 낚았어요! 도토리 +{caughtFish.acorns}{activity.isNew ? ' · 도감에 새로 등록!' : ''}
              </AppText>
            </View>
          ) : (
            <AppText variant="sectionTitle" style={styles.title}>아깝게 놓쳤어요. 물고기는 또 옵니다.</AppText>
          )}
          <SeniorButton testID="btn-cast-again" label="한 번 더 던지기" variant="primary"
            onPress={() => setActivity({ kind: 'fishing', biteAt: Date.now() + rollBiteDelayMs(Math.random()), bitten: false })} />
        </>
      ) : (
        <>
          <AppText variant="sectionTitle" style={styles.title}>잠시 쉬어 가요</AppText>
          {diaryDraftDay ? <AppText variant="body" style={styles.body}>{diaryDraftDay}의 일지</AppText> : null}
          <AppText variant="body" style={styles.body}>오늘 하루를 한 마디로 남겨 볼까요?</AppText>
          <AppText variant="body" style={styles.body}>작성 중인 글은 마을에 머무는 동안 유지돼요. 날짜가 바뀌면 저장하거나 지운 뒤 다시 앉아 주세요.</AppText>
          <TextInput
            testID="diary-input"
            value={diaryText}
            onChangeText={setDiaryText}
            maxLength={DIARY_MAX_CHARS}
            placeholder="예: 이장님과 마을 한 바퀴 걸었다"
            placeholderTextColor="#7A6A55"
            style={styles.input}
            accessibilityLabel="오늘의 한 마디"
          />
          <SeniorButton testID="btn-save-diary" label="일지에 적기" variant="primary" disabled={!diaryText.trim()} onPress={saveDiary} />
        </>
      )}
      <SeniorButton testID="btn-end-activity" label={activity.kind === 'rest' ? '일어나기' : activity.kind === 'photo' ? '닫기' : '그만하기'} variant="secondary" onPress={() => setActivity(null)} />
    </ScrollView>
  ) : null;

  const pose: PlayerPose | null = activity?.kind === 'rest' ? 'sit' : activity?.kind === 'fishing' || activity?.kind === 'caught' ? 'fish' : activity?.kind === 'photo' ? 'photo' : celebration.visible ? celebration.pose : null;

  return { action, actions, overlay, pose, nowMs, active, celebration: celebration.visible ? celebration.sequence : null,
    celebrationProp: celebration.visible ? celebration.prop : null,
    finishCelebration: (key: number) => setCelebration((current) => current.sequence === key ? { ...current, visible: false } : current),
    cancel: () => { setActivity(null); setCelebration((current) => current.visible ? { ...current, visible: false } : current); } };
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(252, 249, 242, 0.97)',
    borderWidth: 3,
    borderColor: '#8A5A2B',
  },
  panelContent: { gap: Spacing.sm, padding: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  title: { flex: 1, color: '#182620', fontFamily: FontWeights.strong },
  body: { color: '#24382B' },
  bobber: { width: 48, height: 48 },
  bobberBite: { transform: [{ translateY: 8 }, { rotate: '-12deg' }] },
  fish: { width: 72, height: 72 },
  postcard: { width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.md, borderWidth: 2, borderColor: '#8A5A2B' },
  input: {
    minHeight: 56,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: '#B89A7A',
    backgroundColor: '#FFFFFF',
    color: '#182620',
    fontSize: 18,
  },
});
