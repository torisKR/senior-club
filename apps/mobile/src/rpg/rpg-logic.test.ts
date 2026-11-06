import { describe, expect, it } from 'vitest';

import {
  canMoveTo,
  findNearbyNpc,
  getVillageTile,
  INITIAL_QUESTS,
  INITIAL_STATS,
  VILLAGE_BUILDINGS,
  VILLAGE_GRID_SIZE,
  VILLAGE_NPCS,
  isVillageDoorTile,
} from './rpg-logic';

const START_POS = { x: 3, y: 3 };

describe('Senior Club Village RPG core logic', () => {
  it('configures initial stats and quests correctly', () => {
    expect(INITIAL_STATS.vitality).toBe(80);
    expect(INITIAL_QUESTS.length).toBe(4);
    expect(INITIAL_QUESTS.map((q) => q.id)).toEqual([
      'quest_wellness',
      'quest_parkgolf',
      'quest_alkkagi',
      'quest_sacheonseong',
    ]);
  });

  it('uses the 15x15 village grid', () => {
    expect(VILLAGE_GRID_SIZE).toBe(15);
    expect(canMoveTo(14, 14)).toBe(false); // 연못
    expect(canMoveTo(13, 0)).toBe(true); // 풀밭
    expect(canMoveTo(0, 13)).toBe(true); // 풀밭
  });

  it('blocks out-of-bounds movement', () => {
    expect(canMoveTo(-1, 0)).toBe(false);
    expect(canMoveTo(0, -1)).toBe(false);
    expect(canMoveTo(VILLAGE_GRID_SIZE, 0)).toBe(false);
    expect(canMoveTo(0, VILLAGE_GRID_SIZE)).toBe(false);
    expect(canMoveTo(1.5, 2)).toBe(false);
  });

  it('keeps the main roads and the central plaza walkable', () => {
    expect(getVillageTile(0, 7).type).toBe('path');
    expect(getVillageTile(7, 0).type).toBe('path');
    expect(getVillageTile(7, 7).type).toBe('path');
    expect(canMoveTo(7, 7)).toBe(true);
    expect(canMoveTo(0, 7)).toBe(true);
    expect(canMoveTo(7, 13)).toBe(true);
  });

  it('blocks water, fences, trees, flowers and lanterns', () => {
    expect(getVillageTile(12, 14).type).toBe('water');
    expect(canMoveTo(12, 14)).toBe(false);

    expect(getVillageTile(5, 0).type).toBe('fence');
    expect(canMoveTo(5, 0)).toBe(false);

    expect(getVillageTile(4, 2)).toMatchObject({ type: 'tree', variant: 'pine' });
    expect(canMoveTo(4, 2)).toBe(false);

    expect(getVillageTile(6, 12)).toMatchObject({ type: 'tree', variant: 'cherry' });
    expect(canMoveTo(6, 12)).toBe(false);

    expect(getVillageTile(5, 6).type).toBe('flower');
    expect(canMoveTo(5, 6)).toBe(false);

    expect(getVillageTile(6, 6).type).toBe('lantern');
    expect(canMoveTo(6, 6)).toBe(false);
  });

  it('exposes facility entrances on the door tiles', () => {
    const parkgolfDoor = getVillageTile(2, 6);
    expect(parkgolfDoor.type).toBe('building');
    expect(parkgolfDoor.name).toBe('파크골프장');
    expect(parkgolfDoor.facilityRoute).toBe('/clubs');
    expect(parkgolfDoor.spriteId).toBe('parkgolf');
    expect(isVillageDoorTile(2, 6)).toBe(true);
    expect(canMoveTo(2, 6)).toBe(true);

    expect(getVillageTile(12, 6)).toMatchObject({
      type: 'building',
      name: '송학기원',
      facilityRoute: '/events',
    });
    expect(getVillageTile(2, 11)).toMatchObject({
      type: 'building',
      name: '매화다실',
      facilityRoute: '/chat',
    });
    expect(getVillageTile(7, 3)).toMatchObject({ type: 'building', name: '마을회관' });
    expect(getVillageTile(12, 11)).toMatchObject({ type: 'building', name: '청솔 한약방' });
  });

  it('blocks the building bodies themselves', () => {
    for (const building of VILLAGE_BUILDINGS) {
      for (let dy = 0; dy < building.height; dy += 1) {
        for (let dx = 0; dx < building.width; dx += 1) {
          const x = building.x + dx;
          const y = building.y + dy;
          const tile = getVillageTile(x, y);
          expect(tile.type).toBe('building');
          expect(tile.spriteId).toBe(building.id);
          expect(canMoveTo(x, y)).toBe(false);
        }
      }
      expect(canMoveTo(building.door.x, building.door.y)).toBe(true);
    }
  });

  it('places the five village NPCs on walkable tiles with unique ids', () => {
    expect(VILLAGE_NPCS).toHaveLength(5);
    const ids = VILLAGE_NPCS.map((npc) => npc.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const npc of VILLAGE_NPCS) {
      expect(canMoveTo(npc.x, npc.y)).toBe(true);
      expect(findNearbyNpc(npc.x, npc.y)?.id).toBe(npc.id);
    }

    expect(VILLAGE_NPCS.find((npc) => npc.id === 'chief')).toMatchObject({ x: 7, y: 4 });
    expect(VILLAGE_NPCS.find((npc) => npc.id === 'golf_captain')).toMatchObject({ x: 2, y: 7 });
    expect(VILLAGE_NPCS.find((npc) => npc.id === 'baduk_master')).toMatchObject({ x: 12, y: 7 });
    expect(VILLAGE_NPCS.find((npc) => npc.id === 'tea_manager')).toMatchObject({ x: 2, y: 12 });
    expect(VILLAGE_NPCS.find((npc) => npc.id === 'herbalist')).toMatchObject({ x: 12, y: 12 });
  });

  it('detects nearby NPCs by adjacency', () => {
    // 마을회관 문 앞(7,3)에서 이장님과 대화
    expect(findNearbyNpc(7, 3)?.id).toBe('chief');
    expect(findNearbyNpc(2, 6)?.id).toBe('golf_captain');
    // 대화 범위(1타일)를 벗어나면 null
    expect(findNearbyNpc(0, 0)).toBeNull();
  });

  it('keeps every facility door reachable on foot from the spawn tile', () => {
    const visited = new Set<string>([`${START_POS.x},${START_POS.y}`]);
    const queue = [START_POS];
    while (queue.length > 0) {
      const { x, y } = queue.shift()!;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        const key = `${nx},${ny}`;
        if (visited.has(key) || !canMoveTo(nx, ny)) continue;
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }

    expect(canMoveTo(START_POS.x, START_POS.y)).toBe(true);
    for (const building of VILLAGE_BUILDINGS) {
      expect(visited.has(`${building.door.x},${building.door.y}`)).toBe(true);
    }
    for (const npc of VILLAGE_NPCS) {
      expect(visited.has(`${npc.x},${npc.y}`)).toBe(true);
    }
  });
});
