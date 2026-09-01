import { ApiError } from '@/api/api-error';
import { createHttpClient } from '@/api/http-client';
import { getMobileEnvironment } from '@/config/env';

export type PublicClubEventStatus = 'PUBLISHED' | 'CLOSED';

export interface PublicClubInterest {
  id: string;
  slug: string;
  name: string;
  icon: string;
  emoji: string;
}

export interface PublicClubNextEvent {
  id: string;
  title: string;
  locationName: string;
  startAt: string;
  status: PublicClubEventStatus;
}

export interface PublicClub {
  id: string;
  slug: string;
  title: string;
  description: string;
  region: string | null;
  interest: PublicClubInterest;
  leaderName: string;
  memberCount: number;
  upcomingEventCount: number;
  pastEventCount: number;
  nextEvent: PublicClubNextEvent | null;
}

export interface ClubListPage {
  data: PublicClub[];
  page: {
    hasNextPage: boolean;
    nextCursor: string | null;
  };
}

export interface ClubListRequest {
  category?: string;
  region?: string;
  q?: string;
  cursor?: string;
  signal?: AbortSignal;
}

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_CURSOR = /^[A-Za-z0-9_-]{8,500}$/;
const CLUB_KEYS = [
  'id',
  'slug',
  'title',
  'description',
  'region',
  'interest',
  'leaderName',
  'memberCount',
  'upcomingEventCount',
  'pastEventCount',
  'nextEvent',
] as const;
const INTEREST_KEYS = ['id', 'slug', 'name', 'icon'] as const;
const NEXT_EVENT_KEYS = ['id', 'title', 'locationName', 'startAt', 'status'] as const;
const LIST_KEYS = ['data', 'page'] as const;
const PAGE_KEYS = ['hasNextPage', 'nextCursor'] as const;

export const CLUB_LIST_PAGE_SIZE = 20;

export function isSafeClubSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 80 && SAFE_SLUG.test(value);
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

let publicClient: ReturnType<typeof createHttpClient> | null = null;
let publicClientUrl: string | null = null;

function invalidResponse(path: string, reason: string): never {
  throw new ApiError({
    status: 0,
    code: 'INVALID_RESPONSE',
    message: `서버의 커뮤니티 응답이 올바르지 않습니다. (${path}: ${reason})`,
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
  const actualKeys = Object.keys(record);
  const unexpected = actualKeys.find((key) => !expectedKeys.includes(key));
  if (unexpected) {
    return invalidResponse(path, `알 수 없는 ${unexpected} 필드`);
  }
  const missing = expectedKeys.find((key) => !Object.hasOwn(record, key));
  if (missing) {
    return invalidResponse(path, `${missing} 필드 누락`);
  }
  return record;
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  path: string,
) {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    return invalidResponse(`${path}.${key}`, '문자열 형식 오류');
  }
  return value;
}

function nullableString(
  record: Record<string, unknown>,
  key: string,
  path: string,
) {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== 'string' || !value.trim()) {
    return invalidResponse(`${path}.${key}`, '문자열 또는 null 형식 오류');
  }
  return value;
}

function nonNegativeInteger(record: Record<string, unknown>, key: string, path: string) {
  const value = record[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    return invalidResponse(`${path}.${key}`, '0 이상의 정수가 아닙니다');
  }
  return value as number;
}

function parseInterest(value: unknown, path: string): PublicClubInterest {
  const record = strictRecord(value, INTEREST_KEYS, path);
  const slug = requiredString(record, 'slug', path);
  if (!isSafeClubSlug(slug)) {
    return invalidResponse(`${path}.slug`, 'slug 형식 오류');
  }
  const icon = requiredString(record, 'icon', path);
  return {
    id: requiredString(record, 'id', path),
    slug,
    name: requiredString(record, 'name', path),
    icon,
    emoji: INTEREST_EMOJI[icon] ?? '⭐',
  };
}

function parseNextEvent(value: unknown, path: string): PublicClubNextEvent | null {
  if (value === null) return null;
  const record = strictRecord(value, NEXT_EVENT_KEYS, path);
  const startAt = requiredString(record, 'startAt', path);
  if (!Number.isFinite(Date.parse(startAt))) {
    return invalidResponse(`${path}.startAt`, '날짜 형식 오류');
  }
  const status = record.status;
  if (status !== 'PUBLISHED' && status !== 'CLOSED') {
    return invalidResponse(`${path}.status`, '공개 상태 형식 오류');
  }
  return {
    id: requiredString(record, 'id', path),
    title: requiredString(record, 'title', path),
    locationName: requiredString(record, 'locationName', path),
    startAt,
    status,
  };
}

export function parsePublicClub(value: unknown, path = 'club'): PublicClub {
  const record = strictRecord(value, CLUB_KEYS, path);
  const slug = requiredString(record, 'slug', path);
  if (!isSafeClubSlug(slug)) {
    return invalidResponse(`${path}.slug`, 'slug 형식 오류');
  }

  return {
    id: requiredString(record, 'id', path),
    slug,
    title: requiredString(record, 'title', path),
    description: requiredString(record, 'description', path),
    region: nullableString(record, 'region', path),
    interest: parseInterest(record.interest, `${path}.interest`),
    leaderName: requiredString(record, 'leaderName', path),
    memberCount: nonNegativeInteger(record, 'memberCount', path),
    upcomingEventCount: nonNegativeInteger(record, 'upcomingEventCount', path),
    pastEventCount: nonNegativeInteger(record, 'pastEventCount', path),
    nextEvent: parseNextEvent(record.nextEvent, `${path}.nextEvent`),
  };
}

export function parseClubListPage(value: unknown): ClubListPage {
  const record = strictRecord(value, LIST_KEYS, 'response');
  if (!Array.isArray(record.data) || record.data.length > 50) {
    return invalidResponse('response.data', '목록 형식 또는 길이 오류');
  }
  const page = strictRecord(record.page, PAGE_KEYS, 'response.page');
  if (typeof page.hasNextPage !== 'boolean') {
    return invalidResponse('response.page.hasNextPage', 'boolean 형식 오류');
  }
  const nextCursor = page.nextCursor;
  if (nextCursor !== null && (typeof nextCursor !== 'string' || !SAFE_CURSOR.test(nextCursor))) {
    return invalidResponse('response.page.nextCursor', 'cursor 형식 오류');
  }
  if (page.hasNextPage !== (nextCursor !== null)) {
    return invalidResponse('response.page', '페이지 상태와 cursor가 일치하지 않습니다');
  }

  return {
    data: record.data.map((club, index) => parsePublicClub(club, `response.data[${index}]`)),
    page: { hasNextPage: page.hasNextPage, nextCursor },
  };
}

function normalizedQuery(value: string | undefined, label: string, minimumLength: number) {
  if (value === undefined) return undefined;
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < minimumLength || normalized.length > 80) {
    throw new TypeError(`${label} 형식이 올바르지 않습니다.`);
  }
  return normalized;
}

function clubListPath(request: Omit<ClubListRequest, 'signal'>) {
  const params = new URLSearchParams({ limit: String(CLUB_LIST_PAGE_SIZE) });
  if (request.category !== undefined) {
    const category = request.category.trim();
    if (!SAFE_SLUG.test(category) || category.length > 80) {
      throw new TypeError('관심사 식별자가 올바르지 않습니다.');
    }
    params.set('category', category);
  }
  const region = normalizedQuery(request.region, '지역', 1);
  const query = normalizedQuery(request.q, '검색어', 2);
  if (region) params.set('region', region);
  if (query) params.set('q', query);
  if (request.cursor !== undefined) {
    if (!SAFE_CURSOR.test(request.cursor)) {
      throw new TypeError('커뮤니티 목록 커서가 올바르지 않습니다.');
    }
    params.set('cursor', request.cursor);
  }
  return `/v1/clubs?${params.toString()}`;
}

function clubDetailPath(slug: string) {
  if (!isSafeClubSlug(slug)) {
    throw new TypeError('커뮤니티 주소가 올바르지 않습니다.');
  }
  return `/v1/clubs/${encodeURIComponent(slug)}`;
}

function getPublicClient() {
  const { apiUrl } = getMobileEnvironment();
  if (!publicClient || publicClientUrl !== apiUrl) {
    publicClientUrl = apiUrl;
    publicClient = createHttpClient({ baseUrl: apiUrl });
  }
  return publicClient;
}

/** Keeps first-seen order while replacing duplicate IDs with the newest server value. */
export function mergeClubPages(current: PublicClub[], incoming: PublicClub[]) {
  const order: string[] = [];
  const seen = new Set<string>();
  const byId = new Map<string, PublicClub>();

  for (const club of [...current, ...incoming]) {
    if (!seen.has(club.id)) {
      seen.add(club.id);
      order.push(club.id);
    }
    byId.set(club.id, club);
  }
  return order.map((id) => byId.get(id) as PublicClub);
}

export const clubsApi = {
  async list(request: ClubListRequest = {}): Promise<ClubListPage> {
    const { signal, ...query } = request;
    const response = await getPublicClient().requestJson<unknown>(clubListPath(query), {
      auth: 'none',
      signal,
    });
    return parseClubListPage(response.body);
  },

  async detail(slug: string, signal?: AbortSignal): Promise<PublicClub> {
    const response = await getPublicClient().requestJson<unknown>(clubDetailPath(slug), {
      auth: 'none',
      signal,
    });
    return parsePublicClub(response.body);
  },
};
