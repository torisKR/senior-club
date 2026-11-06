/**
 * 아케이드 진행의 순수 타입·초기값.
 *
 * React/Expo를 import하지 않아 테스트에서 그대로 검증할 수 있습니다.
 * 스토리 바이블 §1: 새 회원은 **18급 입문(0 CP)** 에서 시작합니다.
 * (예전 데모 기본값 320 CP 때문에 첫 화면이 15급으로 보이던 불일치를 고친 값)
 */

export interface DailyMissionsState {
  parkGolfDone: boolean;
  alkkagiDone: boolean;
  sacheonseongDone: boolean;
  attendanceStampClaimed: boolean;
}

export interface EquippedSkinsState {
  putter: 'persimmon' | 'redwood' | 'master_gold' | 'nacre';
  board: 'kaya' | 'ginkgo' | 'celadon';
  stone: 'classic' | 'celadon';
  tile: 'ivory_wood' | 'bamboo' | 'mother_of_pearl' | 'plum';
}

export interface ArcadePersistedState {
  cp: number;
  seals: number;
  soundEnabled: boolean;
  lastPlayedMode: 'parkgolf' | 'alkkagi' | 'sacheonseong';
  parkGolfClears: number;
  parkGolfBestUnderPar: number;
  alkkagiWins: number;
  alkkagiDoubleKnockouts: number;
  sacheonseongClears: number;
  sacheonseongMaxCombo: number;
  dailyMissions: DailyMissionsState;
  lastDailyResetDate: string | null;
  equippedSkins: EquippedSkinsState;
}

export const INITIAL_ARCADE_STATE: ArcadePersistedState = {
  cp: 0,
  seals: 0,
  soundEnabled: true,
  lastPlayedMode: 'parkgolf',
  parkGolfClears: 0,
  parkGolfBestUnderPar: 0,
  alkkagiWins: 0,
  alkkagiDoubleKnockouts: 0,
  sacheonseongClears: 0,
  sacheonseongMaxCombo: 0,
  dailyMissions: {
    parkGolfDone: false,
    alkkagiDone: false,
    sacheonseongDone: false,
    attendanceStampClaimed: false,
  },
  lastDailyResetDate: null,
  equippedSkins: {
    putter: 'persimmon',
    board: 'kaya',
    stone: 'classic',
    tile: 'ivory_wood',
  },
};
