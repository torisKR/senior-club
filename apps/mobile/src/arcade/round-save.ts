import type { AlkkagiStone, SacheonseongCell } from './arcade-logic';
import { MemoryRpgStorage, type RpgKeyValueStorage } from '../rpg/rpg-storage';

export interface GolfRound {
  holeIndex: number;
  ballPos: { x: number; y: number };
  strokes: number;
  aimAngle: number;
  powerStep: 1 | 2 | 3;
  holedBanner: string | null;
  lastShotNote: string;
  storyAttemptId?: string;
}

export interface AlkkagiRound {
  opponentIdx: number;
  stones: AlkkagiStone[];
  selectedPlayerId: string;
  selectedTargetId: string;
  powerMode: 'precision' | 'strong' | 'double';
  matchDoubleKnockouts: number;
  bannerText: string;
  storyAttemptId?: string;
}

export interface TileRound {
  stageNum: number;
  board: SacheonseongCell[][];
  combo: number;
  maxCombo: number;
  statusMessage: string;
  storyAttemptId?: string;
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const numberIn = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integerIn = (value: unknown, min: number, max: number): value is number => numberIn(value, min, max) && Number.isInteger(value);
const validAttemptId = (value: unknown): boolean => value === undefined ||
  (typeof value === 'string' && value.length > 0 && value.length <= 128);

export function isGolfRound(value: unknown): value is GolfRound {
  if (!record(value) || !record(value.ballPos)) return false;
  return integerIn(value.holeIndex, 0, 2) && numberIn(value.ballPos.x, 0, 100) && numberIn(value.ballPos.y, 0, 100)
    && integerIn(value.strokes, 0, 10000) && typeof value.aimAngle === 'number' && [-15, -5, 0, 5, 15].includes(value.aimAngle)
    && (value.powerStep === 1 || value.powerStep === 2 || value.powerStep === 3)
    && (value.holedBanner === null || typeof value.holedBanner === 'string') && typeof value.lastShotNote === 'string'
    && validAttemptId(value.storyAttemptId);
}

export function isAlkkagiRound(value: unknown): value is AlkkagiRound {
  if (!record(value) || !Array.isArray(value.stones) || value.stones.length !== 10) return false;
  const ids = new Set<string>();
  const validStones = value.stones.every((stone: unknown) => {
    if (!record(stone) || typeof stone.id !== 'string' || !/^[pa][1-5]$/.test(stone.id) || ids.has(stone.id)) return false;
    ids.add(stone.id);
    return stone.owner === (stone.id.startsWith('p') ? 'player' : 'ai') && numberIn(stone.x, -100, 200)
      && numberIn(stone.y, -100, 200) && typeof stone.alive === 'boolean';
  });
  return validStones && integerIn(value.opponentIdx, 0, 2) && typeof value.selectedPlayerId === 'string'
    && typeof value.selectedTargetId === 'string' && /^p[1-5]$/.test(value.selectedPlayerId)
    && /^a[1-5]$/.test(value.selectedTargetId)
    && (value.powerMode === 'precision' || value.powerMode === 'strong' || value.powerMode === 'double')
    && integerIn(value.matchDoubleKnockouts, 0, 10000) && typeof value.bannerText === 'string'
    && validAttemptId(value.storyAttemptId);
}

export function isTileRound(value: unknown): value is TileRound {
  if (!record(value) || !Array.isArray(value.board) || value.board.length !== 4) return false;
  const motifs = ['crane', 'plum', 'maple', 'moon', 'celadon', 'turtle'];
  return value.board.every((row: unknown, r: number) => Array.isArray(row) && row.length === 6 && row.every((cell: unknown, c: number) =>
    record(cell) && cell.row === r && cell.col === c && (cell.motifId === null || (typeof cell.motifId === 'string' && motifs.includes(cell.motifId)))))
    && integerIn(value.stageNum, 1, 10000) && integerIn(value.combo, 0, 12) && integerIn(value.maxCombo, 0, 12)
    && typeof value.statusMessage === 'string' && validAttemptId(value.storyAttemptId);
}

export type RoundLoad<T> = { status: 'valid'; value: T } | { status: 'missing' | 'protected'; value: null };
export type RoundSaveStatus = 'ready' | 'saved' | 'volatile' | 'failed' | 'protected';

export function loadRoundState<T>(storage: RpgKeyValueStorage, key: string, validate: (value: unknown) => value is T): RoundLoad<T> {
  try {
    const raw = storage.getString(key);
    if (raw === null) return { status: 'missing', value: null };
    const value: unknown = JSON.parse(raw);
    return validate(value) ? { status: 'valid', value } : { status: 'protected', value: null };
  } catch { return { status: 'protected', value: null }; }
}

export function loadRound<T>(storage: RpgKeyValueStorage, key: string, validate: (value: unknown) => value is T): T | null {
  return loadRoundState(storage, key, validate).value;
}

export function saveRound<T>(storage: RpgKeyValueStorage, key: string, value: T): RoundSaveStatus {
  try {
    const raw = JSON.stringify(value);
    storage.setString(key, raw);
    if (storage.getString(key) !== raw) return 'failed';
    return storage instanceof MemoryRpgStorage ? 'volatile' : 'saved';
  } catch { return 'failed'; }
}
