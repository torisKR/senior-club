import type {
  AuthSession,
  EventParticipation,
  ParticipationStatus,
  PersistedAppState,
  User,
  UserRole,
} from '@/types';

const USER_ROLES = new Set<UserRole>(['member', 'leader', 'admin']);
const PARTICIPATION_STATUSES = new Set<ParticipationStatus>([
  'pending',
  'approved',
  'attended',
  'reviewed',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function entityIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(value.filter((item): item is string => isNonEmptyString(item))),
  );
}

function isAuthSession(value: unknown): value is AuthSession {
  if (!isRecord(value)) return false;

  return (
    isNonEmptyString(value.userId) &&
    typeof value.email === 'string' &&
    (value.phoneNumber === undefined || value.phoneNumber === null || typeof value.phoneNumber === 'string') &&
    isNonEmptyString(value.displayName) &&
    typeof value.role === 'string' &&
    USER_ROLES.has(value.role as UserRole) &&
    isNonEmptyString(value.sessionId) &&
    isNonEmptyString(value.accessTokenExpiresAt) &&
    isNonEmptyString(value.refreshTokenExpiresAt) &&
    (value.onboardingCompletedAt === null ||
      isNonEmptyString(value.onboardingCompletedAt)) &&
    isNonEmptyString(value.signedInAt)
  );
}

function isCachedUser(value: unknown): value is User {
  if (!isRecord(value)) return false;

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    typeof value.email === 'string' &&
    (value.phoneNumber === undefined || value.phoneNumber === null || typeof value.phoneNumber === 'string') &&
    typeof value.ageGroup === 'string' &&
    typeof value.region === 'string' &&
    typeof value.role === 'string' &&
    USER_ROLES.has(value.role as UserRole) &&
    Array.isArray(value.interestIds) &&
    Array.isArray(value.joinedClubIds) &&
    (value.birthYear === undefined ||
      (typeof value.birthYear === 'number' && Number.isInteger(value.birthYear))) &&
    (value.profileImageUri === undefined || typeof value.profileImageUri === 'string')
  );
}

function participation(value: unknown): EventParticipation | null {
  if (!isRecord(value)) return null;
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.eventId) ||
    !isNonEmptyString(value.userId) ||
    typeof value.status !== 'string' ||
    !PARTICIPATION_STATUSES.has(value.status as ParticipationStatus) ||
    !isNonEmptyString(value.appliedAt) ||
    !isNonEmptyString(value.updatedAt)
  ) {
    return null;
  }
  const status = value.status as ParticipationStatus;

  return {
    id: value.id,
    eventId: value.eventId,
    userId: value.userId,
    status: status === 'reviewed' ? 'attended' : status,
    appliedAt: value.appliedAt,
    updatedAt: value.updatedAt,
  };
}

function participationsForUser(value: unknown, userId: string): EventParticipation[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(participation)
    .filter(
      (item): item is EventParticipation => item !== null && item.userId === userId,
    );
}

export function createAnonymousUser(): User {
  return {
    id: 'anonymous',
    name: '방문자',
    email: '',
    phoneNumber: null,
    ageGroup: '미설정',
    region: '',
    role: 'member',
    interestIds: [],
    joinedClubIds: [],
  };
}

function userForSession(session: AuthSession): User {
  return {
    id: session.userId,
    email: session.email,
    phoneNumber: session.phoneNumber ?? null,
    name: session.displayName,
    role: session.role,
    ageGroup: '미설정',
    region: '',
    interestIds: [],
    joinedClubIds: [],
  };
}

export function createDefaultAppState(): PersistedAppState {
  return {
    session: null,
    user: createAnonymousUser(),
    onboardingCompleted: false,
    largeTextEnabled: false,
    selectedInterestIds: [],
    participations: [],
  };
}

/**
 * Treats the authenticated session as the owner of all persisted member data.
 * Anonymous state never exposes a previously signed-in member, and a different
 * account never inherits another account's offline profile or participation cache.
 */
export function normalizePersistedAppState(value: unknown): PersistedAppState {
  if (!isRecord(value)) return createDefaultAppState();

  const largeTextEnabled = value.largeTextEnabled === true;
  const session = isAuthSession(value.session) ? value.session : null;

  if (!session) {
    return {
      ...createDefaultAppState(),
      largeTextEnabled,
    };
  }

  const cachedUser = isCachedUser(value.user) ? value.user : null;
  const cacheBelongsToSession = cachedUser?.id === session.userId;
  const selectedInterestIds = cacheBelongsToSession
    ? entityIds(value.selectedInterestIds ?? cachedUser.interestIds)
    : [];
  const sessionUser = userForSession(session);
  const user: User = cacheBelongsToSession
    ? {
        ...cachedUser,
        id: session.userId,
        email: session.email,
        phoneNumber: session.phoneNumber ?? null,
        name: session.displayName,
        role: session.role,
        interestIds: selectedInterestIds,
        joinedClubIds: entityIds(cachedUser.joinedClubIds),
      }
    : sessionUser;

  return {
    session: { ...session },
    user,
    onboardingCompleted:
      session.onboardingCompletedAt !== null ||
      (cacheBelongsToSession && value.onboardingCompleted === true),
    largeTextEnabled,
    selectedInterestIds,
    participations: cacheBelongsToSession
      ? participationsForUser(value.participations, session.userId)
      : [],
  };
}
