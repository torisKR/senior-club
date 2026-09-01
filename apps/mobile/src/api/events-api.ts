import { getAuthenticatedHttpClient } from '@/auth/auth-session-manager';
import { getMobileEnvironment } from '@/config/env';
import { ApiError } from '@/api/api-error';
import { createHttpClient } from '@/api/http-client';
import type {
  Event,
  EventListView,
  EventParticipation,
  ParticipationStatus,
} from '@/types';

type ApiEventStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'COMPLETED' | 'CANCELED';
type ApiApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
type ApiAttendanceStatus = 'NOT_CHECKED' | 'ATTENDED' | 'NO_SHOW';

export interface ApiEvent {
  id: string;
  title: string;
  description: string;
  coverImageUrl: string | null;
  locationName: string;
  address: string;
  mapUrl: string | null;
  startAt: string;
  endAt: string | null;
  registrationDeadline: string | null;
  capacity: number;
  participantCount: number;
  remainingCapacity: number;
  price: number;
  currency: string;
  difficulty: 'EASY' | 'MODERATE' | 'HARD';
  supplies: string | null;
  approvalMode: 'AUTO' | 'MANUAL';
  status: ApiEventStatus;
  club: {
    id: string;
    slug: string;
    title: string;
    region: string | null;
    interest: { slug: string; name: string; icon: string };
    leaderName: string;
  };
}

export interface ApiApplication {
  id: string;
  eventId: string;
  userId: string;
  status: ApiApplicationStatus;
  attendance: ApiAttendanceStatus;
  appliedAt: string;
  decidedAt: string | null;
  canceledAt: string | null;
  updatedAt: string;
}

interface EventListResponse {
  data: ApiEvent[];
  page: { nextCursor: string | null; hasNextPage: boolean };
}

export interface EventListRequest {
  view: EventListView;
  cursor?: string;
  signal?: AbortSignal;
}

export interface EventListPage {
  data: Event[];
  page: { nextCursor: string | null; hasNextPage: boolean };
}

let publicClient: ReturnType<typeof createHttpClient> | null = null;
let publicClientUrl: string | null = null;
const SAFE_EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
const SAFE_EVENT_CURSOR = /^[A-Za-z0-9_-]{8,500}$/;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EVENT_KEYS = [
  'id',
  'title',
  'description',
  'coverImageUrl',
  'locationName',
  'address',
  'mapUrl',
  'startAt',
  'endAt',
  'registrationDeadline',
  'capacity',
  'participantCount',
  'remainingCapacity',
  'price',
  'currency',
  'difficulty',
  'supplies',
  'approvalMode',
  'status',
  'club',
] as const;
const CLUB_KEYS = ['id', 'slug', 'title', 'region', 'interest', 'leaderName'] as const;
const INTEREST_KEYS = ['slug', 'name', 'icon'] as const;
const APPLICATION_KEYS = [
  'id',
  'eventId',
  'userId',
  'status',
  'attendance',
  'appliedAt',
  'decidedAt',
  'canceledAt',
  'updatedAt',
] as const;
const MY_APPLICATION_EVENT_KEYS = ['id', 'title', 'startAt', 'locationName', 'club'] as const;
const MY_APPLICATION_CLUB_KEYS = ['slug', 'title'] as const;
const PUBLIC_EVENT_STATUSES = new Set<ApiEventStatus>([
  'PUBLISHED',
  'CLOSED',
  'COMPLETED',
  'CANCELED',
]);
const APPLICATION_STATUSES = new Set<ApiApplicationStatus>([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELED',
]);
const ATTENDANCE_STATUSES = new Set<ApiAttendanceStatus>([
  'NOT_CHECKED',
  'ATTENDED',
  'NO_SHOW',
]);
export const EVENT_LIST_PAGE_SIZE = 20;

function invalidResponse(path: string, reason: string): never {
  throw new ApiError({
    status: 0,
    code: 'INVALID_RESPONSE',
    message: `서버의 모임 응답이 올바르지 않습니다. (${path}: ${reason})`,
  });
}

function strictRecord(
  value: unknown,
  expectedKeys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalidResponse(path, '객체가 아닙니다');
  }
  const record = value as Record<string, unknown>;
  const unexpected = Object.keys(record).find((key) => !expectedKeys.includes(key));
  if (unexpected) return invalidResponse(path, `알 수 없는 ${unexpected} 필드`);
  const missing = expectedKeys.find((key) => !Object.hasOwn(record, key));
  if (missing) return invalidResponse(path, `${missing} 필드 누락`);
  return record;
}

function requiredString(value: unknown, path: string, maximum = 5_000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    return invalidResponse(path, '문자열 형식 오류');
  }
  return value;
}

function entityId(value: unknown, path: string) {
  return typeof value === 'string' && SAFE_EVENT_ID.test(value)
    ? value
    : invalidResponse(path, '식별자 형식 오류');
}

function isoDate(value: unknown, path: string) {
  if (typeof value !== 'string') return invalidResponse(path, '날짜 형식 오류');
  try {
    return new Date(value).toISOString() === value
      ? value
      : invalidResponse(path, 'UTC ISO 날짜 형식 오류');
  } catch {
    return invalidResponse(path, '날짜 형식 오류');
  }
}

function nullableIsoDate(value: unknown, path: string) {
  return value === null ? null : isoDate(value, path);
}

function integer(value: unknown, path: string, minimum = 0) {
  return Number.isSafeInteger(value) && Number(value) >= minimum
    ? Number(value)
    : invalidResponse(path, `${minimum} 이상의 정수가 아닙니다`);
}

function nullableString(value: unknown, path: string, maximum = 2_048) {
  if (value === null) return null;
  return requiredString(value, path, maximum);
}

function safeUrl(value: unknown, path: string, allowLocal = false) {
  if (value === null) return null;
  const url = requiredString(value, path, 2_048);
  if (allowLocal && url.startsWith('/') && !url.startsWith('//') && !url.includes('\\')) {
    try {
      const safe = !url.split('/').some((segment) => {
        const decoded = decodeURIComponent(segment);
        return decoded === '.' || decoded === '..' || /[\u0000-\u001f\u007f]/.test(decoded);
      });
      return safe ? url : invalidResponse(path, '안전하지 않은 로컬 URL');
    } catch {
      return invalidResponse(path, 'URL 인코딩 오류');
    }
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
      ? url
      : invalidResponse(path, 'HTTPS URL 형식 오류');
  } catch {
    return invalidResponse(path, 'URL 형식 오류');
  }
}

export function parseApiEvent(
  value: unknown,
  path = 'event',
  expectedEventId?: string,
): ApiEvent {
  const event = strictRecord(value, EVENT_KEYS, path);
  const id = entityId(event.id, `${path}.id`);
  if (expectedEventId !== undefined && id !== expectedEventId) {
    return invalidResponse(`${path}.id`, '요청한 모임과 일치하지 않습니다');
  }
  const startAt = isoDate(event.startAt, `${path}.startAt`);
  const endAt = nullableIsoDate(event.endAt, `${path}.endAt`);
  const registrationDeadline = nullableIsoDate(
    event.registrationDeadline,
    `${path}.registrationDeadline`,
  );
  if (endAt !== null && Date.parse(endAt) <= Date.parse(startAt)) {
    return invalidResponse(`${path}.endAt`, '시작 이후여야 합니다');
  }
  if (registrationDeadline !== null && Date.parse(registrationDeadline) > Date.parse(startAt)) {
    return invalidResponse(`${path}.registrationDeadline`, '시작보다 늦을 수 없습니다');
  }

  const capacity = integer(event.capacity, `${path}.capacity`, 1);
  const participantCount = integer(event.participantCount, `${path}.participantCount`);
  const remainingCapacity = integer(event.remainingCapacity, `${path}.remainingCapacity`);
  if (
    participantCount > capacity ||
    remainingCapacity !== Math.max(capacity - participantCount, 0)
  ) {
    return invalidResponse(path, '정원과 참여 인원이 일치하지 않습니다');
  }

  const difficulty = event.difficulty;
  if (difficulty !== 'EASY' && difficulty !== 'MODERATE' && difficulty !== 'HARD') {
    return invalidResponse(`${path}.difficulty`, '난이도 형식 오류');
  }
  const approvalMode = event.approvalMode;
  if (approvalMode !== 'AUTO' && approvalMode !== 'MANUAL') {
    return invalidResponse(`${path}.approvalMode`, '승인 방식 오류');
  }
  const status = event.status;
  if (typeof status !== 'string' || !PUBLIC_EVENT_STATUSES.has(status as ApiEventStatus)) {
    return invalidResponse(`${path}.status`, '공개 상태 형식 오류');
  }
  if (event.currency !== 'KRW') {
    return invalidResponse(`${path}.currency`, '통화 형식 오류');
  }

  const club = strictRecord(event.club, CLUB_KEYS, `${path}.club`);
  const clubSlug = requiredString(club.slug, `${path}.club.slug`, 100);
  if (!SAFE_SLUG.test(clubSlug)) {
    return invalidResponse(`${path}.club.slug`, 'slug 형식 오류');
  }
  const interest = strictRecord(club.interest, INTEREST_KEYS, `${path}.club.interest`);
  const interestSlug = requiredString(interest.slug, `${path}.club.interest.slug`, 100);
  if (!SAFE_SLUG.test(interestSlug)) {
    return invalidResponse(`${path}.club.interest.slug`, 'slug 형식 오류');
  }

  return {
    id,
    title: requiredString(event.title, `${path}.title`, 120),
    description: requiredString(event.description, `${path}.description`),
    coverImageUrl: safeUrl(event.coverImageUrl, `${path}.coverImageUrl`, true),
    locationName: requiredString(event.locationName, `${path}.locationName`, 200),
    address: requiredString(event.address, `${path}.address`, 300),
    mapUrl: safeUrl(event.mapUrl, `${path}.mapUrl`),
    startAt,
    endAt,
    registrationDeadline,
    capacity,
    participantCount,
    remainingCapacity,
    price: integer(event.price, `${path}.price`),
    currency: 'KRW',
    difficulty,
    supplies: nullableString(event.supplies, `${path}.supplies`, 1_000),
    approvalMode,
    status: status as ApiEventStatus,
    club: {
      id: entityId(club.id, `${path}.club.id`),
      slug: clubSlug,
      title: requiredString(club.title, `${path}.club.title`, 200),
      region: nullableString(club.region, `${path}.club.region`, 80),
      interest: {
        slug: interestSlug,
        name: requiredString(interest.name, `${path}.club.interest.name`, 100),
        icon: requiredString(interest.icon, `${path}.club.interest.icon`, 100),
      },
      leaderName: requiredString(club.leaderName, `${path}.club.leaderName`, 100),
    },
  };
}

function parseEventListResponse(value: unknown): EventListResponse {
  const response = strictRecord(value, ['data', 'page'], 'response');
  if (!Array.isArray(response.data) || response.data.length > EVENT_LIST_PAGE_SIZE) {
    return invalidResponse('response.data', '목록 형식 또는 길이 오류');
  }
  const data = response.data.map((event, index) =>
    parseApiEvent(event, `response.data[${index}]`),
  );
  if (new Set(data.map(({ id }) => id)).size !== data.length) {
    return invalidResponse('response.data', '중복된 모임 식별자');
  }
  const page = strictRecord(response.page, ['nextCursor', 'hasNextPage'], 'response.page');
  if (typeof page.hasNextPage !== 'boolean') {
    return invalidResponse('response.page.hasNextPage', 'boolean 형식 오류');
  }
  const nextCursor = page.nextCursor;
  if (!(nextCursor === null || (typeof nextCursor === 'string' && SAFE_EVENT_CURSOR.test(nextCursor)))) {
    return invalidResponse('response.page.nextCursor', 'cursor 형식 오류');
  }
  if (page.hasNextPage !== (nextCursor !== null)) {
    return invalidResponse('response.page', '페이지 상태와 cursor가 일치하지 않습니다');
  }
  if (page.hasNextPage && data.length !== EVENT_LIST_PAGE_SIZE) {
    return invalidResponse('response.data', '다음 페이지가 있는 목록 길이가 올바르지 않습니다');
  }
  return { data, page: { nextCursor, hasNextPage: page.hasNextPage } };
}

export function parseApiApplication(
  value: unknown,
  path = 'application',
  expectedEventId?: string,
): ApiApplication {
  const application = strictRecord(value, APPLICATION_KEYS, path);
  const eventId = entityId(application.eventId, `${path}.eventId`);
  if (expectedEventId !== undefined && eventId !== expectedEventId) {
    return invalidResponse(`${path}.eventId`, '요청한 모임과 일치하지 않습니다');
  }
  const status = application.status;
  const attendance = application.attendance;
  if (typeof status !== 'string' || !APPLICATION_STATUSES.has(status as ApiApplicationStatus)) {
    return invalidResponse(`${path}.status`, '신청 상태 형식 오류');
  }
  if (typeof attendance !== 'string' || !ATTENDANCE_STATUSES.has(attendance as ApiAttendanceStatus)) {
    return invalidResponse(`${path}.attendance`, '출석 상태 형식 오류');
  }
  return {
    id: entityId(application.id, `${path}.id`),
    eventId,
    userId: entityId(application.userId, `${path}.userId`),
    status: status as ApiApplicationStatus,
    attendance: attendance as ApiAttendanceStatus,
    appliedAt: isoDate(application.appliedAt, `${path}.appliedAt`),
    decidedAt: nullableIsoDate(application.decidedAt, `${path}.decidedAt`),
    canceledAt: nullableIsoDate(application.canceledAt, `${path}.canceledAt`),
    updatedAt: isoDate(application.updatedAt, `${path}.updatedAt`),
  };
}

function parseMyApplicationRow(value: unknown, path: string): ApiApplication {
  const row = strictRecord(value, [...APPLICATION_KEYS, 'event'], path);
  const applicationInput = Object.fromEntries(
    APPLICATION_KEYS.map((key) => [key, row[key]]),
  );
  const application = parseApiApplication(applicationInput, path);
  const event = strictRecord(row.event, MY_APPLICATION_EVENT_KEYS, `${path}.event`);
  if (entityId(event.id, `${path}.event.id`) !== application.eventId) {
    return invalidResponse(`${path}.event.id`, '신청의 모임과 일치하지 않습니다');
  }
  requiredString(event.title, `${path}.event.title`, 120);
  isoDate(event.startAt, `${path}.event.startAt`);
  requiredString(event.locationName, `${path}.event.locationName`, 200);
  const club = strictRecord(event.club, MY_APPLICATION_CLUB_KEYS, `${path}.event.club`);
  const slug = requiredString(club.slug, `${path}.event.club.slug`, 100);
  if (!SAFE_SLUG.test(slug)) {
    return invalidResponse(`${path}.event.club.slug`, 'slug 형식 오류');
  }
  requiredString(club.title, `${path}.event.club.title`, 200);
  return application;
}

function eventPath(eventId: string) {
  if (!SAFE_EVENT_ID.test(eventId)) {
    throw new TypeError('모임 식별자가 올바르지 않습니다.');
  }
  return `/v1/events/${eventId}`;
}

function getPublicClient() {
  const { apiUrl } = getMobileEnvironment();
  if (!publicClient || publicClientUrl !== apiUrl) {
    publicClientUrl = apiUrl;
    publicClient = createHttpClient({ baseUrl: apiUrl });
  }
  return publicClient;
}

function eventListPath({ view, cursor }: Pick<EventListRequest, 'view' | 'cursor'>) {
  if (view !== 'upcoming' && view !== 'past') {
    throw new TypeError('모임 목록 구분이 올바르지 않습니다.');
  }
  if (cursor !== undefined && !SAFE_EVENT_CURSOR.test(cursor)) {
    throw new TypeError('모임 목록 커서가 올바르지 않습니다.');
  }

  const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
  return `/v1/events?limit=${EVENT_LIST_PAGE_SIZE}&view=${view}${cursorQuery}`;
}

function mapDifficulty(value: ApiEvent['difficulty']): Event['difficulty'] {
  if (value === 'EASY') return 'easy';
  if (value === 'MODERATE') return 'moderate';
  return 'challenging';
}

function mapLifecycle(event: ApiEvent): Event['lifecycle'] {
  if (event.status === 'CANCELED') return 'cancelled';
  if (event.status === 'COMPLETED' || Date.parse(event.startAt) < Date.now()) return 'completed';
  if (event.status === 'CLOSED' || event.remainingCapacity <= 0) return 'full';
  return 'upcoming';
}

export function toEvent(apiEvent: ApiEvent): Event {
  const preparation = apiEvent.supplies
    ? apiEvent.supplies
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  return {
    id: apiEvent.id,
    clubId: apiEvent.club.id,
    clubTitle: apiEvent.club.title,
    interestId: apiEvent.club.interest.slug,
    clubRegion: apiEvent.club.region ?? undefined,
    title: apiEvent.title,
    summary: apiEvent.description,
    description: apiEvent.description,
    location: apiEvent.locationName,
    address: apiEvent.address,
    startsAt: apiEvent.startAt,
    endsAt: apiEvent.endAt ?? apiEvent.startAt,
    capacity: apiEvent.capacity,
    participantCount: apiEvent.participantCount,
    price: apiEvent.price,
    difficulty: mapDifficulty(apiEvent.difficulty),
    lifecycle: mapLifecycle(apiEvent),
    preparation,
    leader: {
      id: `leader-${apiEvent.club.id}`,
      name: apiEvent.club.leaderName,
      introduction: `${apiEvent.club.title} 모임을 운영하는 리더입니다.`,
    },
    imageUri: apiEvent.coverImageUrl ?? undefined,
  };
}

export function applicationStatus(application: ApiApplication): ParticipationStatus | undefined {
  if (application.status === 'PENDING') return 'pending';
  if (application.status === 'APPROVED') {
    return application.attendance === 'ATTENDED' ? 'attended' : 'approved';
  }
  return undefined;
}

export function toParticipation(application: ApiApplication): EventParticipation | null {
  const status = applicationStatus(application);
  return status
    ? {
        id: application.id,
        eventId: application.eventId,
        userId: application.userId,
        status,
        appliedAt: application.appliedAt,
        updatedAt: application.updatedAt,
      }
    : null;
}

/** Keeps the first-seen order while replacing duplicate IDs with the newest server value. */
export function mergeEventPages(current: Event[], incoming: Event[]) {
  const order: string[] = [];
  const seen = new Set<string>();
  const byId = new Map<string, Event>();

  for (const event of [...current, ...incoming]) {
    if (!seen.has(event.id)) {
      seen.add(event.id);
      order.push(event.id);
    }
    byId.set(event.id, event);
  }

  return order.map((id) => byId.get(id) as Event);
}

export const eventsApi = {
  async list({ view, cursor, signal }: EventListRequest): Promise<EventListPage> {
    const response = await getPublicClient().requestJson<unknown>(eventListPath({ view, cursor }), {
      auth: 'none',
      signal,
    });
    const parsed = parseEventListResponse(response.body);
    return {
      data: parsed.data.map(toEvent),
      page: parsed.page,
    };
  },

  async detail(eventId: string, signal?: AbortSignal) {
    const response = await getPublicClient().requestJson<unknown>(
      eventPath(eventId),
      { auth: 'none', signal },
    );
    return toEvent(parseApiEvent(response.body, 'response', eventId));
  },

  async myApplication(eventId: string, signal?: AbortSignal) {
    const response = await getAuthenticatedHttpClient().requestJson<unknown>(`${eventPath(eventId)}/applications/me`, {
      auth: 'required',
      signal,
    });
    const body = strictRecord(response.body, ['application'], 'response');
    return body.application === null
      ? null
      : parseApiApplication(body.application, 'response.application', eventId);
  },

  async myApplications(signal?: AbortSignal) {
    const response = await getAuthenticatedHttpClient().requestJson<unknown>(
      '/v1/me/applications',
      { auth: 'required', signal },
    );
    if (!Array.isArray(response.body) || response.body.length > 50) {
      return invalidResponse('response', '신청 목록 형식 또는 길이 오류');
    }
    const applications = response.body.map((application, index) =>
      parseMyApplicationRow(application, `response[${index}]`),
    );
    if (
      new Set(applications.map(({ id }) => id)).size !== applications.length ||
      new Set(applications.map(({ eventId }) => eventId)).size !== applications.length
    ) {
      return invalidResponse('response', '중복된 신청 식별자');
    }
    return applications;
  },

  async apply(eventId: string) {
    const response = await getAuthenticatedHttpClient().requestJson<unknown>(
      `${eventPath(eventId)}/applications`,
      { method: 'POST', auth: 'required', idempotent: true },
    );
    return parseApiApplication(response.body, 'response', eventId);
  },

  async cancel(eventId: string) {
    const response = await getAuthenticatedHttpClient().requestJson<unknown>(
      `${eventPath(eventId)}/applications/me`,
      { method: 'DELETE', auth: 'required' },
    );
    return parseApiApplication(response.body, 'response', eventId);
  },
};
