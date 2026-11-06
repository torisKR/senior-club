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
  facilityRoute?: '/clubs' | '/events' | '/chat' | '/me';
  facilityLabel?: string;
}

export type VillageTileType =
  | 'path'
  | 'grass'
  | 'water'
  | 'building'
  | 'fence'
  | 'tree'
  | 'flower'
  | 'lantern';

export type VillageBuildingId = 'club_hall' | 'parkgolf' | 'alkkagi' | 'sacheonseong' | 'herbal';

export interface VillageTile {
  x: number;
  y: number;
  type: VillageTileType;
  name?: string;
  facilityRoute?: '/clubs' | '/events' | '/chat' | '/me';
  /** Building sprite id (only for 'building' tiles / door tiles). */
  spriteId?: VillageBuildingId;
  /** Tree art variant (only for 'tree' tiles). */
  variant?: 'pine' | 'cherry';
}
