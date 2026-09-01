import { getAuthenticatedHttpClient } from '@/auth/auth-session-manager';

export type ApiNotificationType =
  | 'NEW_EVENT'
  | 'COMMENT'
  | 'REPLY'
  | 'APPLICATION_APPROVED'
  | 'APPLICATION_REJECTED'
  | 'EVENT_REMINDER'
  | 'REVIEW_REQUEST'
  | 'SYSTEM';

export interface ApiNotification {
  id: string;
  type: ApiNotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ApiNotificationPage {
  data: ApiNotification[];
  page: {
    hasNextPage: boolean;
    nextCursor: string | null;
  };
}

const SAFE_NOTIFICATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:~-]{0,127}$/;
const SAFE_CURSOR = /^[A-Za-z0-9_-]{8,500}$/;
const NOTIFICATION_TYPES = new Set<ApiNotificationType>([
  'NEW_EVENT',
  'COMMENT',
  'REPLY',
  'APPLICATION_APPROVED',
  'APPLICATION_REJECTED',
  'EVENT_REMINDER',
  'REVIEW_REQUEST',
  'SYSTEM',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function parseNotification(value: unknown): ApiNotification {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['id', 'type', 'title', 'body', 'link', 'readAt', 'createdAt']) ||
    typeof value.id !== 'string' ||
    !SAFE_NOTIFICATION_ID.test(value.id) ||
    typeof value.type !== 'string' ||
    !NOTIFICATION_TYPES.has(value.type as ApiNotificationType) ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    typeof value.body !== 'string' ||
    !value.body.trim() ||
    !(value.link === null || typeof value.link === 'string') ||
    !(value.readAt === null || isIsoDate(value.readAt)) ||
    !isIsoDate(value.createdAt)
  ) {
    throw new TypeError('알림 서버 응답 형식이 올바르지 않습니다.');
  }
  return value as unknown as ApiNotification;
}

export function parseNotificationPage(value: unknown): ApiNotificationPage {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['data', 'page']) ||
    !Array.isArray(value.data) ||
    !isRecord(value.page) ||
    !hasExactKeys(value.page, ['hasNextPage', 'nextCursor']) ||
    typeof value.page.hasNextPage !== 'boolean' ||
    !(value.page.nextCursor === null ||
      (typeof value.page.nextCursor === 'string' && SAFE_CURSOR.test(value.page.nextCursor))) ||
    (value.page.hasNextPage && value.page.nextCursor === null) ||
    (!value.page.hasNextPage && value.page.nextCursor !== null)
  ) {
    throw new TypeError('알림 서버 응답 형식이 올바르지 않습니다.');
  }

  const data = value.data.map(parseNotification);
  const ids = new Set(data.map((notification) => notification.id));
  if (ids.size !== data.length) {
    throw new TypeError('알림 서버 응답 형식이 올바르지 않습니다.');
  }
  for (let index = 1; index < data.length; index += 1) {
    const previous = data[index - 1];
    const current = data[index];
    if (!previous || !current) continue;
    const timeDifference = Date.parse(previous.createdAt) - Date.parse(current.createdAt);
    if (timeDifference < 0 || (timeDifference === 0 && previous.id < current.id)) {
      throw new TypeError('알림 서버 응답 형식이 올바르지 않습니다.');
    }
  }

  return {
    data,
    page: {
      hasNextPage: value.page.hasNextPage,
      nextCursor: value.page.nextCursor,
    },
  };
}

function notificationPath(id: string) {
  if (!SAFE_NOTIFICATION_ID.test(id)) {
    throw new TypeError('알림 식별자가 올바르지 않습니다.');
  }
  return `/v1/me/notifications/${encodeURIComponent(id)}`;
}

function listPath(cursor?: string) {
  if (cursor !== undefined && !SAFE_CURSOR.test(cursor)) {
    throw new TypeError('알림 목록 위치가 올바르지 않습니다.');
  }
  return `/v1/me/notifications?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
}

export const notificationsApi = {
  async list(cursor?: string, signal?: AbortSignal) {
    const response = await getAuthenticatedHttpClient().requestJson<ApiNotificationPage>(
      listPath(cursor),
      { auth: 'required', signal },
    );
    return parseNotificationPage(response.body);
  },

  async markRead(id: string) {
    const response = await getAuthenticatedHttpClient().requestJson<{ success: true }>(
      `${notificationPath(id)}/read`,
      { method: 'PATCH', auth: 'required' },
    );
    return response.body;
  },

  async unreadCount(signal?: AbortSignal) {
    const response = await getAuthenticatedHttpClient().requestJson<{ unreadCount: number }>(
      '/v1/me/notifications/unread-count',
      { auth: 'required', signal },
    );
    return response.body.unreadCount;
  },

  async markAllRead() {
    const response = await getAuthenticatedHttpClient().requestJson<{
      success: true;
      updatedCount: number;
    }>('/v1/me/notifications/read-all', {
      method: 'POST',
      auth: 'required',
    });
    return response.body;
  },
};
