import { describe, expect, it } from 'vitest';
import { MemoryRpgStorage } from '../rpg/rpg-storage';
import { createInitialAlkkagiStones, createSacheonseongBoard } from './arcade-logic';
import { isAlkkagiRound, isGolfRound, isTileRound, loadRound, loadRoundState, saveRound } from './round-save';

describe('round persistence', () => {
  it('restores each game independently, including completed rounds', () => {
    const storage = new MemoryRpgStorage();
    const golf = { holeIndex: 1, ballPos: { x: 42, y: 66 }, strokes: 2, aimAngle: 5, powerStep: 2, holedBanner: null, lastShotNote: '다음 타구' };
    const stones = createInitialAlkkagiStones();
    stones[0] = { ...stones[0], alive: false };
    const alkkagi = { opponentIdx: 1, stones, selectedPlayerId: 'p2', selectedTargetId: 'a2', powerMode: 'double', matchDoubleKnockouts: 1, bannerText: '대국 중' };
    const board = createSacheonseongBoard(4, 6).map((row) => row.map((cell) => ({ ...cell, motifId: null })));
    const tiles = { stageNum: 2, board, combo: 12, maxCombo: 12, statusMessage: '완료' };
    saveRound(storage, 'golf', golf);
    saveRound(storage, 'alkkagi', alkkagi);
    saveRound(storage, 'tiles', tiles);
    expect(loadRound(storage, 'golf', isGolfRound)).toEqual(golf);
    expect(loadRound(storage, 'alkkagi', isAlkkagiRound)).toEqual(alkkagi);
    expect(loadRound(storage, 'tiles', isTileRound)).toEqual(tiles);
  });

  it('ignores malformed data without deleting the saved value', () => {
    const storage = new MemoryRpgStorage();
    storage.setString('golf', '{broken');
    expect(loadRound(storage, 'golf', isGolfRound)).toBeNull();
    expect(storage.getString('golf')).toBe('{broken');
    expect(loadRoundState(storage, 'golf', isGolfRound).status).toBe('protected');
    saveRound(storage, 'golf', { holeIndex: 99 });
    expect(loadRound(storage, 'golf', isGolfRound)).toBeNull();
  });

  it('reports silent write failures and identifies an in-memory fallback as temporary', () => {
    const droppedWrites = { getString: () => null, setString: () => {} };
    expect(saveRound(droppedWrites, 'golf', { strokes: 1 })).toBe('failed');
    const throwing = { getString: () => null, setString: () => { throw new Error('disk full'); } };
    expect(saveRound(throwing, 'golf', { strokes: 1 })).toBe('failed');
    const memory = new MemoryRpgStorage();
    expect(saveRound(memory, 'golf', { strokes: 1 })).toBe('volatile');
    expect(memory.getString('golf')).toBe('{"strokes":1}');
  });
});
