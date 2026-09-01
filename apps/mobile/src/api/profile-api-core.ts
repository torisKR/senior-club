import type { Interest, User, UserRole } from '../types/domain';

export interface ApiInterest {
  id: string;
  slug: string;
  name: string;
  icon: string;
  sortOrder?: number;
}

export interface ApiProfile {
  id: string;
  email: string;
  phoneNumber?: string | null;
  name: string;
  birthYear: number | null;
  region: string | null;
  gender: string | null;
  avatarUrl: string | null;
  bio: string | null;
  role: 'MEMBER' | 'LEADER' | 'ADMIN';
  onboardingCompletedAt: string | null;
  interests: ApiInterest[];
}

export interface InterestListResponse {
  data: ApiInterest[];
}

export interface UpdateProfileInput {
  name: string;
  region: string;
  birthYear: number;
  interestSlugs: string[];
}

export interface ProfileStateSnapshot {
  user: User;
  selectedInterestIds: string[];
  onboardingCompleted: boolean;
  onboardingCompletedAt: string | null;
}

const INTEREST_EMOJI: Readonly<Record<string, string>> = Object.freeze({
  mountain: '🥾',
  camera: '📷',
  landmark: '🏛️',
  music: '🎻',
  sprout: '🌿',
  train: '🚆',
  utensils: '🍲',
  'heart-handshake': '🤝',
  languages: '💬',
  'book-open': '📚',
});

const INTEREST_DESCRIPTION: Readonly<Record<string, string>> = Object.freeze({
  hiking: '가까운 산과 둘레길을 함께 걸어요.',
  photo: '사진을 배우고 출사도 함께 떠나요.',
  history: '유적지와 박물관에서 이야기를 나눠요.',
  classical: '편안한 해설과 함께 공연을 즐겨요.',
  gardening: '식물을 돌보며 마음도 가꿔요.',
  'rail-travel': '기차로 천천히 전국을 여행해요.',
  food: '동네의 좋은 식당을 함께 찾아요.',
  volunteer: '경험과 시간을 이웃과 나눠요.',
  english: '부담 없이 생활 영어를 연습해요.',
  reading: '한 달 한 권, 깊은 대화를 나눠요.',
});

function toUserRole(role: ApiProfile['role']): UserRole {
  if (role === 'LEADER') return 'leader';
  if (role === 'ADMIN') return 'admin';
  return 'member';
}

export function ageGroupFromBirthYear(birthYear: number, currentYear = new Date().getUTCFullYear()) {
  const age = Math.max(0, currentYear - birthYear);
  const decade = Math.floor(age / 10) * 10;
  return decade >= 80 ? '80대 이상' : `${decade}대`;
}

export function toInterest(interest: ApiInterest): Interest {
  return {
    // Slugs are the stable public identifiers used by recommendations and profile updates.
    id: interest.slug,
    name: interest.name,
    emoji: INTEREST_EMOJI[interest.icon] ?? '⭐',
    description:
      INTEREST_DESCRIPTION[interest.slug] ?? `${interest.name} 관련 모임을 함께 즐겨요.`,
  };
}

export function toProfileState(profile: ApiProfile): ProfileStateSnapshot {
  const selectedInterestIds = Array.from(
    new Set(profile.interests.map((interest) => interest.slug)),
  );

  return {
    user: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      phoneNumber: profile.phoneNumber,
      ...(profile.birthYear === null ? {} : { birthYear: profile.birthYear }),
      ageGroup:
        profile.birthYear === null ? '미설정' : ageGroupFromBirthYear(profile.birthYear),
      region: profile.region ?? '',
      ...(profile.avatarUrl ? { profileImageUri: profile.avatarUrl } : {}),
      role: toUserRole(profile.role),
      interestIds: selectedInterestIds,
      joinedClubIds: [],
    },
    selectedInterestIds,
    onboardingCompleted: profile.onboardingCompletedAt !== null,
    onboardingCompletedAt: profile.onboardingCompletedAt,
  };
}
