import { describe, expect, it } from 'vitest';
import { canMoveTo, findNearbyNpc, VILLAGE_GRID_SIZE } from './rpg-logic';
import { BOND_EPISODES, chooseBondEpisode } from './bond-episodes';
import { createInitialBonds, getBond, NPC_IDS } from './bond-logic';
import { STORY_ACTIONS } from './story-progress';

function reachableNpcIds() {
  const queue = [{ x: 3, y: 3 }];
  const visited = new Set(['3,3']);
  const npcs = new Set<string>();
  while (queue.length) {
    const pos = queue.shift()!;
    const npc = findNearbyNpc(pos.x, pos.y);
    if (npc) npcs.add(npc.id);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = pos.x + dx;
      const y = pos.y + dy;
      const key = `${x},${y}`;
      if (x < 0 || y < 0 || x >= VILLAGE_GRID_SIZE || y >= VILLAGE_GRID_SIZE || visited.has(key) || !canMoveTo(x, y)) continue;
      visited.add(key);
      queue.push({ x, y });
    }
  }
  return npcs;
}

describe('story interactions in the village', () => {
  it('can reach every character and story-action giver from the initial position', () => {
    const reachable = reachableNpcIds();
    for (const npc of NPC_IDS) expect(reachable.has(npc), npc).toBe(true);
    for (const action of STORY_ACTIONS) expect(reachable.has(action.npcId), action.id).toBe(true);
  });

  it('persists either choice for every episode only at its own threshold', () => {
    for (const episode of BOND_EPISODES) {
      const at = createInitialBonds().map((bond) => bond.npcId === episode.npcId ? { ...bond, points: episode.threshold } : bond);
      const below = at.map((bond) => bond.npcId === episode.npcId ? { ...bond, points: episode.threshold - 1 } : bond);
      for (const choice of episode.choices) {
        expect(chooseBondEpisode(below, episode.npcId, episode.id, choice.id)).toBe(below);
        const updated = chooseBondEpisode(at, episode.npcId, episode.id, choice.id);
        expect(getBond(updated, episode.npcId).sceneChoices?.[episode.id]).toBe(choice.id);
      }
    }
  });
});
