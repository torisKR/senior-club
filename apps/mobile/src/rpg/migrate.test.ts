import { describe, expect, it } from 'vitest';

import { mergeWithDefaults, parseLegacyRpgSave } from './migrate';
import { MemoryRpgStorage } from './rpg-storage';

const VALID_SAVE = {
  playerPos: { x: 2, y: 5 },
  stats: {
    vitality: 90,
    maxVitality: 100,
    wisdomExp: 400,
    acorns: 250,
    reputation: 20,
    dailyMorningGymDone: true,
    dailyMedicationTaken: false,
  },
  quests: [{ id: 'quest_1' }],
  inventory: [{ id: 'water_bottle', count: 1 }],
  facilities: [{ id: 'parkgolf', level: 2 }],
  partners: [{ id: 'chief_kim', recruited: true }],
  lastSavedTimestampMs: 1_700_000_000_000,
  currentChapterId: 'chapter_2',
  completedChapterIds: ['chapter_1'],
  lastDailyResetDate: '2026-11-03',
};

describe('parseLegacyRpgSave', () => {
  it('returns null for missing or empty input', () => {
    expect(parseLegacyRpgSave(null)).toBeNull();
    expect(parseLegacyRpgSave(undefined)).toBeNull();
    expect(parseLegacyRpgSave('')).toBeNull();
    expect(parseLegacyRpgSave('   ')).toBeNull();
  });

  it('returns null for non-JSON garbage', () => {
    expect(parseLegacyRpgSave('not json at all')).toBeNull();
    expect(parseLegacyRpgSave('{ broken')).toBeNull();
  });

  it('returns null when the root is not an object', () => {
    expect(parseLegacyRpgSave('[]')).toBeNull();
    expect(parseLegacyRpgSave('42')).toBeNull();
    expect(parseLegacyRpgSave('"hello"')).toBeNull();
    expect(parseLegacyRpgSave('null')).toBeNull();
  });

  it('parses a full legacy save', () => {
    expect(parseLegacyRpgSave(JSON.stringify(VALID_SAVE))).toEqual(VALID_SAVE);
  });

  it('tolerates missing fields', () => {
    const parsed = parseLegacyRpgSave(JSON.stringify({ stats: { acorns: 5 } }));

    expect(parsed).toEqual({ stats: { acorns: 5 } });
  });

  it('drops wrongly typed fields instead of failing the whole save', () => {
    const parsed = parseLegacyRpgSave(
      JSON.stringify({
        playerPos: { x: '2', y: 5 },
        stats: { acorns: '250', vitality: 90, dailyMorningGymDone: 'yes' },
        quests: 'nope',
        completedChapterIds: ['chapter_1', 7, ''],
        lastSavedTimestampMs: 'soon',
        currentChapterId: 42,
      }),
    );

    expect(parsed).toEqual({
      stats: { vitality: 90 },
      completedChapterIds: ['chapter_1'],
    });
  });

  it('returns null when nothing recognisable is present', () => {
    expect(parseLegacyRpgSave(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });

  it('accepts a double-encoded payload', () => {
    const doubleEncoded = JSON.stringify(JSON.stringify({ currentChapterId: 'chapter_3' }));

    expect(parseLegacyRpgSave(doubleEncoded)).toEqual({ currentChapterId: 'chapter_3' });
  });
});

describe('mergeWithDefaults', () => {
  const defaults = {
    acorns: 120,
    vitality: 80,
    currentChapterId: 'chapter_1',
    completedChapterIds: [] as string[],
  };

  it('returns the defaults when there is no saved state', () => {
    expect(mergeWithDefaults(null, defaults)).toBe(defaults);
    expect(mergeWithDefaults(undefined, defaults)).toBe(defaults);
  });

  it('overrides provided keys and keeps the rest', () => {
    const merged = mergeWithDefaults({ acorns: 300 }, defaults);

    expect(merged).toEqual({ ...defaults, acorns: 300 });
  });

  it('ignores explicitly undefined values', () => {
    const merged = mergeWithDefaults({ acorns: undefined, vitality: 55 }, defaults);

    expect(merged.acorns).toBe(120);
    expect(merged.vitality).toBe(55);
  });

  it('does not mutate the defaults object', () => {
    mergeWithDefaults({ acorns: 999, completedChapterIds: ['chapter_1'] }, defaults);

    expect(defaults.acorns).toBe(120);
    expect(defaults.completedChapterIds).toEqual([]);
  });
});

describe('MemoryRpgStorage', () => {
  it('returns null for unknown keys', () => {
    expect(new MemoryRpgStorage().getString('missing')).toBeNull();
  });

  it('round-trips JSON strings', () => {
    const storage = new MemoryRpgStorage();
    const raw = JSON.stringify({ currentChapterId: 'chapter_4' });

    storage.setString('senior_club_rpg_state_v1', raw);

    expect(storage.getString('senior_club_rpg_state_v1')).toBe(raw);
    expect(parseLegacyRpgSave(storage.getString('senior_club_rpg_state_v1'))).toEqual({
      currentChapterId: 'chapter_4',
    });
  });

  it('overwrites existing values', () => {
    const storage = new MemoryRpgStorage();
    storage.setString('k', 'one');
    storage.setString('k', 'two');

    expect(storage.getString('k')).toBe('two');
  });
});
