import "server-only";

import { ApiHttpError } from "@/lib/api";
import { isSafeNotificationId } from "@/lib/notification-id";

const NOTIFICATION_QUERY_KEYS = new Set(["limit", "cursor"]);
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{8,500}$/;

function badRequest(code: string, message: string): never {
  throw new ApiHttpError(400, message, code);
}

export function notificationListEndpoint(request: Request) {
  const searchParams = new URL(request.url).searchParams;

  for (const key of searchParams.keys()) {
    if (!NOTIFICATION_QUERY_KEYS.has(key)) {
      badRequest(
        "INVALID_NOTIFICATION_QUERY",
        "알림 목록 요청 항목이 올바르지 않습니다.",
      );
    }
  }

  if (
    searchParams.getAll("limit").length > 1 ||
    searchParams.getAll("cursor").length > 1
  ) {
    badRequest(
      "INVALID_NOTIFICATION_QUERY",
      "알림 목록 요청 항목을 중복해서 사용할 수 없습니다.",
    );
  }

  const rawLimit = searchParams.get("limit");
  if (rawLimit !== null && !/^(?:[1-9]|[1-4][0-9]|50)$/.test(rawLimit)) {
    badRequest(
      "INVALID_NOTIFICATION_LIMIT",
      "알림은 한 번에 1~50개까지 불러올 수 있습니다.",
    );
  }

  const cursor = searchParams.get("cursor");
  if (cursor !== null && !CURSOR_PATTERN.test(cursor)) {
    badRequest(
      "INVALID_NOTIFICATION_CURSOR",
      "알림 목록 위치가 올바르지 않습니다.",
    );
  }

  const backendQuery = new URLSearchParams();
  if (rawLimit !== null) backendQuery.set("limit", rawLimit);
  if (cursor !== null) backendQuery.set("cursor", cursor);
  const query = backendQuery.toString();

  return `/v1/me/notifications${query ? `?${query}` : ""}`;
}

export function unreadCountEndpoint(request: Request) {
  if (new URL(request.url).search) {
    badRequest(
      "INVALID_NOTIFICATION_QUERY",
      "읽지 않은 알림 수 요청에는 조회 항목을 사용할 수 없습니다.",
    );
  }
  return "/v1/me/notifications/unread-count";
}

export function notificationReadEndpoint(id: string) {
  if (!isSafeNotificationId(id)) {
    badRequest(
      "INVALID_NOTIFICATION_ID",
      "알림 식별자가 올바르지 않습니다.",
    );
  }
  return `/v1/me/notifications/${encodeURIComponent(id)}/read`;
}

export async function readEmptyJsonBody(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    badRequest("INVALID_JSON", "올바른 JSON 요청이 필요합니다.");
  }

  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length > 0
  ) {
    badRequest(
      "INVALID_NOTIFICATION_ACTION",
      "알림 읽음 요청에는 추가 항목을 사용할 수 없습니다.",
    );
  }
}
