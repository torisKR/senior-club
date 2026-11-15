import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import type { NpcId } from '@/rpg/bond-logic';
import { WALK_LINES } from '@/rpg/companion-lines';
import { npcSpriteFor } from '@/rpg/rpg-sprites';
import { useRpg } from '@/rpg/rpg-store';
import { useReduceMotion } from '@/fx/use-reduce-motion';

import type { MapDef } from '../maps/map-types';
import { isWalkable } from '../maps/tiles';
import { isNearVisibleChunks } from '../movement/motion';
import { TILE_DP } from './map-chunk';

const NPC_SPRITE_DP = 80;
const NPC_OFFSET_X = NPC_SPRITE_DP / 2 - TILE_DP / 2;
const NPC_OFFSET_Y = NPC_SPRITE_DP - TILE_DP - 4;
const BUBBLE_MS = 6000;

const NpcSprite = React.memo(function NpcSprite({
  npcId,
  x,
  y,
  delayMs,
  reduceMotion,
  follows = false,
  bubble,
}: {
  npcId: string;
  x: number;
  y: number;
  delayMs: number;
  reduceMotion: boolean | null;
  follows?: boolean;
  bubble?: string;
}) {
  const [bob] = useState(() => new Animated.Value(0));
  const [position] = useState(() => new Animated.ValueXY({ x: x * TILE_DP - NPC_OFFSET_X, y: y * TILE_DP - NPC_OFFSET_Y }));

  useEffect(() => {
    const target = { x: x * TILE_DP - NPC_OFFSET_X, y: y * TILE_DP - NPC_OFFSET_Y };
    if (!follows || reduceMotion !== false) {
      position.stopAnimation();
      position.setValue(target);
      return;
    }
    const movement = Animated.timing(position, { toValue: target, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true });
    movement.start();
    return () => movement.stop();
  }, [position, x, y, follows, reduceMotion]);

  useEffect(() => {
    if (reduceMotion !== false) {
      bob.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(delayMs),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, delayMs, reduceMotion]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.npcSprite,
        { transform: position.getTranslateTransform() },
      ]}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        <Image source={npcSpriteFor(npcId)} style={styles.npcImage} contentFit="contain" />
      </Animated.View>
      {bubble ? <View pointerEvents="none" style={styles.walkBubble}>
        <AppText variant="caption" selectable={false} style={styles.walkBubbleText}>{bubble}</AppText>
      </View> : null}
    </Animated.View>
  );
});


/**
 * 지도의 NPC들과 동행 산책. 동행 NPC는 주인공이 지나온 칸을 한 칸 뒤에서 따라옵니다(경로 탐색 없이).
 */
export const VillagePeople = React.memo(function VillagePeople({ map, chunks, active }: { map: MapDef; chunks: readonly { cx: number; cy: number }[]; active: boolean }) {
  const { state } = useRpg();
  const reduceMotion = useReduceMotion();
  const staticMotion = active ? reduceMotion : true;
  return <>
    <StaticVillagePeople map={map} chunks={chunks} companionId={state.companionId} reduceMotion={staticMotion} />
    {state.companionId ? <CompanionFollower key={`${map.id}-${state.companionId}`} map={map} npcId={state.companionId} playerPos={state.playerPos} reduceMotion={staticMotion} /> : null}
  </>;
});

const StaticVillagePeople = React.memo(function StaticVillagePeople({ map, chunks, companionId, reduceMotion }: {
  map: MapDef;
  chunks: readonly { cx: number; cy: number }[];
  companionId: NpcId | null;
  reduceMotion: boolean | null;
}) {
  return (
    <>
      {map.npcs.filter((npc) => npc.id !== companionId && isNearVisibleChunks(npc.x, npc.y, chunks)).map((npc, index) => (
        <NpcSprite key={`npc-${npc.id}`} npcId={npc.id} x={npc.x} y={npc.y} delayMs={index * 180} reduceMotion={reduceMotion} />
      ))}
    </>
  );
});

function CompanionFollower({ map, npcId, playerPos, reduceMotion }: { map: MapDef; npcId: NpcId; playerPos: { x: number; y: number }; reduceMotion: boolean | null }) {
  const lastPlayerPos = useRef(playerPos);
  const [companionPos, setCompanionPos] = useState(() => {
    const npc = map.npcs.find((person) => person.id === npcId);
    if (npc && (npc.x !== playerPos.x || npc.y !== playerPos.y)
      && Math.abs(npc.x - playerPos.x) <= 1 && Math.abs(npc.y - playerPos.y) <= 1) return { x: npc.x, y: npc.y };
    return [[0, 1], [-1, 0], [1, 0], [0, -1]]
      .map(([dx, dy]) => ({ x: playerPos.x + dx, y: playerPos.y + dy }))
      .find((spot) => isWalkable(map, spot.x, spot.y)) ?? playerPos;
  });
  const [walkLine, setWalkLine] = useState<string | null>(null);
  const walkSteps = useRef(0);
  const walkLineIndex = useRef(0);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const previous = lastPlayerPos.current;
    if (previous.x === playerPos.x && previous.y === playerPos.y) return;
    lastPlayerPos.current = playerPos;
    setCompanionPos(previous);
    walkSteps.current += 1;
    if (walkSteps.current % 3 === 0 && bubbleTimer.current === null) {
      const lines = WALK_LINES[npcId];
      setWalkLine(lines[walkLineIndex.current % lines.length]);
      walkLineIndex.current += 1;
      bubbleTimer.current = setTimeout(() => {
        bubbleTimer.current = null;
        setWalkLine(null);
      }, BUBBLE_MS);
    }
  }, [playerPos, npcId]);

  useEffect(() => () => {
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
  }, []);

  return <NpcSprite npcId={npcId} x={companionPos.x} y={companionPos.y} delayMs={0} reduceMotion={reduceMotion} follows bubble={walkLine ?? undefined} />;
}

const styles = StyleSheet.create({
  npcSprite: { position: 'absolute', left: 0, top: 0, width: NPC_SPRITE_DP, height: NPC_SPRITE_DP },
  npcImage: { width: NPC_SPRITE_DP, height: NPC_SPRITE_DP },
  walkBubble: {
    position: 'absolute', left: NPC_OFFSET_X - 60, bottom: NPC_SPRITE_DP + 12, width: 168, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
    backgroundColor: '#FCF9F2', borderWidth: 1, borderColor: '#B89A7A', zIndex: 20,
  },
  walkBubbleText: { color: '#182620' },
});
