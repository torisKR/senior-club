export interface RpgCharacterStats {
  vitality: number;
  maxVitality: number;
  wisdomExp: number;
  acorns: number;
  reputation: number;
  dailyMorningGymDone: boolean;
  dailyMedicationTaken: boolean;
}

export interface QuestItem {
  id: string;
  name: string;
  description: string;
  count: number;
  icon: string;
}

export interface RpgQuest {
  id: string;
  title: string;
  clientName: string;
  clientRole: string;
  locationName: string;
  description: string;
  targetType: 'parkgolf' | 'alkkagi' | 'sacheonseong' | 'daily_wellness';
  requiredCount: number;
  currentCount: number;
  rewardExp: number;
  rewardAcorns: number;
  completed: boolean;
  claimed: boolean;
}

export interface VillageNpc {
  id: string;
  name: string;
  title: string;
  x: number;
  y: number;
  dialogue: string[];
  questId?: string;
  facilityRoute?: Exclude<FacilityRoute, '/house'>;
  facilityLabel?: string;
}

/** 문 앞·대화에서 들어가는 화면 경로 */
export type FacilityRoute = '/clubs' | '/events' | '/chat' | '/me' | '/house' | '/jegi' | '/stones';

/** 같은 타일 종류 안에서 그림을 고르는 값 (솔숲 산길·오일장터 타일 포함) */
export type TileVariant =
  | 'pine' | 'cherry' | 'yellow' | 'purple'
  | 'dirt' | 'steps' | 'stream' | 'cliff' | 'logbridge' | 'spring' | 'cairn' | 'mushroomlog' | 'bigpine'
  | 'paving' | 'cheongsa' | 'crates' | 'jars' | 'flags' | 'yut';

export type VillageTileType =
  | 'path'
  | 'grass'
  | 'water'
  | 'building'
  | 'fence'
  | 'tree'
  | 'flower'
  | 'lantern'
  | 'dock'
  | 'farm'
  | 'bench'
  | 'bridge'
  | 'forest'
  | 'flowerfield'
  | 'bush'
  | 'rock'
  | 'well'
  | 'table'
  | 'firewood'
  | 'signpost'
  /** 걸을 수 없는 장식 소품 (상자·항아리·만국기) */
  | 'prop';

export type VillageBuildingId =
  | 'club_hall' | 'parkgolf' | 'alkkagi' | 'sacheonseong' | 'herbal' | 'home' | 'pavilion'
  | 'stall_gukbap' | 'stall_goods' | 'stall_fish' | 'bus_stop' | 'observatory'
  | 'mt_pavilion' | 'mk_rice_cake' | 'mk_toy';

export interface VillageTile {
  x: number;
  y: number;
  type: VillageTileType;
  name?: string;
  facilityRoute?: FacilityRoute;
  /** Building sprite id (only for 'building' tiles / door tiles). */
  spriteId?: VillageBuildingId;
  /** Tree art variant (only for 'tree' tiles). */
  variant?: TileVariant;
}
