import type { MapDef } from './map-types';

/**
 * 바닷가 마을 (32 x 24) — 버스로 가는 두 번째 지도.
 * 1단계에서는 지도 전환 확인용 뼈대만 둡니다. 조개 캐기·바다 물고기·등대는 4단계에서 채웁니다.
 */
export const SEASIDE_MAP: MapDef = {
  id: 'seaside',
  name: '바닷가 마을',
  layout: [
  'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP',
  'PPPCPPCPPCPPCPPCPPCPPCPPCPPCPPCP',
  'P..............................P',
  'P..BBB.........................P',
  'P..BBB.........................P',
  'P...B..........................P',
  'Pd============================dP',
  'Pddddddd=ddddddddddddddddddddddP',
  'Pddddddd=dddbddddddddddddddddddP',
  'Pddodddd=dddddddddddbddddddddddP',
  'Pddddddd=ddddddddddddddddddodddP',
  'Pddddddd=dddddddKddddddddddddddP',
  'PdddddddddddddddKdddddoddddddddP',
  'PddddoddddddddddKddddddddddddodP',
  'PdddddddddddddddKddddddddddddddP',
  '~~~~~~~~~~~~~~~~K~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~K~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~K~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~K~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  ],
  buildings: [
    { id: 'bus_stop', name: '바닷가 버스 정류장', x: 3, y: 3, width: 3, height: 2, door: { x: 4, y: 5 }, busStop: true },
  ],
  npcs: [],
  arrival: { x: 4, y: 6 },
};
