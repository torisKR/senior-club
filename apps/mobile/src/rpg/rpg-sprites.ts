/**
 * 청솔 시니어 마을 픽셀 아트 에셋 레지스트리.
 *
 * 모든 이미지는 Metro 번들러가 정적으로 인식할 수 있도록
 * 문자열 변수 없이 파일 경로를 그대로 넘기는 명시적 require() 로 등록합니다.
 * (require 경로가 실제 파일과 다르면 번들 단계에서 바로 실패합니다.)
 */
import type { ImageProps } from 'expo-image';
import type { VillageBuildingId } from './rpg-types';

type SpriteSource = NonNullable<ImageProps['source']>;

export type PlayerDirection = 'down' | 'side' | 'up';

/** 타일(48dp) 에셋 */
export const TILE_SPRITES = {
  grass: require('../../assets/game/rpg/pixel/tiles/grass.png'),
  path: require('../../assets/game/rpg/pixel/tiles/path.png'),
  water: require('../../assets/game/rpg/pixel/tiles/water.png'),
  fence: require('../../assets/game/rpg/pixel/tiles/fence.png'),
  pine: require('../../assets/game/rpg/pixel/tiles/pine.png'),
  cherry: require('../../assets/game/rpg/pixel/tiles/cherry.png'),
  lantern: require('../../assets/game/rpg/pixel/tiles/lantern.png'),
  flower: require('../../assets/game/rpg/pixel/tiles/flower.png'),
} as const satisfies Record<string, SpriteSource>;

/** 시설 건물 에셋 (3 x 2 타일 풋프린트 기준) */
export const BUILDING_SPRITES = {
  club_hall: require('../../assets/game/rpg/pixel/buildings/club_hall.png'),
  parkgolf: require('../../assets/game/rpg/pixel/buildings/parkgolf.png'),
  alkkagi: require('../../assets/game/rpg/pixel/buildings/alkkagi.png'),
  sacheonseong: require('../../assets/game/rpg/pixel/buildings/sacheonseong.png'),
  herbal: require('../../assets/game/rpg/pixel/buildings/herbal.png'),
} as const satisfies Record<VillageBuildingId, SpriteSource>;

/** 주인공 어르신 4방향 스프라이트 (idle / walk 4프레임) */
export const PLAYER_SPRITES: Record<
  PlayerDirection,
  { idle: readonly SpriteSource[]; walk: readonly SpriteSource[] }
> = {
  down: {
    idle: [
      require('../../assets/game/rpg/pixel/player/player_down_idle_0.png'),
      require('../../assets/game/rpg/pixel/player/player_down_idle_1.png'),
      require('../../assets/game/rpg/pixel/player/player_down_idle_2.png'),
      require('../../assets/game/rpg/pixel/player/player_down_idle_3.png'),
    ],
    walk: [
      require('../../assets/game/rpg/pixel/player/player_down_walk_0.png'),
      require('../../assets/game/rpg/pixel/player/player_down_walk_1.png'),
      require('../../assets/game/rpg/pixel/player/player_down_walk_2.png'),
      require('../../assets/game/rpg/pixel/player/player_down_walk_3.png'),
    ],
  },
  side: {
    idle: [
      require('../../assets/game/rpg/pixel/player/player_side_idle_0.png'),
      require('../../assets/game/rpg/pixel/player/player_side_idle_1.png'),
      require('../../assets/game/rpg/pixel/player/player_side_idle_2.png'),
      require('../../assets/game/rpg/pixel/player/player_side_idle_3.png'),
    ],
    walk: [
      require('../../assets/game/rpg/pixel/player/player_side_walk_0.png'),
      require('../../assets/game/rpg/pixel/player/player_side_walk_1.png'),
      require('../../assets/game/rpg/pixel/player/player_side_walk_2.png'),
      require('../../assets/game/rpg/pixel/player/player_side_walk_3.png'),
    ],
  },
  up: {
    idle: [
      require('../../assets/game/rpg/pixel/player/player_up_idle_0.png'),
      require('../../assets/game/rpg/pixel/player/player_up_idle_1.png'),
      require('../../assets/game/rpg/pixel/player/player_up_idle_2.png'),
      require('../../assets/game/rpg/pixel/player/player_up_idle_3.png'),
    ],
    walk: [
      require('../../assets/game/rpg/pixel/player/player_up_walk_0.png'),
      require('../../assets/game/rpg/pixel/player/player_up_walk_1.png'),
      require('../../assets/game/rpg/pixel/player/player_up_walk_2.png'),
      require('../../assets/game/rpg/pixel/player/player_up_walk_3.png'),
    ],
  },
};

/** 급수별 복장 세트 — sprite-gen `recolor`로 구운 변형 (build-player-tiers.mjs) */
export const PLAYER_TIER_SPRITES: Record<2 | 3, Record<PlayerDirection, { idle: readonly SpriteSource[]; walk: readonly SpriteSource[] }>> = {
  2: {
  down: {
    idle: [
      require('../../assets/game/rpg/pixel/player_tier2/player_down_idle_0.png'),
      require('../../assets/game/rpg/pixel/player_tier2/player_down_idle_1.png'),
      require('../../assets/game/rpg/pixel/player_tier2/player_down_idle_2.png'),
      require('../../assets/game/rpg/pixel/player_tier2/player_down_idle_3.png'),
    ],
    walk: [
      require('../../assets/game/rpg/pixel/player_tier2/player_down_walk_0.png'),
      require('../../assets/game/rpg/pixel/player_tier2/player_down_walk_1.png'),
      require('../../assets/game/rpg/pixel/player_tier2/player_down_walk_2.png'),
      require('../../assets/game/rpg/pixel/player_tier2/player_down_walk_3.png'),
    ],
  },
  side: {
    idle: [
      require('../../assets/game/rpg/pixel/player_tier2/player_side_idle_0.png'),
      require('../../assets/game/rpg/pixel/player_tier2/player_side_idle_1.png'),
      require('../../assets/game/rpg/pixel/player_tier2/player_side_idle_2.png'),
      require('../../assets/game/rpg/pixel/player_tier2/player_side_idle_3.png'),
    ],
    walk: [
      require('../../assets/game/rpg/pixel/player_tier2/player_side_walk_0.png'),
      require('../../assets/game/rpg/pixel/player_tier2/player_side_walk_1.png'),
      require('../../assets/game/rpg/pixel/player_tier2/player_side_walk_2.png'),
      require('../../assets/game/rpg/pixel/player_tier2/player_side_walk_3.png'),
    ],
  },
  up: {
    idle: [
      require('../../assets/game/rpg/pixel/player_tier2/player_up_idle_0.png'),
      require('../../assets/game/rpg/pixel/player_tier2/player_up_idle_1.png'),
      require('../../assets/game/rpg/pixel/player_tier2/player_up_idle_2.png'),
      require('../../assets/game/rpg/pixel/player_tier2/player_up_idle_3.png'),
    ],
    walk: [
      require('../../assets/game/rpg/pixel/player_tier2/player_up_walk_0.png'),
      require('../../assets/game/rpg/pixel/player_tier2/player_up_walk_1.png'),
      require('../../assets/game/rpg/pixel/player_tier2/player_up_walk_2.png'),
      require('../../assets/game/rpg/pixel/player_tier2/player_up_walk_3.png'),
    ],
  },
  },
  3: {
  down: {
    idle: [
      require('../../assets/game/rpg/pixel/player_tier3/player_down_idle_0.png'),
      require('../../assets/game/rpg/pixel/player_tier3/player_down_idle_1.png'),
      require('../../assets/game/rpg/pixel/player_tier3/player_down_idle_2.png'),
      require('../../assets/game/rpg/pixel/player_tier3/player_down_idle_3.png'),
    ],
    walk: [
      require('../../assets/game/rpg/pixel/player_tier3/player_down_walk_0.png'),
      require('../../assets/game/rpg/pixel/player_tier3/player_down_walk_1.png'),
      require('../../assets/game/rpg/pixel/player_tier3/player_down_walk_2.png'),
      require('../../assets/game/rpg/pixel/player_tier3/player_down_walk_3.png'),
    ],
  },
  side: {
    idle: [
      require('../../assets/game/rpg/pixel/player_tier3/player_side_idle_0.png'),
      require('../../assets/game/rpg/pixel/player_tier3/player_side_idle_1.png'),
      require('../../assets/game/rpg/pixel/player_tier3/player_side_idle_2.png'),
      require('../../assets/game/rpg/pixel/player_tier3/player_side_idle_3.png'),
    ],
    walk: [
      require('../../assets/game/rpg/pixel/player_tier3/player_side_walk_0.png'),
      require('../../assets/game/rpg/pixel/player_tier3/player_side_walk_1.png'),
      require('../../assets/game/rpg/pixel/player_tier3/player_side_walk_2.png'),
      require('../../assets/game/rpg/pixel/player_tier3/player_side_walk_3.png'),
    ],
  },
  up: {
    idle: [
      require('../../assets/game/rpg/pixel/player_tier3/player_up_idle_0.png'),
      require('../../assets/game/rpg/pixel/player_tier3/player_up_idle_1.png'),
      require('../../assets/game/rpg/pixel/player_tier3/player_up_idle_2.png'),
      require('../../assets/game/rpg/pixel/player_tier3/player_up_idle_3.png'),
    ],
    walk: [
      require('../../assets/game/rpg/pixel/player_tier3/player_up_walk_0.png'),
      require('../../assets/game/rpg/pixel/player_tier3/player_up_walk_1.png'),
      require('../../assets/game/rpg/pixel/player_tier3/player_up_walk_2.png'),
      require('../../assets/game/rpg/pixel/player_tier3/player_up_walk_3.png'),
    ],
  },
  },
};

export type PlayerTier = 1 | 2 | 3;

/** 급수(CP)로 복장 단계를 고릅니다. 9급 유단자부터 tier2, 명인은 tier3. */
export function playerTierForCp(cp: number): PlayerTier {
  if (cp >= 3500) return 3;
  if (cp >= 900) return 2;
  return 1;
}

export function playerSpriteForTier(
  tier: PlayerTier,
  direction: PlayerDirection,
  walking: boolean,
  frame: number,
): SpriteSource {
  const set = tier === 1 ? PLAYER_SPRITES : PLAYER_TIER_SPRITES[tier];
  const frames = set[direction][walking ? 'walk' : 'idle'];
  return frames[frame % frames.length] ?? frames[0];
}

/** 마을 NPC 스프라이트 (npc id -> 96px 투명 PNG) */
export const NPC_SPRITES: Record<string, SpriteSource> = {
  chief: require('../../assets/game/rpg/pixel/npc/npc_chief.png'),
  golf_captain: require('../../assets/game/rpg/pixel/npc/npc_captain.png'),
  baduk_master: require('../../assets/game/rpg/pixel/npc/npc_choi.png'),
  tea_manager: require('../../assets/game/rpg/pixel/npc/npc_tea.png'),
  herbalist: require('../../assets/game/rpg/pixel/npc/npc_herbalist.png'),
};

/** 대화창 초상화 (npc id -> portrait PNG) */
export const NPC_PORTRAITS: Record<string, SpriteSource> = {
  chief: require('../../assets/game/rpg/pixel/portraits/chief.png'),
  golf_captain: require('../../assets/game/rpg/pixel/portraits/captain.png'),
  baduk_master: require('../../assets/game/rpg/pixel/portraits/choi.png'),
  tea_manager: require('../../assets/game/rpg/pixel/portraits/tea.png'),
  herbalist: require('../../assets/game/rpg/pixel/portraits/herbalist.png'),
};

export function npcSpriteFor(npcId: string): SpriteSource {
  return NPC_SPRITES[npcId] ?? NPC_SPRITES.chief;
}

export function portraitFor(npcId: string): SpriteSource {
  return NPC_PORTRAITS[npcId] ?? NPC_PORTRAITS.chief;
}

/** 걷기/대기 상태와 프레임 인덱스로 현재 보여줄 주인공 스프라이트를 고릅니다. */
export function playerSpriteFor(
  direction: PlayerDirection,
  walking: boolean,
  frame: number,
): SpriteSource {
  const frames = PLAYER_SPRITES[direction][walking ? 'walk' : 'idle'];
  return frames[frame % frames.length] ?? frames[0];
}

export function tileSpriteFor(sprite: keyof typeof TILE_SPRITES): SpriteSource {
  return TILE_SPRITES[sprite];
}

export function buildingSpriteFor(id: VillageBuildingId): SpriteSource {
  return BUILDING_SPRITES[id];
}
