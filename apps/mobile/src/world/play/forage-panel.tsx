import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { useArcade } from '@/arcade/arcade-store';
import { playSfx } from '@/audio/sound-manager';
import { GameIcon } from '@/components/game/game-icon';
import { pixelFrameStyle } from '@/components/game/pixel-panel';
import { PixelPalette } from '@/components/game/pixel-theme';
import { AppText, SeniorButton } from '@/components/ui';
import { FontWeights, Spacing } from '@/constants/theme';
import { FORAGE_SPRITES } from '@/rpg/rpg-sprites';

import type { ForageId } from '../explore';
import { withObjectParticle } from '../josa';
import { BONUS_ACORNS, bushAt, clearBush, createForageRound, rubStrokes, strokeBush, type Bush, type BushContent, type ForageRound } from './forage-play';
import { PLAY_SPRITES } from './play-sprites';

const CELL_HEIGHT = 104;
const BUSH_DP = 76;
const RUSTLE_BEAT_MS = 160;
/** 찾은 뒤 창이 스스로 닫히기까지 — 무엇을 찾았는지 읽을 시간 */
const CLOSE_AFTER_FOUND_MS = 1600;

export interface ForagePanelProps {
  itemId: ForageId;
  itemName: string;
  /** 낭독기·동작 줄이기: 덤불 버튼을 한 번 누르면 바로 헤칩니다. */
  simple: boolean;
  /** 찾은 채집물(과 도토리 더미)을 저장합니다. 저장하지 못하면 false. */
  onCollect: (bonusAcorns: number) => boolean;
  onClose: () => void;
}

function headline(round: ForageRound, opened: BushContent | null, saved: boolean | null, itemName: string, simple: boolean): string {
  if (round.found) return saved === false ? `${withObjectParticle(itemName)} 찾았지만 아직 담지 못했어요.` : `${withObjectParticle(itemName)} 찾았어요! 바구니에 담았어요.`;
  if (opened === 'bonus') return `도토리 더미를 찾았어요! 도토리 +${BONUS_ACORNS}. 계속 찾아보세요.`;
  if (opened === 'empty') return '빈 덤불이에요. 바스락거리는 곳을 찾아보세요.';
  return simple ? '바스락거리는 풀숲을 눌러 헤쳐 보세요' : '바스락거리는 풀숲을 문질러 헤쳐 보세요';
}

/** 풀숲 헤치기 창: 덤불 여섯 개 중 바스락거리는 곳을 문질러(또는 여러 번 눌러) 채집물을 찾습니다. */
export function ForagePanel({ itemId, itemName, simple, onCollect, onClose }: ForagePanelProps) {
  const { state: arcade, triggerHaptic } = useArcade();
  const [round, setRound] = useState(() => createForageRound(Math.random));
  const [opened, setOpened] = useState<BushContent | null>(null);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [beat, setBeat] = useState(0);
  const roundRef = useRef(round);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  const animated = !simple && !round.found;
  useEffect(() => {
    if (!animated) return;
    const timer = setInterval(() => setBeat((current) => current + 1), RUSTLE_BEAT_MS);
    return () => clearInterval(timer);
  }, [animated]);

  const collect = (bonusAcorns: number) => {
    const ok = onCollect(bonusAcorns);
    setSaved(ok);
    if (ok) closeTimer.current = setTimeout(onClose, CLOSE_AFTER_FOUND_MS);
  };
  const apply = (next: ForageRound, index: number) => {
    const prev = roundRef.current;
    if (next === prev) return;
    roundRef.current = next;
    setRound(next);
    playSfx('tileMatch', arcade.soundEnabled);
    if (next.bushes[index].cover > 0) return;
    triggerHaptic('light');
    setOpened(next.bushes[index].content);
    if (next.found) collect(next.bonusAcorns);
  };

  return (
    <View testID="activity-forage" style={[pixelFrameStyle, styles.panel]} onStartShouldSetResponder={() => true}>
      <AppText variant="sectionTitle" accessibilityLiveRegion="polite" style={styles.title}>{headline(round, opened, saved, itemName, simple)}</AppText>
      {simple ? (
        <View style={styles.field}>
          {round.bushes.map((bush, index) => (
            <Pressable key={index} testID={`forage-bush-${index}`} accessibilityRole="button"
              accessibilityLabel={bushLabel(bush, index, itemName)} accessibilityState={{ disabled: bush.cover === 0 || round.found }}
              disabled={bush.cover === 0 || round.found} style={styles.cell}
              onPress={() => apply(clearBush(roundRef.current, index), index)}>
              <BushCell bush={bush} itemId={itemId} offset={0} />
            </Pressable>
          ))}
        </View>
      ) : (
        <RubField round={round} itemId={itemId} beat={beat} onStroke={(index, strokes) => apply(strokeBush(roundRef.current, index, strokes), index)} />
      )}
      <View style={styles.basketRow}>
        <Image source={PLAY_SPRITES.basket} style={styles.basket} contentFit="contain" accessible={false} />
        <AppText variant="body" style={styles.body}>
          {round.bonusAcorns > 0 ? `바구니 · 도토리 더미 +${round.bonusAcorns}` : '찾은 것은 바구니에 담겨요. 서두르지 않아도 됩니다.'}
        </AppText>
      </View>
      {round.found && saved === false ? (
        <SeniorButton testID="btn-keep-forage" label="다시 담기" variant="accent" onPress={() => collect(roundRef.current.bonusAcorns)} />
      ) : null}
      <SeniorButton testID="btn-end-activity" label={round.found && saved ? '닫기' : '그만하기'} variant="secondary" onPress={onClose} />
    </View>
  );
}

function bushLabel(bush: Bush, index: number, itemName: string): string {
  if (bush.cover > 0) return `${index + 1}번 풀숲${bush.rustles ? ', 바스락거려요' : ''}`;
  return `${index + 1}번 풀숲, ${bush.content === 'item' ? itemName : bush.content === 'bonus' ? '도토리 더미' : '빈 덤불'}`;
}

/** 손가락으로 문지르거나 톡톡 두드려 헤치는 덤불밭. */
function RubField({ round, itemId, beat, onStroke }: {
  round: ForageRound; itemId: ForageId; beat: number; onStroke: (index: number, strokes: number) => void;
}) {
  const size = useRef({ width: 0, height: 0 });
  const last = useRef<{ x: number; y: number; index: number; carryDp: number } | null>(null);
  const locate = (event: GestureResponderEvent) => {
    const { locationX: x, locationY: y } = event.nativeEvent;
    return { x, y, index: bushAt(x, y, size.current.width, size.current.height) };
  };
  return (
    <View
      testID="forage-field"
      style={styles.field}
      onLayout={(event) => { size.current = { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height }; }}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(event) => {
        const touch = locate(event);
        last.current = { ...touch, carryDp: 0 };
        onStroke(touch.index, 1);
      }}
      onResponderMove={(event) => {
        const touch = locate(event);
        const previous = last.current;
        if (!previous || previous.index !== touch.index) {
          last.current = { ...touch, carryDp: 0 };
          return;
        }
        const rubbed = rubStrokes(previous.carryDp, Math.hypot(touch.x - previous.x, touch.y - previous.y));
        last.current = { ...touch, carryDp: rubbed.carryDp };
        if (rubbed.strokes > 0) onStroke(touch.index, rubbed.strokes);
      }}
      onResponderRelease={() => { last.current = null; }}
      onResponderTerminate={() => { last.current = null; }}>
      {round.bushes.map((bush, index) => (
        <View key={index} style={styles.cell} pointerEvents="none">
          <BushCell bush={bush} itemId={itemId} offset={bush.rustles && bush.cover > 0 ? ((beat + index) % 2 === 0 ? -3 : 3) : 0} />
        </View>
      ))}
    </View>
  );
}

function BushCell({ bush, itemId, offset }: { bush: Bush; itemId: ForageId; offset: number }) {
  if (bush.cover > 0) {
    const scale = 0.6 + 0.4 * (bush.cover / bush.fullCover);
    return (
      <>
        <Image source={PLAY_SPRITES.bush} contentFit="contain" accessible={false}
          style={[styles.bush, { transform: [{ translateX: offset }, { scale }] }]} />
        <AppText variant="bodyStrong" style={styles.cellLabel}>{bush.rustles ? '바스락' : ' '}</AppText>
      </>
    );
  }
  if (bush.content === 'item') {
    return (
      <>
        <Image source={FORAGE_SPRITES[itemId]} style={styles.found} contentFit="contain" accessible={false} />
        <Image source={PLAY_SPRITES.spark} style={styles.spark} contentFit="contain" accessible={false} />
        <AppText variant="bodyStrong" style={styles.cellLabel}>찾았다!</AppText>
      </>
    );
  }
  return (
    <>
      <View style={styles.foundSlot}>{bush.content === 'bonus' ? <GameIcon name="acorn" size={44} /> : null}</View>
      <AppText variant="bodyStrong" style={styles.cellLabel}>{bush.content === 'bonus' ? `도토리 +${BONUS_ACORNS}` : '빈 덤불'}</AppText>
    </>
  );
}

const styles = StyleSheet.create({
  panel: { gap: Spacing.sm, padding: Spacing.md },
  title: { color: PixelPalette.ink, fontFamily: FontWeights.strong },
  body: { flex: 1, color: PixelPalette.ink },
  field: {
    flexDirection: 'row', flexWrap: 'wrap', borderWidth: 3, borderColor: PixelPalette.outline, borderRadius: 2,
    backgroundColor: '#5E8F52',
  },
  cell: { width: '33.33%', height: CELL_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  bush: { width: BUSH_DP, height: BUSH_DP },
  found: { width: 56, height: 56, marginBottom: 20 },
  foundSlot: { width: 56, height: 56, marginBottom: 20, alignItems: 'center', justifyContent: 'center' },
  spark: { position: 'absolute', right: 12, top: 8, width: 28, height: 28 },
  cellLabel: {
    position: 'absolute', bottom: 2, paddingHorizontal: 6, color: PixelPalette.ink,
    backgroundColor: 'rgba(247, 239, 220, 0.9)', borderRadius: 2, overflow: 'hidden',
  },
  basketRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  basket: { width: 48, height: 48 },
});
