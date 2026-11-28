import type { MapDef } from './map-types';

/**
 * 오일장터 (40 x 30) — 버스로 가는 장날 마당.
 *  북쪽 들머리(정류장) → 청사초롱 대문 → 좌판 줄 → 가운데 마당(전통 놀이 좌판).
 *  서쪽 윷놀이 마당, 동쪽 장독대 뜰, 남쪽 담 너머 뒤뜰(채집 · 연못 낚시).
 *  막다른 곳: 남동쪽 항아리 사이 틈으로 들어가는 뒷골목 쉼터.
 * 글자 뜻은 tiles.ts 의 LEGEND.
 */
export const MARKET_MAP: MapDef = {
  id: 'market',
  name: '오일장터',
  layout: [
    'PPCPPCPPCPPCPPCPPCPPCPPCPPCPPCPPCPPCPPCP',
    'P.u....................................P',
    'P..BBB...C...........u..C........*..C..P',
    'P..BBB.....**..C...........*..C........P',
    'P.......b........g.....................P',
    'P======================================P',
    'P======================================P',
    'P#################lppl#################P',
    'P.C..............C.pp.C..............C.P',
    'P....BBB...BBB.....pp...x.BBB...BBB.j..P',
    'P..x.BBBxxlBBBjj..lppl.x..BBBxl.BBBjj..P',
    'PppppppppppppppppppppppppppppppppppppppP',
    'PppppppppppppppppppppppppppppppppppppppP',
    'PppC..........ClpppppppplC..........CppP',
    'Ppp.u.lnnnnl...pppppppppp..l......lu.ppP',
    'Ppp...pppppp.u.pppBBBpppp..#jjjjjj#..ppP',
    'Ppp..bpYpppp...lnnBBBnnlp..#jjjjjj#..ppP',
    'Ppp...ppppYpb..pppppppppp............ppP',
    'Ppp...pppppp...pppppppppp..xx..b...*.ppP',
    'Ppp.*........*.pppppppppp.*.......W..ppP',
    'PppC....*.....CbppppppppbC....*.....CppP',
    'PppppppppppppppppppppppppppppppppppppppP',
    'PpxppppppppppppppppppppppppppppppppjpjpP',
    'P#####pp############################p##P',
    'P..............................P#jxpppjP',
    'P..C.....b...*...C....u...*..C.P#ppppppP',
    'P..........~~~~~~~~~~..........P#ppYpblP',
    'P....*....C~~~~~~~~~~...C......P#ppppppP',
    'P.u.........................u..P#xlpppjP',
    'PPCPPCPPCPPCPPCPPCPPCPPCPPCPPCPPCPPCPPCP',
  ],
  buildings: [
    { id: 'bus_stop', name: '오일장 버스 정류장', x: 3, y: 2, width: 3, height: 2, door: { x: 4, y: 4 }, busStop: true },
    { id: 'mk_rice_cake', name: '오일장 떡집', x: 5, y: 9, width: 3, height: 2, door: { x: 6, y: 11 } },
    { id: 'stall_gukbap', name: '오일장 국밥 좌판', x: 11, y: 9, width: 3, height: 2, door: { x: 12, y: 11 } },
    { id: 'stall_goods', name: '오일장 잡화 좌판', x: 26, y: 9, width: 3, height: 2, door: { x: 27, y: 11 } },
    { id: 'stall_fish', name: '오일장 어물전', x: 32, y: 9, width: 3, height: 2, door: { x: 33, y: 11 } },
    { id: 'mk_toy', name: '제기차기 좌판', x: 18, y: 15, width: 3, height: 2, door: { x: 19, y: 17 }, facilityRoute: '/jegi' },
  ],
  npcs: [
    {
      id: 'mk_ricecake_lady',
      name: '송 할머니',
      title: '오일장 떡집',
      x: 8,
      y: 12,
      dialogue: [
        '갓 찐 시루떡이에요. 김 날 때 하나 맛보고 가세요.',
        '장날엔 구경이 반이지요. 장독대 뜰도, 윷놀이 마당도 천천히 둘러보세요.',
        '남쪽 담장 끝 항아리 사이로 들어가면 조용한 뒷골목 쉼터가 있답니다.',
      ],
    },
    {
      id: 'mk_toy_keeper',
      name: '방 훈장',
      title: '전통 놀이 좌판',
      x: 21,
      y: 17,
      dialogue: [
        '제기 한번 차 보시겠소? 높이보다 박자가 중요하다오.',
        '떨어뜨려도 괜찮소. 다시 주워 차면 그게 제기차기지.',
        '저쪽 멍석에선 윷판이 벌어지곤 하지요. 구경만 해도 흥이 납니다.',
      ],
      facilityRoute: '/jegi',
      facilityLabel: '제기차기 하러 가기 ▶',
    },
  ],
  arrival: { x: 4, y: 5 },
};
