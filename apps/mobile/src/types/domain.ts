export type EntityId = string;

export type UserRole = 'member' | 'leader' | 'admin';
export type ParticipationStatus = 'pending' | 'approved' | 'attended' | 'reviewed';
export type EventLifecycle = 'upcoming' | 'full' | 'completed' | 'cancelled';
export type EventDifficulty = 'easy' | 'moderate' | 'challenging';
export type EventListView = 'upcoming' | 'past';
export type NotificationKind =
  | 'event'
  | 'comment'
  | 'reply'
  | 'approval'
  | 'schedule'
  | 'review';

export interface AuthSession {
  userId: EntityId;
  email: string;
  phoneNumber?: string | null;
  displayName: string;
  role: UserRole;
  sessionId: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  onboardingCompletedAt: string | null;
  signedInAt: string;
}

export interface EmailCodeRequestInput {
  email: string;
}

export interface EmailCodeChallenge {
  challengeId: string;
  expiresAt: string;
  retryAfterSeconds: number;
  devCode?: string;
}

export interface EmailCodeVerificationInput {
  challengeId: string;
  email: string;
  displayName: string;
  code: string;
  termsAccepted: true;
  privacyAccepted: true;
}

export interface PhoneCodeRequestInput {
  phoneNumber: string;
}

export interface PhoneCodeChallenge {
  challengeId: string;
  phoneNumber: string;
  expiresAt: string;
  retryAfterSeconds: number;
  devCode?: string;
}

export interface PhoneCodeVerificationInput {
  challengeId: string;
  phoneNumber: string;
  displayName: string;
  code: string;
  termsAccepted: true;
  privacyAccepted: true;
}

export interface KakaoLoginInput {
  termsAccepted: true;
  privacyAccepted: true;
}

export interface IssuedSession {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  sessionId: string;
  user: {
    id: string;
    email: string | null;
    phoneNumber?: string | null;
    name: string;
    role: 'MEMBER' | 'LEADER' | 'ADMIN';
    onboardingCompletedAt: string | null;
  };
}

export interface Interest {
  id: EntityId;
  name: string;
  emoji: string;
  description: string;
}

export interface User {
  id: EntityId;
  name: string;
  email: string;
  phoneNumber?: string | null;
  /** Exact server-backed birth year. Undefined until onboarding is completed. */
  birthYear?: number;
  ageGroup: string;
  region: string;
  profileImageUri?: string;
  role: UserRole;
  interestIds: EntityId[];
  joinedClubIds: EntityId[];
}

export interface Club {
  id: EntityId;
  interestId: EntityId;
  title: string;
  category: string;
  description: string;
  region: string;
  leaderName: string;
  memberCount: number;
  imageUri?: string;
  tags: string[];
  nextEventId?: EntityId;
}

export interface EventLeader {
  id: EntityId;
  name: string;
  introduction: string;
}

export interface Event {
  id: EntityId;
  clubId: EntityId;
  clubTitle: string;
  interestId?: EntityId;
  clubRegion?: string;
  title: string;
  summary: string;
  description: string;
  location: string;
  address: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  participantCount: number;
  price: number;
  difficulty: EventDifficulty;
  lifecycle: EventLifecycle;
  preparation: string[];
  leader: EventLeader;
  imageUri?: string;
}

export interface EventParticipation {
  id: EntityId;
  eventId: EntityId;
  userId: EntityId;
  status: ParticipationStatus;
  appliedAt: string;
  updatedAt: string;
}

export interface ChatRoom {
  id: EntityId;
  eventId: EntityId;
  title: string;
  participantCount: number;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface ChatMessage {
  id: EntityId;
  roomId: EntityId;
  userId: EntityId;
  userName: string;
  message: string;
  createdAt: string;
  isNotice?: boolean;
  isMine?: boolean;
}

export interface Review {
  id: EntityId;
  eventId: EntityId;
  rating: 1 | 2 | 3 | 4 | 5;
  content: string;
  author: {
    id: EntityId;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: EntityId;
  userId: EntityId;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  targetPath?: string;
}
