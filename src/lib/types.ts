export type UserRole = "member" | "leader" | "admin";

export type InterestId =
  | "hiking"
  | "photo"
  | "history"
  | "classical"
  | "gardening"
  | "rail-travel"
  | "food"
  | "volunteer"
  | "english"
  | "reading";

export interface Interest {
  id: InterestId;
  label: string;
  emoji: string;
  description: string;
}

/**
 * The fields persisted by onboarding are intentionally required. The optional
 * fields let the same shape grow into an authenticated user without a data
 * migration for the MVP local-storage prototype.
 */
export interface UserProfile {
  name: string;
  region: string;
  ageGroup: string;
  interests: string[];
  onboardedAt: string;
  id?: string;
  district?: string;
  avatar?: string;
  role?: UserRole;
  appliedEventIds?: string[];
  participationHistory?: ParticipationRecord[];
}

export type ParticipationStatus =
  | "approved"
  | "attended"
  | "no-show"
  | "cancelled";

export interface ParticipationRecord {
  eventId: string;
  clubId: string;
  category: InterestId;
  status: ParticipationStatus;
  attendedAt?: string;
  rating?: number;
}

export interface Club {
  id: string;
  slug: string;
  title: string;
  category: InterestId;
  description: string;
  memberCount: number;
  eventCount: number;
  image?: string;
  leaderName: string;
  tags: string[];
}

export type EventDifficulty = "쉬움" | "보통" | "도전";
export type EventStatus =
  | "recruiting"
  | "closed"
  | "completed"
  | "cancelled";

export interface Event {
  id: string;
  clubId: string;
  clubSlug: string;
  clubTitle?: string;
  title: string;
  description: string;
  category: InterestId;
  relatedInterests: InterestId[];
  location: string;
  address: string;
  region: string;
  district: string;
  /** Preformatted Korean date for low-complexity server-rendered cards. */
  date: string;
  startAt: string;
  endAt?: string;
  registrationDeadline?: string;
  capacity: number;
  participantCount: number;
  /** Compatibility alias used by early UI cards. */
  currentMembers: number;
  price: number;
  difficulty: EventDifficulty;
  preparations: string[];
  image?: string;
  mapUrl?: string;
  leaderName: string;
  status: EventStatus;
}

export interface RecommendationBreakdown {
  /** Direct category and adjacent-interest match, maximum 50. */
  interest: number;
  /** Same district or broader city/province match, maximum 30. */
  region: number;
  /** Previous attendance in the club/category, maximum 20. */
  history: number;
}

export interface RecommendationScore {
  score: number;
  breakdown: RecommendationBreakdown;
  reasons: string[];
}

export interface EventRecommendation extends RecommendationScore {
  event: Event;
}

export interface RecommendationOptions {
  limit?: number;
  includeUnavailable?: boolean;
  excludeApplied?: boolean;
}

export type EventApplicationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "attended"
  | "no-show";

export type ApplicationActor = "member" | "leader" | "admin";

export interface EventApplication {
  id: string;
  eventId: string;
  userId: string;
  status: EventApplicationStatus;
  appliedAt: string;
  updatedAt: string;
  approvedAt?: string;
  cancelledAt?: string;
  attendedAt?: string;
  rejectedReason?: string;
}

export interface ApplicationTransitionContext {
  actor: ApplicationActor;
  now?: string;
  reason?: string;
}

export interface HomeStats {
  upcomingEventCount: number;
  unreadMessageCount: number;
  joinedClubCount: number;
}

export interface HomeData {
  user: UserProfile;
  stats: HomeStats;
  recommendedEvents: EventRecommendation[];
  popularClubs: Club[];
  todaySchedule: Event[];
}
