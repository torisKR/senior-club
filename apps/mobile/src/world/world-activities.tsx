import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, useWindowDimensions } from 'react-native';

import { PixelRadius } from '@/components/game/pixel-theme';
import { useArcade } from '@/arcade/arcade-store';
import { playSfx } from '@/audio/sound-manager';
import { AppText, SeniorButton } from '@/components/ui';
import { FontWeights, Spacing } from '@/constants/theme';
import { todayKey } from '@/rpg/daily-reset';
import { FARM_PLOTS, getVillageTile } from '@/rpg/rpg-logic';
import { getMap, type MapId } from '@/world/maps';
import { POSTCARDS, type PlayerPose } from '@/rpg/rpg-sprites';
import { useRpg } from '@/rpg/rpg-store';

import {
  canRest,
  CROP_IDS,
  CROPS,
  cropRemainingMs,
  cropStage,
  DIARY_MAX_CHARS,
  FISH,
  type FishId,
  gainItem,
  harvestPlot,
  houseComfort,
  isForaged,
  markForaged,
  markRested,
  plantCrop,
  recordCatch,
  REST_VITALITY,
  REST_WARMTH,
  takePhoto,
  waterPlot,
  writeDiary,
} from './life';
import { FORAGE, forageSpawns, photoSpotAt, type ForageSpawn, type PhotoSpot } from './explore';
import { withObjectParticle } from './josa';
import { canFishAt } from './play/fishing';
import { FishingPanel } from './play/fishing-panel';
import { ForagePanel } from './play/forage-panel';
import type { CatchResult } from './play/use-fishing-game';
import { useSimplePlay } from './play/use-simple-play';
import { useWorldActive } from './use-world-active';

/** 작물이 자라는 모습이 화면에 반영되는 주기 */
const GROWTH_TICK_MS = 30_000;
const HOUR_MS = 60 * 60 * 1000;

type Activity =
  | { kind: 'plant'; plot: number }
  | { kind: 'fishing' }
  | { kind: 'forage'; spawn: ForageSpawn; day: string }
  | { kind: 'rest' }
  | { kind: 'photo'; spot: PhotoSpot; isNew: boolean };

export interface WorldAction {
  label: string;
  run: () => void;
}

const isNextTo = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

function neighborTypes(x: number, y: number, mapId: MapId): string[] {
  return NEIGHBORS.map(([dx, dy]) => getVillageTile(x + dx, y + dy, mapId).type);
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
  const simplePlay = useSimplePlay();
  const active = worldActive && !paused;
  const { height } = useWindowDimensions();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [celebration, setCelebration] = useState<{ sequence: number; visible: boolean; prop: 'wateringCan' | 'basket' | null; pose: PlayerPose | null }>({ sequence: 0, visible: false, prop: null, pose: null });
  const celebrate = (prop: 'wateringCan' | 'basket' | null = null, pose: PlayerPose | null = null) => setCelebration((current) => ({ sequence: current.sequence + 1, visible: true, prop, pose }));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [diaryText, setDiaryText] = useState('');
  const [diaryDraftDay, setDiaryDraftDay] = useState<string | null>(null);

  useEffect(() => {
    if (!worldActive) return;
    const refresh = setTimeout(() => setNowMs(Date.now()), 0);
    const timer = setInterval(() => setNowMs(Date.now()), GROWTH_TICK_MS);
    return () => {
      clearTimeout(refresh);
      clearInterval(timer);
    };
  }, [worldActive]);

  // 마을이 가려지면 축하 연출을 거두고, 돌아오면 시각을 새로 읽습니다. (낚시 시간은 낚시 창이 active를 보고 스스로 멈춥니다.)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (active) setNowMs(Date.now());
      else setCelebration((current) => ({ ...current, visible: false }));
    }, 0);
    return () => clearTimeout(timer);
  }, [active]);

  const pos = state.playerPos;
  const today = todayKey();
  const mapId = state.mapId;
  // 텃밭은 청솔 들녘에만 있습니다.
  const plotIndexes = mapId === 'field' ? FARM_PLOTS.flatMap((spot, index) => isNextTo(spot, pos) ? [index] : []) : [];
  const around = neighborTypes(pos.x, pos.y, mapId);
  // 지도 종류와 상관없이 선착장이거나 물 타일 옆이면 낚시할 수 있습니다.
  const atWaterside = canFishAt(getVillageTile(pos.x, pos.y, mapId).type, around);
  const pavilion = getMap(mapId).buildings.find((building) => building.id === 'pavilion');
  const atRestSpot = around.includes('bench') || (pavilion?.door.x === pos.x && pavilion?.door.y === pos.y);

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
    atWaterside ? { label: '낚싯대 던지기', run: () => setActivity({ kind: 'fishing' }) } : null;

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
    const direction = spawn.x < pos.x ? '왼쪽' : spawn.x > pos.x ? '오른쪽' : spawn.y < pos.y ? '위쪽' : spawn.y > pos.y ? '아래쪽' : '발밑';
    return {
      label: `풀숲 헤치기${forageHere.length > 1 ? ` · ${direction}` : ''}`,
      run: () => {
        if (todayKey() !== today) {
          setNowMs(Date.now());
          onNotice('새로운 하루의 채집물을 살펴봐 주세요.');
          return;
        }
        setActivity({ kind: 'forage', spawn, day: today });
      },
    };
  };
  /** 풀숲에서 찾은 채집물(과 도토리 더미)을 저장합니다. 실패하면 창에서 다시 담을 수 있습니다. */
  const collectForage = (spawn: ForageSpawn, day: string, bonusAcorns: number): boolean => {
    if (todayKey() !== day) {
      setNowMs(Date.now());
      setActivity(null);
      onNotice('새로운 하루의 채집물을 살펴봐 주세요.');
      return false;
    }
    const info = FORAGE[spawn.itemId];
    let isNew = false;
    const done = applyLife(({ life }) => {
      const marked = markForaged(life, day, `${mapId}:${spawn.key}`);
      if (!marked) return null;
      const gained = gainItem(marked, spawn.itemId);
      isNew = gained.isNew;
      return { life: gained.life, acorns: info.acorns + bonusAcorns };
    });
    if (!done) {
      onNotice('채집을 저장하지 못했어요. 다시 담아 주세요.');
      return false;
    }
    celebrate('basket', 'harvest');
    playSfx('chime', arcade.soundEnabled);
    triggerHaptic('light');
    onNotice(`${withObjectParticle(info.name)} 찾았어요. 도토리 +${info.acorns + bonusAcorns}${bonusAcorns ? ` (도토리 더미 +${bonusAcorns})` : ''}${isNew ? ' · 도감에 새로 등록!' : ''}`);
    return true;
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

  /** 낚아 올린 물고기를 저장합니다. 실패하면 낚시 창에서 다시 담을 수 있습니다. */
  const landFish = (fishId: FishId): CatchResult => {
    const fish = FISH.find((candidate) => candidate.id === fishId);
    if (!fish) return { saved: false, isNew: false };
    let isNew = false;
    if (!applyLife(({ life }) => {
      const gained = gainItem(life, fish.id);
      isNew = gained.isNew;
      return { life: recordCatch(gained.life, fish.id), acorns: fish.acorns, warmth: 1 };
    })) {
      onNotice('저장이 잠시 막혀 있어요. 잠시 뒤 다시 담아 주세요.');
      return { saved: false, isNew: false };
    }
    celebrate();
    playSfx('chime', arcade.soundEnabled);
    triggerHaptic('light');
    return { saved: true, isNew };
  };

  const saveDiary = () => {
    if (applyLife(({ life }) => {
      const written = writeDiary(life, diaryDraftDay ?? today, diaryText);
      return written && { life: written };
    })) onNotice('한 마디를 일지에 적었어요.');
    else onNotice('일지를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  };

  const closeActivity = () => setActivity(null);
  const overlay = !activity ? null : activity.kind === 'fishing' ? (
    <FishingPanel active={active} simple={simplePlay} onLand={landFish} onNotice={onNotice} onClose={closeActivity} />
  ) : activity.kind === 'forage' ? (
    <ForagePanel itemId={activity.spawn.itemId} itemName={FORAGE[activity.spawn.itemId].name} simple={simplePlay}
      onCollect={(bonusAcorns) => collectForage(activity.spawn, activity.day, bonusAcorns)} onClose={closeActivity} />
  ) : (
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
      ) : activity.kind === 'photo' ? (
        <>
          <Image source={POSTCARDS[activity.spot.id]} style={styles.postcard} contentFit="cover" accessibilityLabel={`${activity.spot.name} 사진`} />
          <AppText variant="sectionTitle" style={styles.title}>{activity.spot.name}</AppText>
          <AppText variant="body" style={styles.body}>
            {activity.spot.caption} {activity.isNew ? '앨범에 새 사진을 붙였어요.' : '앨범 사진을 오늘 날짜로 바꿨어요.'}
          </AppText>
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
      <SeniorButton testID="btn-end-activity" label={activity.kind === 'rest' ? '일어나기' : activity.kind === 'photo' ? '닫기' : '그만하기'} variant="secondary" onPress={closeActivity} />
    </ScrollView>
  );

  const pose: PlayerPose | null = activity?.kind === 'rest' ? 'sit' : activity?.kind === 'fishing' ? 'fish' : activity?.kind === 'forage' ? 'harvest' : activity?.kind === 'photo' ? 'photo' : celebration.visible ? celebration.pose : null;

  // 놀이 창(낚시·풀숲 헤치기)이 열려 있는 동안에는 걷기로 취소되지 않게 화면이 조이스틱을 끕니다.
  const playing = activity?.kind === 'fishing' || activity?.kind === 'forage';

  return { action, actions, overlay, pose, nowMs, active, playing, celebration: celebration.visible ? celebration.sequence : null,
    celebrationProp: celebration.visible ? celebration.prop : null,
    finishCelebration: (key: number) => setCelebration((current) => current.sequence === key ? { ...current, visible: false } : current),
    cancel: () => { setActivity(null); setCelebration((current) => current.visible ? { ...current, visible: false } : current); } };
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: PixelRadius,
    backgroundColor: 'rgba(252, 249, 242, 0.97)',
    borderWidth: 3,
    borderColor: '#8A5A2B',
  },
  panelContent: { gap: Spacing.sm, padding: Spacing.md },
  title: { flex: 1, color: '#182620', fontFamily: FontWeights.strong },
  body: { color: '#24382B' },
  postcard: { width: '100%', aspectRatio: 4 / 3, borderRadius: PixelRadius, borderWidth: 2, borderColor: '#8A5A2B' },
  input: {
    minHeight: 56,
    paddingHorizontal: Spacing.md,
    borderRadius: PixelRadius,
    borderWidth: 2,
    borderColor: '#B89A7A',
    backgroundColor: '#FFFFFF',
    color: '#182620',
    fontSize: 18,
  },
});
