import { describe, expect, it } from 'vitest';

import {
  canMoveTo,
  findNearbyNpc,
  getVillageTile,
  INITIAL_QUESTS,
  INITIAL_STATS,
  VILLAGE_BUILDINGS,
  VILLAGE_HEIGHT,
  VILLAGE_WIDTH,
  VILLAGE_NPCS,
  isVillageDoorTile,
  VILLAGE_LAYOUT,
} from './rpg-logic';

const START_POS = { x: 23, y: 19 };

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

  it('uses the 64x56 field with the original village block at (20, 16)', () => {
    expect([VILLAGE_WIDTH, VILLAGE_HEIGHT]).toEqual([64, 56]);
    expect(VILLAGE_LAYOUT).toHaveLength(56);
    for (const row of VILLAGE_LAYOUT) expect(row).toHaveLength(64);
    expect(canMoveTo(34, 30)).toBe(false); // 연못
    expect(canMoveTo(33, 16)).toBe(true); // 풀밭
    expect(canMoveTo(20, 29)).toBe(true); // 풀밭
  });

  it('blocks out-of-bounds movement', () => {
    expect(canMoveTo(-1, 23)).toBe(false);
    expect(canMoveTo(27, -1)).toBe(false);
    expect(canMoveTo(VILLAGE_WIDTH, 30)).toBe(false);
    expect(canMoveTo(30, VILLAGE_HEIGHT)).toBe(false);
    expect(canMoveTo(1.5, 2)).toBe(false);
  });

  it('keeps the main roads and the central plaza walkable', () => {
    expect(getVillageTile(20, 23).type).toBe('path');
    expect(getVillageTile(27, 16).type).toBe('path');
    expect(getVillageTile(27, 23).type).toBe('path');
    expect(canMoveTo(27, 23)).toBe(true);
    expect(canMoveTo(20, 23)).toBe(true);
    expect(canMoveTo(27, 29)).toBe(true);
  });

  it('blocks water, fences, trees, flowers and lanterns', () => {
    expect(getVillageTile(32, 30).type).toBe('water');
    expect(canMoveTo(32, 30)).toBe(false);

    expect(getVillageTile(29, 16).type).toBe('fence');
    expect(canMoveTo(29, 16)).toBe(false);

    expect(getVillageTile(24, 18)).toMatchObject({ type: 'tree', variant: 'pine' });
    expect(canMoveTo(24, 18)).toBe(false);

    expect(getVillageTile(26, 28)).toMatchObject({ type: 'tree', variant: 'cherry' });
    expect(canMoveTo(26, 28)).toBe(false);

    expect(getVillageTile(25, 22).type).toBe('flower');
    expect(canMoveTo(25, 22)).toBe(false);

    expect(getVillageTile(26, 22).type).toBe('lantern');
    expect(canMoveTo(26, 22)).toBe(false);
  });

  it('exposes facility entrances on the door tiles', () => {
    const parkgolfDoor = getVillageTile(22, 22);
    expect(parkgolfDoor.type).toBe('building');
    expect(parkgolfDoor.name).toBe('파크골프장');
    expect(parkgolfDoor.facilityRoute).toBe('/clubs');
    expect(parkgolfDoor.spriteId).toBe('parkgolf');
    expect(isVillageDoorTile(22, 22)).toBe(true);
    expect(canMoveTo(22, 22)).toBe(true);

    expect(getVillageTile(32, 22)).toMatchObject({
      type: 'building',
      name: '송학기원',
      facilityRoute: '/events',
    });
    expect(getVillageTile(22, 27)).toMatchObject({
      type: 'building',
      name: '매화다실',
      facilityRoute: '/chat',
    });
    expect(getVillageTile(27, 19)).toMatchObject({ type: 'building', name: '마을회관' });
    expect(getVillageTile(32, 27)).toMatchObject({ type: 'building', name: '청솔 한약방' });
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

    expect(VILLAGE_NPCS.find((npc) => npc.id === 'chief')).toMatchObject({ x: 27, y: 20 });
    expect(VILLAGE_NPCS.find((npc) => npc.id === 'golf_captain')).toMatchObject({ x: 22, y: 23 });
    expect(VILLAGE_NPCS.find((npc) => npc.id === 'baduk_master')).toMatchObject({ x: 32, y: 23 });
    expect(VILLAGE_NPCS.find((npc) => npc.id === 'tea_manager')).toMatchObject({ x: 22, y: 28 });
    expect(VILLAGE_NPCS.find((npc) => npc.id === 'herbalist')).toMatchObject({ x: 32, y: 28 });
  });

  it('detects nearby NPCs by adjacency', () => {
    // 마을회관 문 앞(7,3)에서 이장님과 대화
    expect(findNearbyNpc(27, 19)?.id).toBe('chief');
    expect(findNearbyNpc(22, 22)?.id).toBe('golf_captain');
    // 대화 범위(1타일)를 벗어나면 null
    expect(findNearbyNpc(20, 16)).toBeNull();
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

describe('healing village zones', () => {
  it('marks every building footprint and door on the layout so the drawing stays honest', () => {
    for (const building of VILLAGE_BUILDINGS) {
      for (let x = building.x; x < building.x + building.width; x += 1) {
        for (let y = building.y; y < building.y + building.height; y += 1) expect(VILLAGE_LAYOUT[y][x]).toBe('B');
      }
      expect(VILLAGE_LAYOUT[building.door.y][building.door.x]).toBe('B');
      expect(canMoveTo(building.door.x, building.door.y)).toBe(true);
    }
  });

  it('opens my home door onto the house route', () => {
    const home = VILLAGE_BUILDINGS.find((building) => building.id === 'home');
    expect(home).toMatchObject({ door: { x: 38, y: 19 }, facilityRoute: '/house' });
  });

  it('lets the player stand on the dock but not on fields, benches or the lake', () => {
    expect(getVillageTile(31, 33).type).toBe('dock');
    expect(canMoveTo(31, 33)).toBe(true);
    expect(getVillageTile(40, 20).type).toBe('farm');
    expect(canMoveTo(40, 20)).toBe(false);
    expect(getVillageTile(26, 32).type).toBe('bench');
    expect(canMoveTo(26, 32)).toBe(false);
    expect(canMoveTo(32, 34)).toBe(false);
  });
});
