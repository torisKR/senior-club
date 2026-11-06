import { describe, expect, it } from 'vitest';
import { INITIAL_QUESTS, INITIAL_STATS, updateWellnessQuest } from './rpg-logic';
import { markAttendance } from '../arcade/arcade-logic';

describe('daily activity progress', () => {
  it('requires both distinct wellness activities in the same day', () => {
    const afterGym = updateWellnessQuest(INITIAL_QUESTS, { ...INITIAL_STATS, dailyMorningGymDone: true });
    expect(afterGym[0]).toMatchObject({ currentCount: 1, completed: false });
    const afterTomorrowGym = updateWellnessQuest(afterGym, { ...INITIAL_STATS, dailyMorningGymDone: true });
    expect(afterTomorrowGym[0]).toMatchObject({ currentCount: 1, completed: false });
    const afterBoth = updateWellnessQuest(afterTomorrowGym, { ...INITIAL_STATS, dailyMorningGymDone: true, dailyMedicationTaken: true });
    expect(afterBoth[0]).toMatchObject({ currentCount: 2, completed: true });
    expect(updateWellnessQuest(afterBoth, INITIAL_STATS)[0].completed).toBe(true);
  });

  it('does not complete game missions when claiming attendance', () => {
    const missions = { parkGolfDone: true, alkkagiDone: false, sacheonseongDone: false, attendanceStampClaimed: false };
    const stamped = markAttendance(missions);
    expect(stamped).toEqual({ ...missions, attendanceStampClaimed: true });
    expect(markAttendance(stamped)).toBe(stamped);
  });
});
