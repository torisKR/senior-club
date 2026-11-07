import { describe, expect, it } from 'vitest';
import { BOND_ENDING_LINES, BOND_EPISODES, chooseBondEpisode } from './bond-episodes';
import { createInitialBonds, getBond, normalizeBonds, NPC_IDS } from './bond-logic';

describe('NPC stories', () => {
  it('has two independently selectable episodes and an ending line for each NPC', () => {
    for (const npc of NPC_IDS) {
      const episodes = BOND_EPISODES.filter((episode) => episode.npcId === npc);
      expect(episodes.map((episode) => episode.threshold)).toEqual([50, 140]);
      expect(episodes.every((episode) => episode.choices.length >= 2)).toBe(true);
      expect(BOND_ENDING_LINES[npc]).toBeTruthy();
    }
  });

  it('checks thresholds and choices, stores the choice exactly once, and restores it', () => {
    const episode = BOND_EPISODES[0];
    const below = createInitialBonds().map((bond) => bond.npcId === episode.npcId ? { ...bond, points: 49 } : bond);
    expect(chooseBondEpisode(below, episode.npcId, episode.id, episode.choices[0].id)).toBe(below);
    const eligible = below.map((bond) => bond.npcId === episode.npcId ? { ...bond, points: 50 } : bond);
    expect(chooseBondEpisode(eligible, episode.npcId, episode.id, 'unknown')).toBe(eligible);
    const chosen = chooseBondEpisode(eligible, episode.npcId, episode.id, episode.choices[1].id);
    expect(chooseBondEpisode(chosen, episode.npcId, episode.id, episode.choices[0].id)).toBe(chosen);
    const restored = normalizeBonds(JSON.parse(JSON.stringify(chosen)));
    expect(getBond(restored, episode.npcId).scenesSeen).toEqual([episode.id]);
    expect(getBond(restored, episode.npcId).sceneChoices?.[episode.id]).toBe(episode.choices[1].id);
    expect(getBond(restored, episode.npcId).points).toBe(50);
  });

  it('keeps legacy scenes and tolerates malformed choice data', () => {
    const restored = normalizeBonds([{ npcId: 'chief', points: 140, scenesSeen: ['old'], sceneChoices: { old: 3, good: 'a' } }]);
    expect(getBond(restored, 'chief').scenesSeen).toEqual(['old']);
    expect(getBond(restored, 'chief').sceneChoices).toEqual({ good: 'a' });
  });
});
