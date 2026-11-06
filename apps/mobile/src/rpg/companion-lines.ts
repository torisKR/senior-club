/**
 * 동행 산책·함께 한 판에서 쓰는 NPC 대사.
 *
 * 힐링 톤 원칙(스토리 바이블 §8): 감정은 형용사가 아니라 행동으로, 한 줄 30자 안팎.
 * 실패를 나무라지 않고 다음 행동을 권합니다.
 */

import type { NpcId } from './bond-logic';

export const NPC_DISPLAY: Record<NpcId, { name: string; title: string; short: string }> = {
  chief: { name: '김 이장', title: '마을회관 어르신', short: '이장님' },
  golf_captain: { name: '박 캡틴', title: '파크골프장 반장', short: '캡틴' },
  baduk_master: { name: '최 사범', title: '송학기원 원장', short: '사범님' },
  tea_manager: { name: '이 다도명인', title: '매화다실 안주인', short: '다도명인' },
  herbalist: { name: '강 원장', title: '청솔 한약방', short: '원장님' },
};

/** 동행 산책 중 3~5걸음마다 하나씩 보여줍니다. */
export const WALK_LINES: Record<NpcId, readonly string[]> = {
  chief: [
    '해가 좋네. 천천히 가세나.',
    '이 길은 내 젊을 때도 그대로일세.',
    '마을에 사람 소리가 나니 좋구먼.',
    '오늘은 어디까지 걸어볼까?',
  ],
  golf_captain: [
    '오늘 잔디 결이 아주 좋습니다.',
    '어깨 힘 빼고, 발끝만 보세요.',
    '바람은 왼쪽에서 불어옵니다.',
    '퍼터는 가볍게 쥐는 게 좋아요.',
  ],
  baduk_master: [
    '바람 소리가 반상 같구려.',
    '서두르지 않아도 됩니다.',
    '한 수 쉬어가는 것도 실력이지요.',
    '이 나무 아래서 한번 쉬어갈까요.',
  ],
  tea_manager: [
    '매화 향이 벌써 퍼지네요.',
    '걸으시니 얼굴이 밝아지셨어요.',
    '돌아오는 길에 차 한 잔 하실래요?',
    '천천히 걷는 게 제일 좋은 약이에요.',
  ],
  herbalist: [
    '숨을 깊게, 천천히 마시세요.',
    '무릎은 가볍게 디디시고요.',
    '오늘은 30분이면 충분합니다.',
    '걷는 습관이 제일 좋은 처방이오.',
  ],
};

/** 미니게임 코치 패널의 상황별 한 줄. */
export const COACH_LINES: Record<
  NpcId,
  { start: string; success: string; miss: string; hint: string }
> = {
  golf_captain: {
    start: '자, 오늘은 제가 옆에서 볼게요.',
    success: '오호! 이건 제가 가르친 게 아니에요.',
    miss: '괜찮습니다. 다음 퍼팅이 더 좋을 거예요.',
    hint: '경사 화살표 반대쪽으로 5도만 틀어보세요.',
  },
  baduk_master: {
    start: '한 수 한 수, 급할 것 없습니다.',
    success: '곱네. 반상은 나이를 묻지 않는 법이지요.',
    miss: '졌다고 끝이 아니오. 다음 판이 있지.',
    hint: '상대 알 뒤편을 노리면 한 번에 밀립니다.',
  },
  tea_manager: {
    start: '손끝 긴장을 풀고 시작해요.',
    success: '어머, 이건 제가 훈수한 게 아녜요.',
    miss: '천천히 하세요. 짝은 기다려 줍니다.',
    hint: '바깥쪽 패부터 걷어내면 길이 열려요.',
  },
  chief: {
    start: '내가 옆에 있으면 든든하겠지.',
    success: '허허, 마을에 명인이 또 하나 늘었구먼.',
    miss: '한 판 더 하면 되지. 뭐가 급한가.',
    hint: '오늘은 체조부터 하고 와도 늦지 않네.',
  },
  herbalist: {
    start: '무리하지 마시고, 한 판만 하세요.',
    success: '이 정도면 약이 필요 없겠습니다.',
    miss: '괜찮아요. 몸이 먼저입니다.',
    hint: '어깨를 한 번 돌리고 시작하세요.',
  },
};

/** 미니게임 → 담당 NPC */
export const GAME_COACH: Record<'parkgolf' | 'alkkagi' | 'sacheonseong', NpcId> = {
  parkgolf: 'golf_captain',
  alkkagi: 'baduk_master',
  sacheonseong: 'tea_manager',
};

/** 유대 단계별 짧은 호칭 (코치 패널·기록에 사용) */
export function bondGreeting(level: number, npcId: NpcId): string {
  const who = NPC_DISPLAY[npcId].short;
  if (level >= 5) return `${who}은 늘 당신 편입니다`;
  if (level >= 4) return `${who}과는 말하지 않아도 통합니다`;
  if (level >= 3) return `${who}과 마음을 나눴습니다`;
  if (level >= 2) return `${who}과 함께 걷는 사이입니다`;
  if (level >= 1) return `${who}과 인사를 나눕니다`;
  return `${who}과 아직 서먹합니다`;
}

/** 승급 순간, 가장 가까운 사람이 건네는 한마디 */
export const PROMOTION_LINES: Record<NpcId, string> = {
  chief: '허허, 이제 우리 마을이 자네를 자랑해도 되겠군.',
  golf_captain: '이 퍼터, 이제 제가 아니라 당신 이름으로 불리겠어요.',
  baduk_master: '오늘의 한 수는 오래 기억하겠소.',
  tea_manager: '축하드려요. 차 한 잔 우려드릴게요.',
  herbalist: '이 기세라면 약보다 산책이 먼저겠습니다.',
};

/** 6막 명인전에서 유대가 깊으면 붙는 전용 한 줄 */
export const MASTER_ACT_LINES: Record<NpcId, string> = {
  chief: '김 이장: "내가 데려온 사람이 명인이 되었구먼."',
  golf_captain: '박 캡틴: "제 퍼터가 명인 손에 닿았으니 한이 없습니다."',
  baduk_master: '최 사범: "반상에서 배운 예절을 여기서도 지켰구려."',
  tea_manager: '이 다도명인: "다실에 명인께서 오셨네요. 어서 앉으세요."',
  herbalist: '강 원장: "이제 제 처방은 필요 없겠습니다."',
};
