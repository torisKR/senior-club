export interface StoryChapter {
  id: string;
  actNumber: number;
  title: string;
  rankRequirement: string;
  introDialogue: string[];
  climaxTrial: {
    type: 'parkgolf' | 'alkkagi' | 'sacheonseong';
    opponentName: string;
    description: string;
    targetRoute: '/clubs' | '/events' | '/chat';
  };
  outroDialogue: string[];
  minCp?: number;
}

export const STORY_CHAPTERS: readonly StoryChapter[] = [
  {
    id: 'chapter_1',
    actNumber: 1,
    title: '제1막: 낯선 입주와 첫 아침',
    rankRequirement: '18급 입문',
    minCp: 0,
    introDialogue: [
      '평생 일터를 지키다 짐을 풀고 도착한 청솔 시니어 마을.',
      '소나무 바람 소리와 맑은 공기가 은퇴의 공허함을 포근하게 감싸줍니다.',
      '김 이장: "어서 오시게! 우선 아침 체조와 차 한잔으로 활력을 채워보시게나."',
    ],
    climaxTrial: {
      type: 'parkgolf',
      opponentName: '박 캡틴',
      description: '파크골프 1홀에서 감나무 퍼터로 버디/파 골인 성공하기',
      targetRoute: '/clubs',
    },
    outroDialogue: [
      '박 캡틴: "오호! 첫 퍼팅부터 손끝 감각이 예사롭지 않으시군요!"',
      '마을 주민들이 주인공의 정착을 반갑게 환영하며 첫 도토리 주머니를 건넵니다.',
    ],
  },
  {
    id: 'chapter_2',
    actNumber: 2,
    title: '제2막: 원목 반상의 첫 수',
    rankRequirement: '15급 정회원',
    minCp: 200,
    introDialogue: [
      '김 이장의 소개로 소나무 숲 너머 송학기원을 처음 찾았습니다.',
      '비자나무 판 위 알알이 반짝이고, 최 사범이 조용히 주인공을 바라봅니다.',
      '최 사범: "정회원이 되신 걸 환영하지. 자, 이제 정식 대국을 하나 제안하겠소."',
    ],
    climaxTrial: {
      type: 'alkkagi',
      opponentName: '최 사범',
      description: '송학기원에서 최 사범과 첫 대국, 상대 알을 판 밖으로 밀어내기',
      targetRoute: '/events',
    },
    outroDialogue: [
      '최 사범: "첫 수부터 곱네. 반상은 나이를 묻지 않는 법이지요."',
      '이웃 가게 주인들이 정회원 인사말과 함께 작은 도토리 화분을 선물합니다.',
    ],
  },
  {
    id: 'chapter_3',
    actNumber: 3,
    title: '제3막: 태평마을 친선 교류전',
    rankRequirement: '12급 숙련',
    minCp: 500,
    introDialogue: [
      '이웃 태평마을과의 가을 전통문화 친선 교류전이 다가왔습니다.',
      '그러나 이 다도명인의 손목 결림이 겹쳐 매화다실의 훈수가 시급합니다.',
      '김 이장: "숙련 명패를 받으셨으니, 이젠 훈수 쪽에서 힘을 보태주시게."',
    ],
    climaxTrial: {
      type: 'sacheonseong',
      opponentName: '이 다도명인',
      description: '매화다실에서 2회 이하 굴절 짝맞춤으로 3연속 콤보 완수하기',
      targetRoute: '/chat',
    },
    outroDialogue: [
      '이 다도명인: "덕분에 손끝 긴장이 풀리고 태평마을 친선전도 유수하게 마쳤어요."',
      '청솔마을의 친선전 소식이 이웃 마을에도 전해집니다.',
    ],
  },
  {
    id: 'chapter_4',
    actNumber: 4,
    title: '제4막: 다실의 위기와 강 원장의 처방',
    rankRequirement: '9급 유단자',
    minCp: 900,
    introDialogue: [
      '다실 문이 닫히고 주민들의 걱정이 소나무 골목에 퍼졌습니다.',
      '강 원장: "약재 배달과 아침 라운딩, 병행하는 처방을 하나 드리지요."',
      '한약방 앞에서 은은한 향기가 주인공의 유단자 명패를 부드럽게 비춥니다.',
    ],
    climaxTrial: {
      type: 'parkgolf',
      opponentName: '강 원장',
      description: '강 원장과 함께한 아침 파크골프 1홀에서 버디/파 골인 성공하기',
      targetRoute: '/clubs',
    },
    outroDialogue: [
      '강 원장: "소곤소곤 퍼팅까지 느긋하게. 이 몸짓이 곧 회복의 처방이오."',
      '주민들의 응원과 약재가 도착해 다실이 다시 문을 열고 따뜻한 김이 피어올랐습니다.',
    ],
  },
  {
    id: 'chapter_5',
    actNumber: 5,
    title: '제5막: 외지인 도전자단과의 명국',
    rankRequirement: '5급 상급',
    minCp: 1400,
    introDialogue: [
      '태평마을 도전자단이 청솔기원에 정식 도전장을 내밀었습니다.',
      '주민들의 기대와 응원이 눈빛으로 모이지만 무게가 함께 걸립니다.',
      '최 사범: "한 수 한 수에 명예가 실렸네. 그 무게를 견디는 법을 보여다오."',
    ],
    climaxTrial: {
      type: 'alkkagi',
      opponentName: '태평마을 도전자단',
      description: '알까기 대국에서 상대 알 2개 이상 밀어내는 일석이조 달성하기',
      targetRoute: '/events',
    },
    outroDialogue: [
      '태평마을 도전자단: "참으로 명국이었소! 다음에는 우리 고향 마을에서 뵙지요."',
      '청솔마을 큰 볏집 가마솥에서 축하 밥을 짓고, 상급 명패가 기원 홀에 걸립니다.',
    ],
  },
  {
    id: 'chapter_6',
    actNumber: 6,
    title: '제6막: 전설의 클럽 명인(名人)전',
    rankRequirement: '1급 고수 · 명인전 응시',
    minCp: 2000,
    introDialogue: [
      '수많은 날들의 아침 산책, 경쾌한 타구, 그리고 정갈한 차 한잔.',
      '이제 청솔마을의 최고위 어르신들이 모여 전설의 명인 심사를 엽니다.',
      '김 이장: "그대의 손끝엔 단순한 점수를 넘어 인생의 품격이 담겨 있네."',
    ],
    climaxTrial: {
      type: 'parkgolf',
      opponentName: '명인 총괄 심사',
      description: '챔피언십 3홀에서 홀컵 골인을 성공시키고 명인패 수여받기',
      targetRoute: '/clubs',
    },
    outroDialogue: [
      '축하합니다! 청솔마을의 참된 클럽 명인(名人)으로 등극하셨습니다!',
      '김 이장: "이제 새로 오실 분께 첫 수를 알려주시게."',
      '마을회관 게시판에 새 회원의 이름이 하나둘 붙습니다.',
    ],
  },
] as const;
