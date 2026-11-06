import type { Route } from "next";
import type { InterestId } from "./types";

export type SeniorHikingCourse = {
  id: string;
  title: string;
  tagline: string;
  location: string;
  difficulty: "쉬움" | "보통";
  difficultyLabel: string;
  features: string[];
  recommendedFor: string;
  relatedInterestId: InterestId;
  duration: string;
  length: string;
  image: string;
  sourceUrl: string;
};

export type SeniorHobbyRecommendation = {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  category: string;
  interestId: InterestId;
  benefits: string[];
  actionText: string;
  targetUrl: Route;
};

export const SENIOR_HIKING_COURSES: SeniorHikingCourse[] = [
  {
    id: "bukhansan-dullegil",
    title: "북한산 둘레길 우이령길",
    tagline: "숲길을 따라 천천히 걷는 둘레길",
    location: "서울 강북·도봉·우이동",
    difficulty: "쉬움",
    difficultyLabel: "탐방 예약·개방 여부 확인",
    features: ["방문 전 국립공원 탐방 안내 확인", "구간과 휴식 지점을 미리 정하기", "개인 걸음에 맞춰 걷기"],
    recommendedFor: "숲길 산책을 계획하는 분",
    relatedInterestId: "hiking",
    duration: "구간·걸음에 따라 다름",
    length: "전체 6.8km · 구간 선택",
    image: "/images/club-senior-hero.jpg",
    sourceUrl: "https://www.korea.kr/news/policyNewsView.do?newsId=148701526",
  },
  {
    id: "namsan-nanum-trail",
    title: "남산 둘레길",
    tagline: "숲과 도심 전망을 함께 즐기는 둘레길",
    location: "서울 중구·용산구",
    difficulty: "쉬움",
    difficultyLabel: "구간별 경사·노면 확인",
    features: ["북측·산림·야생화원 등 구간 선택", "방문 전 공원 안내 확인", "계단과 경사가 있는 구간 살피기"],
    recommendedFor: "안전한 보행과 도심 전경을 함께 즐기고 싶은 시니어",
    relatedInterestId: "hiking",
    duration: "구간·걸음에 따라 다름",
    length: "전체 7.5km · 구간 선택",
    image: "/images/club-senior-hero.jpg",
    sourceUrl: "https://parks.seoul.go.kr/template/sub/namsan.do",
  },
  {
    id: "ansan-jarakgil",
    title: "서대문 안산 자락길",
    tagline: "메타세쿼이아 숲을 품은 전국 대표 순환형 무장애길",
    location: "서울 서대문구 봉원동",
    difficulty: "쉬움",
    difficultyLabel: "방문 전 무장애 구간 확인",
    features: ["하늘 높이 솟은 메타세쿼이아 숲", "계단 없는 완만한 순환 슬로프", "숲속 북카페 및 전망 쉼터"],
    recommendedFor: "자연 속에서 맑은 공기를 마시며 힐링하고 싶은 분",
    relatedInterestId: "hiking",
    duration: "구간·걸음에 따라 다름",
    length: "전체 약 7km · 구간 선택",
    image: "/images/club-senior-hero.jpg",
    sourceUrl: "https://www.sdm.go.kr/health/contents/healthinfo/walking.do",
  },
  {
    id: "cheonggyesan-wonteorgol",
    title: "청계산 원터골 숲길",
    tagline: "청량한 계곡 물소리와 울창한 잣나무 피톤치드 산림욕",
    location: "서울 서초구 원지동",
    difficulty: "보통",
    difficultyLabel: "완만한 숲길과 계곡길",
    features: ["원터골 약수터 쉼터", "시원한 계곡 물소리", "하산 후 정겨운 로컬 맛집"],
    recommendedFor: "피톤치드 숲속 맑은 공기와 가벼운 산행을 원하는 분",
    relatedInterestId: "hiking",
    duration: "구간·걸음에 따라 다름",
    length: "선택한 구간에 따라 다름",
    image: "/images/club-senior-hero.jpg",
    sourceUrl: "https://www.seocho.go.kr/",
  },
  {
    id: "gwanaksan-lake-deck",
    title: "관악산 무장애숲길",
    tagline: "관악산 입구에서 숲을 둘러보는 산책길",
    location: "서울 관악구 신림동",
    difficulty: "쉬움",
    difficultyLabel: "방문 전 노면·개방 여부 확인",
    features: ["관악산 입구 주변 숲길", "쉼터에서 쉬어 가기", "방문 전 구청 안내 확인"],
    recommendedFor: "무리 없이 가볍게 걸으며 친구와 이야기 나누기 좋은 코스",
    relatedInterestId: "hiking",
    duration: "구간·걸음에 따라 다름",
    length: "약 1.3km",
    image: "/images/club-senior-hero.jpg",
    sourceUrl: "https://gwanak.go.kr/site/gwanak/04/10405040100002016051206.jsp",
  },
];

export const SENIOR_HOBBY_RECOMMENDATIONS: SeniorHobbyRecommendation[] = [
  {
    id: "hobby-hiking",
    name: "완만한 등산 & 둘레길 걷기",
    emoji: "🥾",
    tagline: "계절 풍경을 함께 바라보며 나에게 맞는 걸음으로 걷기",
    category: "건강 / 트레킹",
    interestId: "hiking",
    benefits: ["자연 속 스트레스 해소", "내 걸음에 맞춰 걷는 활동", "동년배와의 따뜻한 산행 대화"],
    actionText: "등산 모임 찾아보기",
    targetUrl: "/events?category=hiking",
  },
  {
    id: "hobby-photo",
    name: "스마트폰 감성 사진 & 출사",
    emoji: "📷",
    tagline: "무거운 장비 없이, 내 폰으로 담아내는 계절 풍경과 인생샷",
    category: "문화 / 예술",
    interestId: "photo",
    benefits: ["기초 스마트폰 촬영·구도 배우기", "계절 꽃과 풍경 명소 출사", "사진 나눔과 작품 이야기"],
    actionText: "사진 모임 찾아보기",
    targetUrl: "/events?category=photo",
  },
  {
    id: "hobby-earthing",
    name: "맨발 걷기 (어싱) & 황톳길",
    emoji: "👣",
    tagline: "흙길의 촉감을 느끼며 천천히 걷는 야외 활동",
    category: "힐링 / 웰빙",
    interestId: "hiking",
    benefits: ["흙길의 촉감과 풍경 즐기기", "내 걸음에 맞는 구간 선택", "노면과 세족 시설을 확인하고 동행"],
    actionText: "둘레길 모임 보기",
    targetUrl: "/events?category=hiking",
  },
  {
    id: "hobby-gardening",
    name: "베란다 텃밭 & 반려식물 가드닝",
    emoji: "🌿",
    tagline: "작은 화분에서 피어나는 초록 생명과 소소한 수확의 기쁨",
    category: "생활 / 원예",
    interestId: "gardening",
    benefits: ["반려식물 물주기와 분갈이 기초", "식물의 성장과 계절 변화 관찰", "꽃과 허브 나눔"],
    actionText: "원예 모임 찾아보기",
    targetUrl: "/events?category=gardening",
  },
  {
    id: "hobby-classical",
    name: "해설이 있는 클래식·가곡 감상",
    emoji: "🎻",
    tagline: "음악 뒤에 숨겨진 이야기와 함께 듣는 편안한 클래식 선율",
    category: "교양 / 음악",
    interestId: "classical",
    benefits: ["명곡의 배경 이야기 나누기", "좋아하는 음악 함께 듣기", "차 한 잔과 함께하는 음악 토크"],
    actionText: "음악 모임 찾아보기",
    targetUrl: "/events?category=classical",
  },
  {
    id: "hobby-history",
    name: "도보 궁궐 & 골목 역사 답사",
    emoji: "🏛️",
    tagline: "우리 역사와 정겨운 도심 옛 골목길을 함께 살펴보기",
    category: "역사 / 탐방",
    interestId: "history",
    benefits: ["지역의 역사 이야기 나누기", "도심 속 가벼운 유산소 걷기", "동네 숨은 노포 맛집 탐방"],
    actionText: "역사 모임 찾아보기",
    targetUrl: "/events?category=history",
  },
];
