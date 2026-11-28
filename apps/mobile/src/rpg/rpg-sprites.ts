/**
 * 청솔 시니어 마을 픽셀 아트 에셋 레지스트리.
 *
 * 모든 이미지는 Metro 번들러가 정적으로 인식할 수 있도록
 * 문자열 변수 없이 파일 경로를 그대로 넘기는 명시적 require() 로 등록합니다.
 * (require 경로가 실제 파일과 다르면 번들 단계에서 바로 실패합니다.)
 */
import type { ImageProps } from 'expo-image';
import type { ForageId } from '@/world/explore';
import type { CropId, FishId, FurnitureId } from '@/world/life';
import type { VillageBuildingId } from './rpg-types';

type SpriteSource = NonNullable<ImageProps['source']>;

export type PlayerDirection = 'down' | 'side' | 'up';

/** 타일(48dp) 에셋 */
export const TILE_SPRITES = {
  grass: require('../../assets/game/rpg/pixel/tiles/grass.png'),
  path: require('../../assets/game/rpg/pixel/tiles/path.png'),
  water: require('../../assets/game/rpg/pixel/tiles/water.png'),
  fence: require('../../assets/game/rpg/pixel/tiles/fence.png'),
  pine: require('../../assets/game/rpg/tiles/pine_01.png'),
  cherry: require('../../assets/game/rpg/pixel/tiles/cherry.png'),
  lantern: require('../../assets/game/rpg/pixel/tiles/lantern.png'),
  flower: require('../../assets/game/rpg/pixel/tiles/flower.png'),
  dock: require('../../assets/game/rpg/pixel/world/dock.png'),
  farm: require('../../assets/game/rpg/pixel/world/farm_soil.png'),
  bench: require('../../assets/game/rpg/pixel/world/bench.png'),
  forest: require('../../assets/game/rpg/pixel/world/forest_floor.png'),
  bush: require('../../assets/game/rpg/pixel/world/bush.png'),
  bridge: require('../../assets/game/rpg/pixel/world/stone_bridge.png'),
  flowersYellow: require('../../assets/game/rpg/pixel/world/flowers_yellow.png'),
  flowersPurple: require('../../assets/game/rpg/pixel/world/flowers_purple.png'),
  rock: require('../../assets/game/rpg/pixel/world/boulder.png'),
  well: require('../../assets/game/rpg/pixel/world/spring_well.png'),
  table: require('../../assets/game/rpg/pixel/world/picnic_table.png'),
  firewood: require('../../assets/game/rpg/pixel/world/firewood.png'),
  signpost: require('../../assets/game/rpg/pixel/world/signpost.png'),
  mtGround: require('../../assets/game/rpg/pixel/maps2/mt_ground.png'),
  mtRock: require('../../assets/game/rpg/pixel/maps2/mt_rock.png'),
  mtStream: require('../../assets/game/rpg/pixel/maps2/mt_stream.png'),
  mtBridge: require('../../assets/game/rpg/pixel/maps2/mt_bridge.png'),
  mtSteps: require('../../assets/game/rpg/pixel/maps2/mt_steps.png'),
  mtSpring: require('../../assets/game/rpg/pixel/maps2/mt_spring.png'),
  mtCairn: require('../../assets/game/rpg/pixel/maps2/mt_cairn.png'),
  mtMushroomLog: require('../../assets/game/rpg/pixel/maps2/mt_mushroom_log.png'),
  mtPineBig: require('../../assets/game/rpg/pixel/maps2/mt_pine_big.png'),
  mkPaving: require('../../assets/game/rpg/pixel/maps2/mk_paving.png'),
  mkLantern: require('../../assets/game/rpg/pixel/maps2/mk_lantern.png'),
  mkCrates: require('../../assets/game/rpg/pixel/maps2/mk_crates.png'),
  mkJarStack: require('../../assets/game/rpg/pixel/maps2/mk_jar_stack.png'),
  mkFlagLine: require('../../assets/game/rpg/pixel/maps2/mk_flag_line.png'),
  mkYutMat: require('../../assets/game/rpg/pixel/maps2/mk_yut_mat.png'),
} as const satisfies Record<string, SpriteSource>;

/** 시설 건물 에셋 (3 x 2 타일 풋프린트 기준) */
export const BUILDING_SPRITES = {
  club_hall: require('../../assets/game/rpg/pixel/buildings/club_hall.png'),
  parkgolf: require('../../assets/game/rpg/pixel/buildings/parkgolf.png'),
  alkkagi: require('../../assets/game/rpg/pixel/buildings/alkkagi.png'),
  sacheonseong: require('../../assets/game/rpg/pixel/buildings/sacheonseong.png'),
  herbal: require('../../assets/game/rpg/pixel/buildings/herbal.png'),
  home: require('../../assets/game/rpg/pixel/buildings/home.png'),
  pavilion: require('../../assets/game/rpg/pixel/buildings/pavilion.png'),
  stall_gukbap: require('../../assets/game/rpg/pixel/buildings/stall_gukbap.png'),
  stall_goods: require('../../assets/game/rpg/pixel/buildings/stall_goods.png'),
  stall_fish: require('../../assets/game/rpg/pixel/buildings/stall_fish.png'),
  bus_stop: require('../../assets/game/rpg/pixel/buildings/bus_stop.png'),
  observatory: require('../../assets/game/rpg/pixel/buildings/observatory.png'),
  mt_pavilion: require('../../assets/game/rpg/pixel/maps2/b_mt_pavilion.png'),
  mk_rice_cake: require('../../assets/game/rpg/pixel/maps2/b_mk_rice_cake.png'),
  mk_toy: require('../../assets/game/rpg/pixel/maps2/b_mk_toy.png'),
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
  // 솔숲 산길·오일장터 주민은 기존 그림을 다시 씁니다.
  mt_herb_gatherer: require('../../assets/game/rpg/pixel/npc/npc_herbalist.png'),
  mt_stone_keeper: require('../../assets/game/rpg/pixel/npc/npc_captain.png'),
  mk_ricecake_lady: require('../../assets/game/rpg/pixel/npc/npc_tea.png'),
  mk_toy_keeper: require('../../assets/game/rpg/pixel/npc/npc_choi.png'),
};

/** 대화창 초상화 (npc id -> portrait PNG) */
export const NPC_PORTRAITS: Record<string, SpriteSource> = {
  chief: require('../../assets/game/rpg/pixel/portraits/chief.png'),
  golf_captain: require('../../assets/game/rpg/pixel/portraits/captain.png'),
  baduk_master: require('../../assets/game/rpg/pixel/portraits/choi.png'),
  tea_manager: require('../../assets/game/rpg/pixel/portraits/tea.png'),
  herbalist: require('../../assets/game/rpg/pixel/portraits/herbalist.png'),
  mt_herb_gatherer: require('../../assets/game/rpg/pixel/portraits/herbalist.png'),
  mt_stone_keeper: require('../../assets/game/rpg/pixel/portraits/captain.png'),
  mk_ricecake_lady: require('../../assets/game/rpg/pixel/portraits/tea.png'),
  mk_toy_keeper: require('../../assets/game/rpg/pixel/portraits/choi.png'),
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

// ── 힐링 생활 에셋 (sprite-gen · Grok 생성) ──────────────────

/** 텃밭 작물 3단계: 새싹 · 자라는 중 · 수확 */
export const CROP_SPRITES: Record<CropId, readonly [SpriteSource, SpriteSource, SpriteSource]> = {
  lettuce: [
    require('../../assets/game/rpg/pixel/farm/lettuce_0.png'),
    require('../../assets/game/rpg/pixel/farm/lettuce_1.png'),
    require('../../assets/game/rpg/pixel/farm/lettuce_2.png'),
  ],
  pepper: [
    require('../../assets/game/rpg/pixel/farm/pepper_0.png'),
    require('../../assets/game/rpg/pixel/farm/pepper_1.png'),
    require('../../assets/game/rpg/pixel/farm/pepper_2.png'),
  ],
  tomato: [
    require('../../assets/game/rpg/pixel/farm/tomato_0.png'),
    require('../../assets/game/rpg/pixel/farm/tomato_1.png'),
    require('../../assets/game/rpg/pixel/farm/tomato_2.png'),
  ],
};

export const LIFE_PROP_SPRITES = {
  wateringCan: require('../../assets/game/rpg/pixel/farm/watering_can.png'),
  basket: require('../../assets/game/rpg/pixel/farm/basket.png'),
  bobber: require('../../assets/game/rpg/pixel/farm/bobber.png'),
} as const satisfies Record<string, SpriteSource>;

export const FISH_SPRITES: Record<FishId, SpriteSource> = {
  minnow: require('../../assets/game/rpg/pixel/fish/minnow.png'),
  crucian: require('../../assets/game/rpg/pixel/fish/crucian.png'),
  carp: require('../../assets/game/rpg/pixel/fish/carp.png'),
  catfish: require('../../assets/game/rpg/pixel/fish/catfish.png'),
  mandarin: require('../../assets/game/rpg/pixel/fish/mandarin.png'),
  golden: require('../../assets/game/rpg/pixel/fish/golden.png'),
};

export const FURNITURE_SPRITES: Record<FurnitureId, SpriteSource> = {
  cabinet: require('../../assets/game/rpg/pixel/furniture/cabinet.png'),
  bedding: require('../../assets/game/rpg/pixel/furniture/bedding.png'),
  orchid: require('../../assets/game/rpg/pixel/furniture/orchid.png'),
  radio: require('../../assets/game/rpg/pixel/furniture/radio.png'),
  tea_table: require('../../assets/game/rpg/pixel/furniture/tea_table.png'),
  painting: require('../../assets/game/rpg/pixel/furniture/painting.png'),
  screen: require('../../assets/game/rpg/pixel/furniture/screen.png'),
  fishbowl: require('../../assets/game/rpg/pixel/furniture/fishbowl.png'),
};

/** 휴식·낚시와 생활 활동의 정지 포즈 */
export const PLAYER_POSE_SPRITES = {
  sit: require('../../assets/game/rpg/pixel/player_pose/player_sit.png'),
  fish: require('../../assets/game/rpg/pixel/player_pose/player_fish.png'),
  watering: require('../../assets/game/rpg/pixel/player_pose/player_watering.png'),
  harvest: require('../../assets/game/rpg/pixel/player_pose/player_harvest.png'),
  photo: require('../../assets/game/rpg/pixel/player_pose/player_photo.png'),
} as const satisfies Record<string, SpriteSource>;
export type PlayerPose = keyof typeof PLAYER_POSE_SPRITES;

// ── 탐험: 채집물 · 명소 엽서 ──────────────────────────

export const FORAGE_SPRITES: Record<ForageId, SpriteSource> = {
  mushroom: require('../../assets/game/rpg/pixel/forage/mushroom.png'),
  pinecone: require('../../assets/game/rpg/pixel/forage/pinecone.png'),
  chestnut: require('../../assets/game/rpg/pixel/forage/chestnut.png'),
  pebble: require('../../assets/game/rpg/pixel/forage/pebble.png'),
  watercress: require('../../assets/game/rpg/pixel/forage/watercress.png'),
  dandelion: require('../../assets/game/rpg/pixel/forage/dandelion.png'),
  violet: require('../../assets/game/rpg/pixel/forage/violet.png'),
  clover: require('../../assets/game/rpg/pixel/forage/clover.png'),
};

export const POSTCARDS: Record<string, SpriteSource> = {
  hill: require('../../assets/game/rpg/postcards/hill.jpg'),
  bridge: require('../../assets/game/rpg/postcards/bridge.jpg'),
  spring: require('../../assets/game/rpg/postcards/spring.jpg'),
  plaza: require('../../assets/game/rpg/postcards/plaza.jpg'),
  pond: require('../../assets/game/rpg/postcards/pond.jpg'),
  sea: require('../../assets/game/rpg/postcards/sea.jpg'),
  valley: require('../../assets/game/rpg/postcards/valley.jpg'),
  fair: require('../../assets/game/rpg/postcards/fair.jpg'),
};

/** 가방·도감 아이콘: 물고기 · 다 자란 작물 · 채집물 */
export function itemSprite(id: string): SpriteSource | null {
  if (id in FISH_SPRITES) return FISH_SPRITES[id as FishId];
  if (id in CROP_SPRITES) return CROP_SPRITES[id as CropId][2];
  if (id in FORAGE_SPRITES) return FORAGE_SPRITES[id as ForageId];
  return null;
}
