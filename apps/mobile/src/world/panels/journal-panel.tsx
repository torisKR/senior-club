import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useArcade } from '@/arcade/arcade-store';
import { ArcadeSaveNotice } from '@/arcade/arcade-save-notice';
import { playSfx } from '@/audio/sound-manager';
import { AppText, Card, SectionHeader, SeniorButton } from '@/components/ui';
import { FontWeights, Spacing } from '@/constants/theme';
import { bondProgress } from '@/rpg/bond-logic';
import { todayKey } from '@/rpg/daily-reset';
import { NPC_DISPLAY } from '@/rpg/companion-lines';
import { portraitFor } from '@/rpg/rpg-sprites';
import { useRpg } from '@/rpg/rpg-store';
import { villageStyles as styles } from '@/rpg/village-styles';
import { forageSpawns, knownPhotoCount, PHOTO_SPOTS } from '../explore';
import { cropStage, FISH, isForaged } from '../life';
import { getMap } from '../maps';

const MODE_ICON_PARKGOLF = require('../../../assets/game/rpg/pixel/ui/mode_parkgolf.png');
const MODE_ICON_ALKKAGI = require('../../../assets/game/rpg/pixel/ui/mode_alkkagi.png');
const MODE_ICON_SACHEONSEONG = require('../../../assets/game/rpg/pixel/ui/mode_sacheonseong.png');
const DAILY_SEAL_STAMP = require('../../../assets/game/rpg/ui/ui_daily_seal_stamp_01.png');

/** 오늘의 일과·개근 도장·의뢰·유대 기록·나들이 가방 */
export function JournalPanel({ onNotice, nowMs }: { onNotice: (text: string) => void; nowMs: number }) {
  const { state: arcadeState, claimAttendanceStamp } = useArcade();
  const { state, claimQuestReward, heartWarmth, useInventoryItem: applyItem } = useRpg();
  const [questNotice, setQuestNotice] = useState<{ id: string; text: string } | null>(null);
  const [itemNotice, setItemNotice] = useState<{ id: string; text: string } | null>(null);
  const dailyMissions = arcadeState.dailyMissions;
  const today = todayKey(new Date(nowMs));
  const readyCrops = state.life.garden.filter((plot) => plot.cropId && cropStage(plot, nowMs) === 2).length;
  const waterableCrops = state.life.garden.filter((plot) => plot.cropId && cropStage(plot, nowMs) !== 2 && plot.wateredDay !== today).length;
  const emptyPlots = state.life.garden.filter((plot) => !plot.cropId).length;
  const fishFound = FISH.filter((fish) => (state.life.fishLog[fish.id] ?? 0) > 0).length;
  const restedToday = state.life.lastRestDay === today;
  const map = getMap(state.mapId);
  const spawns = forageSpawns(map, today);
  const remainingForage = spawns.filter((spawn) => !isForaged(state.life, today, `${map.id}:${spawn.key}`)).length;
  const missionRows = [
    { key: 'parkgolf', icon: MODE_ICON_PARKGOLF, title: '파크골프', subtitle: '1홀 클리어', done: dailyMissions.parkGolfDone },
    { key: 'alkkagi', icon: MODE_ICON_ALKKAGI, title: '알까기', subtitle: '대국 1승', done: dailyMissions.alkkagiDone },
    { key: 'sacheonseong', icon: MODE_ICON_SACHEONSEONG, title: '사천성', subtitle: '1판 클리어', done: dailyMissions.sacheonseongDone },
  ];
  const handleClaimAttendanceStamp = () => {
    if (claimAttendanceStamp()) {
      playSfx('chime', arcadeState.soundEnabled);
      onNotice('개근 도장을 찍었습니다! 명예 인장이 모였습니다.');
    }
  };
  return (
    <View style={{ gap: Spacing.md }}>
      <Card style={styles.dailyCard}>
        <SectionHeader title="오늘의 느긋한 산책" description="마음이 가는 것부터 천천히 해 보세요" />
        <AppText variant="body" style={{ color: '#24382B' }}>
          텃밭 · {[
            readyCrops > 0 ? `수확 ${readyCrops}칸` : '',
            waterableCrops > 0 ? `물 주기 ${waterableCrops}칸` : '',
            emptyPlots > 0 ? `빈 밭 ${emptyPlots}칸` : '',
          ].filter(Boolean).join(' · ') || '작물이 자라고 있어요'}
        </AppText>
        <AppText variant="body" style={{ color: '#24382B' }}>
          낚시 · 발견한 물고기 {fishFound}/{FISH.length}종
        </AppText>
        <AppText variant="body" style={{ color: '#24382B' }}>
          채집 · {spawns.length === 0 ? '숲과 강변, 꽃동산, 바닷가를 둘러보세요' : remainingForage > 0
            ? `${map.name}에서 오늘 더 찾을 수 있는 선물 ${remainingForage}개`
            : `${map.name}의 오늘 선물은 모두 주웠어요. 내일 다시 산책해요`}
        </AppText>
        <AppText variant="body" style={{ color: '#24382B' }}>
          사진 · 다녀온 명소 {knownPhotoCount(state.life.photos)}/{PHOTO_SPOTS.length}곳 · 지도에서 위치를 볼 수 있어요
        </AppText>
        <AppText variant="body" style={{ color: '#24382B' }}>
          쉬어 가기 · {restedToday ? '오늘은 쉬는 시간을 가졌어요' : '벤치나 정자에서 잠시 쉬어 보세요'}
        </AppText>
      </Card>
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
        <ArcadeSaveNotice />
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
              보상: +{q.rewardExp} EXP · 도토리 {q.rewardAcorns}개
            </AppText>
            {q.completed && !q.claimed ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const claimed = claimQuestReward(q.id);
                  setQuestNotice({ id: q.id, text: claimed ? '보상을 받았어요.' : '보상을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.' });
                  if (claimed) playSfx('chime', arcadeState.soundEnabled);
                }}
                style={styles.claimBtn}>
                <AppText variant="bodyStrong" style={{ color: '#FCF9F2', fontSize: 14 }}>보상 받기</AppText>
              </Pressable>
            ) : null}
          </View>
          {questNotice?.id === q.id ? <AppText variant="caption" accessibilityLiveRegion="polite" style={{ color: '#0E5142' }}>{questNotice.text}</AppText> : null}
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
              accessibilityState={{ disabled: item.count <= 0 || state.stats.vitality >= state.stats.maxVitality }}
              disabled={item.count <= 0 || state.stats.vitality >= state.stats.maxVitality}
              onPress={() => {
                const used = applyItem(item.id);
                setItemNotice({ id: item.id, text: used ? '사용했어요. 활력이 올랐어요.' : '저장하지 못했어요. 다시 시도해 주세요.' });
                if (used) playSfx('chime', arcadeState.soundEnabled);
              }}
              style={[styles.invUseBtn, (item.count <= 0 || state.stats.vitality >= state.stats.maxVitality) && { opacity: 0.55 }]}>
              <AppText variant="caption" style={{ color: '#FCF9F2', fontFamily: FontWeights.emphasis }}>
                {item.count <= 0 ? '남은 물품 없음' : state.stats.vitality >= state.stats.maxVitality ? '활력이 가득 찼어요' : `사용 (${item.count}개 남음)`}
              </AppText>
            </Pressable>
            {itemNotice?.id === item.id ? <AppText variant="caption" accessibilityLiveRegion="polite" style={{ color: '#0E5142' }}>{itemNotice.text}</AppText> : null}
          </Card>
        ))}
      </View>
    </View>
  );
}
