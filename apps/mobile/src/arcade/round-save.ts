import { SACHEONSEONG_MOTIFS, type AlkkagiStone, type SacheonseongCell } from './arcade-logic';
import { MemoryRpgStorage, type RpgGuardedKeyValueStorage, type RpgKeyValueStorage } from '../rpg/rpg-storage';

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
  const motifs = new Set(SACHEONSEONG_MOTIFS.map((motif) => motif.id));
  return value.board.every((row: unknown, r: number) => Array.isArray(row) && row.length === 6 && row.every((cell: unknown, c: number) =>
    record(cell) && cell.row === r && cell.col === c && (cell.motifId === null || (typeof cell.motifId === 'string' && motifs.has(cell.motifId)))))
    && integerIn(value.stageNum, 1, 10000) && integerIn(value.combo, 0, 12) && integerIn(value.maxCombo, 0, 12)
    && typeof value.statusMessage === 'string' && validAttemptId(value.storyAttemptId);
}

export type RoundLoad<T> = { status: 'valid'; value: T; raw: string } | { status: 'missing' | 'protected'; value: null; raw: null };
export type RoundSaveStatus = 'ready' | 'saved' | 'volatile' | 'failed' | 'protected' | 'conflict';

export function loadRoundState<T>(storage: RpgKeyValueStorage, key: string, validate: (value: unknown) => value is T): RoundLoad<T> {
  try {
    // SQLite의 getString은 읽기 실패도 null로 돌려줍니다. 기존 기록을 빈 판으로
    // 오인해 덮어쓰지 않도록 엄격한 읽기를 지원하면 실패를 상위 catch로 전달합니다.
    const strict = storage as Partial<RpgGuardedKeyValueStorage>;
    const raw = typeof strict.readStringStrict === 'function' ? strict.readStringStrict(key) : storage.getString(key);
    if (raw === null) return { status: 'missing', value: null, raw: null };
    const value: unknown = JSON.parse(raw);
    return validate(value) ? { status: 'valid', value, raw } : { status: 'protected', value: null, raw: null };
  } catch { return { status: 'protected', value: null, raw: null }; }
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

/** SQLite는 비교와 쓰기를 한 트랜잭션에서 처리합니다. 다른 저장소는 가능한 범위에서 원본을 확인합니다. */
export function saveRoundIfUnchanged(storage: RpgKeyValueStorage, key: string, expected: string | null, raw: string): RoundSaveStatus {
  try {
    const guarded = storage as Partial<RpgGuardedKeyValueStorage>;
    if (guarded.supportsGuardedWrites && typeof guarded.guardedWrite === 'function') {
      const result = guarded.guardedWrite(key, expected, raw);
      if (result === 'written') return storage instanceof MemoryRpgStorage ? 'volatile' : 'saved';
      if (result === 'conflict') return 'conflict';
      if (result !== 'unavailable') return 'failed';
    }
    const read = () => typeof guarded.readStringStrict === 'function' ? guarded.readStringStrict(key) : storage.getString(key);
    if (read() !== expected) return 'conflict';
    storage.setString(key, raw);
    if (read() !== raw) return 'failed';
    return storage instanceof MemoryRpgStorage ? 'volatile' : 'saved';
  } catch {
    return 'failed';
  }
}
