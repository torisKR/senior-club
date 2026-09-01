import type {
  AuthSession,
  Club,
  EmailCodeChallenge,
  EmailCodeRequestInput,
  EmailCodeVerificationInput,
  EntityId,
  Event,
  EventListView,
  EventParticipation,
  Interest,
  KakaoLoginInput,
  ParticipationStatus,
  PhoneCodeChallenge,
  PhoneCodeRequestInput,
  PhoneCodeVerificationInput,
  User,
} from '@/types/domain';
import type { AccountDeletionRequest } from '@/api/account-api';
import type { UpdateProfileInput } from '@/api/profile-api-core';

export interface PersistedAppState {
  session: AuthSession | null;
  user: User;
  onboardingCompleted: boolean;
  largeTextEnabled: boolean;
  selectedInterestIds: EntityId[];
  participations: EventParticipation[];
}

export interface EventFeedState {
  events: Event[];
  loaded: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  errorMode: 'replace' | 'append' | null;
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface AppStateContextValue extends PersistedAppState {
  isHydrated: boolean;
  isAuthenticated: boolean;
  authRestoreError: string | null;
  eventsLoading: boolean;
  eventsError: string | null;
  interestsLoading: boolean;
  interestsError: string | null;
  /** Stable screen-facing aliases. */
  state: PersistedAppState;
  profile: User;
  events: Event[];
  upcomingEvents: Event[];
  pastEvents: Event[];
  eventFeeds: Record<EventListView, EventFeedState>;
  clubs: Club[];
  interests: Interest[];
  setProfile: (updates: Partial<User>) => void;
  requestEmailCode: (input: EmailCodeRequestInput) => Promise<EmailCodeChallenge>;
  requestPhoneCode: (input: PhoneCodeRequestInput) => Promise<PhoneCodeChallenge>;
  signIn: (input: EmailCodeVerificationInput) => Promise<AuthSession>;
  signInWithPhone: (input: PhoneCodeVerificationInput) => Promise<AuthSession>;
  signInWithKakao: (input: KakaoLoginInput) => Promise<AuthSession>;
  signOut: () => Promise<void>;
  deleteAccount: (reason?: string) => Promise<AccountDeletionRequest>;
  applyEvent: (eventId: EntityId) => Promise<ParticipationStatus>;
  cancelEvent: (eventId: EntityId) => Promise<void>;
  markAttended: (eventId: EntityId) => void;
  setLargeText: (enabled: boolean) => void;
  resetSession: () => Promise<void>;
  setLargeTextEnabled: (enabled: boolean) => void;
  toggleLargeText: () => void;
  setInterestSelected: (interestId: EntityId, selected: boolean) => void;
  toggleInterest: (interestId: EntityId) => void;
  replaceInterests: (interestIds: EntityId[]) => void;
  completeOnboarding: (profile: UpdateProfileInput) => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  applyToEvent: (eventId: EntityId) => Promise<ParticipationStatus>;
  refreshEventParticipation: (
    eventId: EntityId,
    signal?: AbortSignal,
  ) => Promise<ParticipationStatus | undefined>;
  setParticipationStatus: (eventId: EntityId, status: ParticipationStatus) => void;
  getParticipationStatus: (eventId: EntityId) => ParticipationStatus | undefined;
  resetDemo: () => void;
  ensureEventView: (view: EventListView) => Promise<void>;
  reloadEventView: (view: EventListView) => Promise<void>;
  loadMoreEventView: (view: EventListView) => Promise<void>;
  reloadEvents: () => Promise<void>;
  reloadInterests: () => Promise<void>;
}
