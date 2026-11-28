import type { MapDef } from './map-types';

/**
 * 솔숲 산길 (48 x 40) — 버스로 가는 산. 남서쪽 들머리에서 걸어 올라갑니다.
 *  들머리 → 갈림길 → (북) 돌계단 · 솔숲 쉼터 · 산마루 / (동) 통나무 다리 · 계곡 낚시터 · 돌탑 정자.
 *  쉼터와 정자는 위쪽 통나무 다리로 이어져 한 바퀴 돌 수 있습니다.
 *  막다른 곳: 쉼터 서쪽 덤불 사이 좁은 길 끝 버섯 골, 산마루 서쪽 벼랑 끝.
 * 절벽(R)은 무늬가 반복돼 보이지 않게 두세 칸씩만 둡니다. 글자 뜻은 tiles.ts 의 LEGEND.
 */
export const MOUNTAIN_MAP: MapDef = {
  id: 'mountain',
  name: '솔숲 산길',
  layout: [
    'PPAPPAPPAPPAPPAPPAPPAPPAPPAPPAPPAPPrrPAPPAPPAPPA',
    'PuuPPPPuPPPPPPAPPuPPPPPPPPPPPPAPPPPrrAPPPAPPPPuP',
    'AuPAPPPPoPPPPPPPPuPAAAAPAPuAuPPAPPPrrPPuAPPPPuPA',
    'PAPmcmbmmAPuuffffmmmmmbmAmmmmmcPoPPrrPPPouPPPoAP',
    'PPummmmmmPuPAffffmAmmmmmmmmmAmmPAPurrPPAPoPPuPPP',
    'APPcmmmmmmmmmffffmmmmmmmmmmmmmmoPAPrrPAuPPuAuAPA',
    'PARmmmmmmmmmmmmmmmmmmmmmmmfffffPuPPrrfmcmmmmmAPP',
    'PPRfffmmmPuAPmmTmmmmmmmmmmfffffAPPPrrfmmmmmmmmPP',
    'AAPfffmmmAPAPmmmmmmgmmmmmmfffffPPuurrfcmBBBmcmPA',
    'PPAfffmMmPPuPoAuPAPPmmPPPoPAuPPAAuPrrfmmBBBmmmPP',
    'PuPRRuuRRPAoPAPPAPPummAPPPPPuAPuuRRrrfmmmmmmmcPP',
    'APuPoAPAAPPPuPPPPPPRssPPPPPoPuoPPPPrrfmmmmmmmmPA',
    'PoPPPAuuuAPPPPPuPPPRssAoPPPAPPPPPPPrrfmmmmmfbfPP',
    'PPuPPAPPPPPPAPPPPPPPssRPPPPPPoPPPPPPrrmmmmmfffPP',
    'APoAAPAPAouPPPPAAPPAssRuPPPPAPAPPPuPrrmmmmmfffPA',
    'PPPPPPuPAPAuPPPuPPuPmmPPPPPAPPPPuoPArrPummuPPPPP',
    'PAPouPPPAouuooPAPPuPmmPAAummmmmmmmmmHHmmmmAAPuuP',
    'APPffbfffcPAPPPPPuPPmmPPPPmmmmmmmmmmrrmmmmuPPPPA',
    'PPufMfffffPuuPAPmmmmmmmmmmmmPPAAPPPPrrPPmmPPPuPP',
    'PAAfffffofPPPPuPmmmmQmmbmmmmuPuuPPAArrPPmmPPPPAP',
    'AuufffffffPuPPPummmmmmmmmmmmoAPAPPRPrrPRssAPPPuA',
    'PPPAffMfffmmmmmmmTmmmmmmffffPAPuAPRPrrPRssRoPPPP',
    'PuufffffffPPPuPuffffmmmmffAfAPPAPAPPrroRssRPPPPP',
    'AuPfffffffPPuPPPffffmmmmffffAPPPPPPPrrPommRAuPPA',
    'PAufffffMfAPAPPAffMfmmmmffffPAuuAPuRrrRummPPPPuP',
    'PuAcffffffAPPPPuPPPoPPmmPAPPPPPAPPPRrrRPmmPPPPPP',
    'APPPPuPPPPPPAAPPPoPPPPmmPuuPPAuPAPuPrrufmmffffPA',
    'PuuoPPPPPPAPPPPPPuPPPRssPPuPPPuPPPuPrrPfmmffMfAP',
    'PAAPPuAPPAuPPPPPoPPPuRssRuPPPAoPPPrrrrrfmmffffPP',
    'APPPoPAPuPPPoPPPuPPPuussRPAPAPPPPPrrrrrfmmfoffPA',
    'PoPPAPuPPPPPPPPPPPPuPPmmuPuPPPPPAPrrrKKfmmffffPP',
    'PPAAPAAPPPPuPPPPPAPuPummPPPuAPuPPPrrrrrfmmffffPP',
    'APPPuoPPAPPAuPPPPPPPuPmmPPAuouPPPPrrrrrfmmffffPA',
    'PPmmBBBmgmbmmmPPPPPAPmmmmuPPPuAPuPAPrrffmmffffuP',
    'PPmmBBBmmmmmmmuPuPPPgmmmmAPPAPuPouAPrrffmmffbfPP',
    'APmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmHHmmmmffffPA',
    'PuffmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmrrmmmmfffooP',
    'PAffmmmmmmmfffPPPuuPPmmmmPPPPPPuPuPArrfoffffffPP',
    'APPuPAPPAuPPAoPPuuuPuPAPPPPuPPAPPouArroPPPPPAuPA',
    'PPAPPAPPAPPAPPAPPAPPAPPAPPAPPAPPAPPArrAPPAPPAPPA',
  ],
  buildings: [
    { id: 'bus_stop', name: '솔숲 버스 정류장', x: 4, y: 33, width: 3, height: 2, door: { x: 5, y: 35 }, busStop: true },
    { id: 'mt_pavilion', name: '계곡 돌탑 정자', x: 40, y: 8, width: 3, height: 2, door: { x: 41, y: 10 }, facilityRoute: '/stones' },
  ],
  npcs: [
    {
      id: 'mt_herb_gatherer',
      name: '심 약초꾼',
      title: '솔숲 쉼터 약초꾼',
      x: 21,
      y: 20,
      dialogue: [
        '솔숲 약수 한 모금 하고 가시게. 물맛이 달지요.',
        '버섯은 쉼터 서쪽 덤불 사이 좁은 길로 들어가면 많다오. 아는 사람만 아는 버섯 골이지.',
        '돌계단은 급할 것 없이 한 칸씩 오르면 됩니다. 산마루 바람이 기다려 줘요.',
      ],
    },
    {
      id: 'mt_stone_keeper',
      name: '한 산지기',
      title: '계곡 돌탑지기',
      x: 39,
      y: 10,
      dialogue: [
        '계곡 물소리 들으며 돌탑 하나 쌓고 가시지요.',
        '넓적한 돌은 아래에, 작은 돌은 위에. 무너져도 다시 쌓으면 그만입니다.',
        '아래쪽 통나무 다리 옆 깊은 물에는 물고기가 제법 삽니다. 낚싯대를 드리워 보세요.',
      ],
      facilityRoute: '/stones',
      facilityLabel: '돌탑 쌓으러 가기 ▶',
    },
  ],
  arrival: { x: 5, y: 36 },
  wildFloor: 'forest',
};
