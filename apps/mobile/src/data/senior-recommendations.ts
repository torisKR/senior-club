export type MobileHikingCourse = {
  id: string;
  title: string;
  tagline: string;
  location: string;
  difficultyLabel: string;
  features: string[];
  duration: string;
  length: string;
  relatedInterestId: string;
  recommendedEventId?: string;
};

export type MobileHobbyRecommendation = {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  category: string;
  interestId: string;
  benefits: string[];
  actionText: string;
};

export const MOBILE_HIKING_COURSES: MobileHikingCourse[] = [
  {
    id: 'bukhansan-dullegil',
    title: '북한산 둘레길 (솔샘길·우이령길)',
    tagline: '완만한 흙길과 피톤치드 가득한 숲속 쉼터',
    location: '서울 강북·도봉·우이동',
    difficultyLabel: '완만한 평지·부드러운 흙길',
    features: ['무릎 관절에 무리 없는 완경사', '중간 쉼터·화장실 완비', '대중교통 접근 편리'],
    duration: '약 2시간 (쉬엄쉬엄 완보)',
    length: '약 3.5km',
    relatedInterestId: 'hiking',
    recommendedEventId: 'event-bukhansan-dullegil',
  },
  {
    id: 'namsan-nanum-trail',
    title: '남산 순환 나눔둘레길',
    tagline: '전 구간 무장애 데크로드와 시원한 서울 도심 전망',
    location: '서울 중구·용산구',
    difficultyLabel: '100% 무장애 데크 산책로',
    features: ['계단 없는 완만한 경사로', '울창한 단풍·소나무 숲길', '친환경 순환버스 인접'],
    duration: '약 1시간 30분',
    length: '약 3.1km',
    relatedInterestId: 'hiking',
  },
  {
    id: 'ansan-jarakgil',
    title: '서대문 안산 자락길',
    tagline: '메타세쿼이아 숲을 품은 전국 대표 순환형 무장애길',
    location: '서울 서대문구 봉원동',
    difficultyLabel: '경사도 9% 이하 휠체어·보행 친화',
    features: ['하늘 높이 솟은 메타세쿼이아 숲', '계단 없는 완만한 순환 슬로프', '숲속 북카페 및 전망 쉼터'],
    duration: '약 2시간 30분 (구간 선택 가능)',
    length: '순환 7km (추천 3km)',
    relatedInterestId: 'hiking',
  },
  {
    id: 'cheonggyesan-wonteorgol',
    title: '청계산 원터골 숲길',
    tagline: '청량한 계곡 물소리와 울창한 잣나무 피톤치드 산림욕',
    location: '서울 서초구 원지동',
    difficultyLabel: '완만한 숲길과 계곡길',
    features: ['원터골 약수터 쉼터', '시원한 계곡 물소리', '하산 후 정겨운 로컬 맛집'],
    duration: '약 2시간',
    length: '약 3.2km',
    relatedInterestId: 'hiking',
  },
  {
    id: 'gwanaksan-lake-deck',
    title: '관악산 호수공원 무장애길',
    tagline: '호수를 끼고 걷는 평탄하고 여유로운 자연 산책길',
    location: '서울 관악구 신림동',
    difficultyLabel: '완벽한 평지 수변 데크로드',
    features: ['관악산역 경전철 직결', '사계절 야생화와 벤치 쉼터', '호수 주변 힐링 포토존'],
    duration: '약 1시간 20분',
    length: '약 2.5km',
    relatedInterestId: 'hiking',
  },
];

export const MOBILE_HOBBY_RECOMMENDATIONS: MobileHobbyRecommendation[] = [
  {
    id: 'hobby-hiking',
    name: '완만한 등산 & 둘레길 걷기',
    emoji: '🥾',
    tagline: '심폐 기능 강화와 무릎 관절을 지키는 가장 건강한 습관',
    category: '건강 / 트레킹',
    interestId: 'hiking',
    benefits: ['자연 속 스트레스 해소', '하체 근력 및 골밀도 강화', '동년배와의 따뜻한 산행 대화'],
    actionText: '등산 모임 찾아보기',
  },
  {
    id: 'hobby-photo',
    name: '스마트폰 감성 사진 & 출사',
    emoji: '📷',
    tagline: '무거운 장비 없이, 내 폰으로 담아내는 계절 풍경과 인생샷',
    category: '문화 / 예술',
    interestId: 'photo',
    benefits: ['기초 스마트폰 촬영·구도 배우기', '계절 꽃과 풍경 명소 출사', '사진 나눔과 작품 이야기'],
    actionText: '사진 모임 찾아보기',
  },
  {
    id: 'hobby-earthing',
    name: '맨발 걷기 (어싱) & 황톳길',
    emoji: '👣',
    tagline: '자연의 흙을 직접 밟으며 누리는 천연 지압과 깊은 숙면',
    category: '힐링 / 웰빙',
    interestId: 'hiking',
    benefits: ['발바닥 말초신경 자극 및 혈액순환', '불면증 및 만성 피로 완화', '안전한 황톳길 코스 동행'],
    actionText: '둘레길 모임 보기',
  },
  {
    id: 'hobby-gardening',
    name: '베란다 텃밭 & 반려식물 가드닝',
    emoji: '🌿',
    tagline: '작은 화분에서 피어나는 초록 생명과 소소한 수확의 기쁨',
    category: '생활 / 원예',
    interestId: 'gardening',
    benefits: ['반려식물 물주기와 분갈이 기초', '공기정화 및 정서적 안정감', '꽃과 허브 나눔'],
    actionText: '원예 모임 찾아보기',
  },
  {
    id: 'hobby-classical',
    name: '해설이 있는 클래식·가곡 감상',
    emoji: '🎻',
    tagline: '음악 뒤에 숨겨진 이야기와 함께 듣는 편안한 클래식 선율',
    category: '교양 / 음악',
    interestId: 'classical',
    benefits: ['전문 해설로 듣는 친근한 명곡', '수준 높은 공연장 동행 나들이', '차 한 잔과 함께하는 음악 토크'],
    actionText: '음악 모임 찾아보기',
  },
  {
    id: 'hobby-history',
    name: '도보 궁궐 & 골목 역사 답사',
    emoji: '🏛️',
    tagline: '해설사와 함께 걷는 우리 역사와 정겨운 도심 옛 골목길',
    category: '역사 / 탐방',
    interestId: 'history',
    benefits: ['전문 해설과 함께하는 지적 즐거움', '도심 속 가벼운 유산소 걷기', '동네 숨은 노포 맛집 탐방'],
    actionText: '역사 모임 찾아보기',
  },
];
