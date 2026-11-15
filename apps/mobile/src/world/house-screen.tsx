import { Image } from 'expo-image';
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText, Screen, SectionHeader, SeniorButton } from '@/components/ui';
import { ArcadeQuickSettings } from '@/arcade/arcade-quick-settings';
import { useArcade } from '@/arcade/arcade-store';
import { FocusedBackgroundAudio } from '@/audio/focused-background-audio';
import { playSfx } from '@/audio/sound-manager';
import { FontWeights, Radius, Spacing } from '@/constants/theme';
import { PixelFx } from '@/fx/pixel-fx';
import { useAppState } from '@/hooks/use-app-state';
import { FURNITURE_SPRITES } from '@/rpg/rpg-sprites';
import { useRpg } from '@/rpg/rpg-store';

import { withObjectParticle } from './josa';
import { buyFurniture, FURNITURE, FURNITURE_IDS, type FurnitureId, houseComfort, HOUSE_SLOT_COUNT, placeFurniture } from './life';

import { BGM_CLUB_LOUNGE } from '@/audio/bgm';

/**
 * 내 집: 방 안 6칸에 가구를 골라 놓습니다(자유 드래그 대신 큰 칸 — 큰 글씨·큰 손가락에 맞춤).
 * 혈압약도 여기서 챙깁니다.
 */
export function HouseScreen() {
  const { state, applyLife, takeMedication } = useRpg();
  const { state: arcadeState, triggerHaptic } = useArcade();
  const { width, fontScale } = useWindowDimensions();
  const { largeTextEnabled } = useAppState();
  const stackShop = width < 360 || fontScale >= 1.3 || largeTextEnabled;
  const [slot, setSlot] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [placementEffect, setPlacementEffect] = useState<{ slot: number; key: number } | null>(null);
  const effectSequence = useRef(0);
  const life = state.life;

  const buy = (id: FurnitureId) => {
    const ok = applyLife(({ life: current, acorns }) => {
      const bought = buyFurniture(current, id, acorns);
      return bought && { life: bought.life, acorns: -bought.cost };
    });
    if (ok) {
      playSfx('chime', arcadeState.soundEnabled);
      triggerHaptic('light');
      setNotice(`${withObjectParticle(FURNITURE[id].name)} 들였어요. 빈 칸을 눌러 놓아 보세요.`);
    }
    else setNotice(state.stats.acorns < FURNITURE[id].price ? '도토리가 조금 모자라요.' : '지금은 저장이 막혀 있어요. 잠시 뒤 다시 해 주세요.');
  };

  const place = (id: FurnitureId | null) => {
    if (slot === null) return;
    const outcome: { sourceSlot: number; replaced: FurnitureId | null; unchanged: boolean } = { sourceSlot: -1, replaced: null, unchanged: false };
    const placed = applyLife(({ life: current }) => {
      outcome.sourceSlot = id ? current.houseSlots.indexOf(id) : -1;
      outcome.replaced = current.houseSlots[slot];
      if (current.houseSlots[slot] === id) {
        outcome.unchanged = true;
        return null;
      }
      const placed = placeFurniture(current, slot, id);
      return placed && { life: placed };
    });
    if (!placed) {
      if (outcome.unchanged) {
        setNotice(id ? `${FURNITURE[id].name}은 이미 이 칸에 놓여 있어요.` : '이 칸은 이미 비어 있어요.');
        setSlot(null);
        return;
      }
      setNotice('가구 배치를 저장하지 못했어요. 다시 시도해 주세요.');
      return;
    }
    playSfx('tileMatch', arcadeState.soundEnabled);
    triggerHaptic('light');
    if (id) setPlacementEffect({ slot, key: ++effectSequence.current });
    const moved = id && outcome.sourceSlot >= 0 ? `${outcome.sourceSlot + 1}번 칸에서 옮겼어요.` : '';
    const stored = outcome.replaced && outcome.replaced !== id ? `${FURNITURE[outcome.replaced].name}은 보관함에 있어요.` : '';
    setNotice([id ? `${withObjectParticle(FURNITURE[id].name)} 놓았어요.` : '가구를 치웠어요.', moved, stored].filter(Boolean).join(' '));
    setSlot(null);
  };

  return (
    <Screen testID="house-screen">
      <FocusedBackgroundAudio source={BGM_CLUB_LOUNGE} enabled={arcadeState.soundEnabled} />
      <ArcadeQuickSettings />
      <View style={styles.room} accessibilityLabel={`내 방, 가구 ${houseComfort(life)}개`}>
        <View style={styles.wall} />
        <View style={styles.grid}>
          {Array.from({ length: HOUSE_SLOT_COUNT }, (_, index) => {
            const item = life.houseSlots[index];
            return (
              <Pressable
                key={index}
                testID={`house-slot-${index}`}
                accessibilityRole="button"
                accessibilityLabel={item ? `${index + 1}번 칸: ${FURNITURE[item].name}` : `${index + 1}번 빈 칸`}
                accessibilityState={{ selected: slot === index }}
                onPress={() => { setNotice(null); setSlot(index); }}
                style={[styles.slot, slot === index && styles.slotActive]}>
                <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.slotNumber}>
                  <AppText variant="caption" style={styles.slotNumberText}>{index + 1}</AppText>
                </View>
                {item ? (
                  <Image source={FURNITURE_SPRITES[item]} style={styles.furniture} contentFit="contain" />
                ) : (
                  <AppText variant="caption" style={styles.slotEmpty}>빈 칸</AppText>
                )}
                {placementEffect?.slot === index ? (
                  <PixelFx key={placementEffect.key} name="holein" scale={0.4} style={styles.placementEffect}
                    onDone={() => setPlacementEffect((current) => current?.key === placementEffect.key ? null : current)} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <AppText variant="body">도토리 🌰 {state.stats.acorns} · 놓인 가구 {houseComfort(life)}개 (쉴 때 마음 온도 +{houseComfort(life)})</AppText>
      {notice ? <AppText variant="bodyStrong" accessibilityLiveRegion="polite" style={styles.notice}>{notice}</AppText> : null}

      <SeniorButton
        testID="btn-house-meds"
        label={state.stats.dailyMedicationTaken ? '오늘 약 복용 완료 ✔' : '혈압약 챙겨 먹기 💊'}
        variant={state.stats.dailyMedicationTaken ? 'secondary' : 'accent'}
        disabled={state.stats.dailyMedicationTaken}
        onPress={() => {
          setNotice(takeMedication()
            ? '약을 챙겨 드셨어요. 활력이 차오릅니다.'
            : '복약 기록을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
        }}
      />

      {slot !== null ? (
        <View style={{ gap: Spacing.sm }}>
          <SectionHeader title={`${slot + 1}번 칸에 놓을 가구`} description="이미 놓인 가구를 고르면 이 칸으로 옮깁니다" />
          {life.ownedFurniture.length === 0 ? <AppText variant="body">아직 가진 가구가 없어요. 아래 장터에서 들여 보세요.</AppText> : null}
          {life.ownedFurniture.map((id) => {
            const currentSlot = life.houseSlots.indexOf(id);
            const label = currentSlot === slot ? `${FURNITURE[id].name} · 이 칸에 있음` : currentSlot >= 0
              ? `${FURNITURE[id].name} · ${currentSlot + 1}번 칸에서 옮기기` : `${FURNITURE[id].name} 놓기`;
            return <SeniorButton key={id} testID={`place-${id}`} label={label} variant="primary" onPress={() => place(id)} />;
          })}
          {life.houseSlots[slot] ? <SeniorButton label="칸 비우기" variant="secondary" onPress={() => place(null)} /> : null}
          <SeniorButton label="취소" variant="secondary" onPress={() => setSlot(null)} />
        </View>
      ) : null}

      <SectionHeader title="마을 가구 장터" description="도토리로 가구를 들입니다" />
      <View style={styles.shop}>
        {FURNITURE_IDS.map((id) => {
          const owned = life.ownedFurniture.includes(id);
          const shortfall = Math.max(0, FURNITURE[id].price - state.stats.acorns);
          return (
            <View key={id} style={[styles.shopItem, stackShop && styles.wideShopItem]}>
              <Image source={FURNITURE_SPRITES[id]} style={styles.shopImage} contentFit="contain" />
              <AppText variant="bodyStrong" style={{ textAlign: 'center' }}>{FURNITURE[id].name}</AppText>
              <SeniorButton
                testID={`buy-${id}`}
                label={owned ? '가지고 있음 ✔' : `🌰 ${FURNITURE[id].price}`}
                accessibilityLabel={owned ? `${FURNITURE[id].name}, 가지고 있음` : `${FURNITURE[id].name}, 도토리 ${FURNITURE[id].price}개${shortfall ? `, ${shortfall}개 부족` : ''}`}
                variant={owned ? 'secondary' : 'primary'}
                disabled={owned || shortfall > 0}
                onPress={() => buy(id)}
              />
              {!owned && shortfall > 0 ? <AppText variant="caption" style={styles.shortfall}>도토리 {shortfall}개 더 필요해요</AppText> : null}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  room: { borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: '#D9B98A', borderWidth: 4, borderColor: '#6B4426' },
  wall: { height: 28, backgroundColor: '#F3E6CC', borderBottomWidth: 4, borderBottomColor: '#8A5A2B' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: Spacing.sm, gap: Spacing.sm, justifyContent: 'center' },
  slot: {
    width: '30%',
    aspectRatio: 1,
    minHeight: 88,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(107, 68, 38, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotActive: { borderStyle: 'solid', borderColor: '#C2410C', backgroundColor: 'rgba(255, 255, 255, 0.35)' },
  slotEmpty: { color: '#6B4426', fontFamily: FontWeights.strong },
  slotNumber: { position: 'absolute', top: 3, left: 3, minWidth: 22, minHeight: 22, borderRadius: 11, backgroundColor: '#FBF6EA', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  slotNumberText: { color: '#573A1F', fontFamily: FontWeights.strong },
  furniture: { width: '90%', height: '90%' },
  placementEffect: { position: 'absolute', left: '50%', top: '50%', marginLeft: -22.4, marginTop: -19.2 },
  notice: { color: '#0E5142' },
  shop: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'space-between' },
  shopItem: { width: '48%', gap: 4, padding: Spacing.sm, borderRadius: Radius.md, backgroundColor: '#FBF6EA', borderWidth: 1, borderColor: '#D8C7A6' },
  wideShopItem: { width: '100%' },
  shopImage: { width: '100%', height: 96 },
  shortfall: { color: '#6E4228', textAlign: 'center' },
});
