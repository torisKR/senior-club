import "server-only";

import { z } from "zod";

import { ApiHttpError } from "@/lib/api";
import {
  createLeaderEventInputSchema,
  eventMutationResultSchema,
  leaderEventDetailSchema,
  managedClubsResponseSchema,
  updateLeaderEventInputSchema,
} from "@/lib/leader-events/contracts";

export const EVENT_IDEMPOTENCY_KEY_PATTERN =
  /^event-create:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseEventIdempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key");
  if (!value || !EVENT_IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new ApiHttpError(
      400,
      "안전한 모임 생성을 위한 요청 식별자가 필요합니다.",
      "IDEMPOTENCY_KEY_REQUIRED",
    );
  }
  return value;
}

const MANAGED_EVENT_QUERY_KEYS = ["limit", "cursor", "view"] as const;
const MANAGED_EVENT_QUERY_KEY_SET = new Set<string>(MANAGED_EVENT_QUERY_KEYS);

export function leaderEventsBackendPath(requestUrl: string) {
  const searchParams = new URL(requestUrl).searchParams;
  for (const key of searchParams.keys()) {
    if (!MANAGED_EVENT_QUERY_KEY_SET.has(key)) {
      throw new ApiHttpError(
        400,
        "운영 모임 조회 조건이 올바르지 않습니다.",
        "INVALID_LEADER_EVENT_QUERY",
      );
    }
  }
  for (const key of MANAGED_EVENT_QUERY_KEYS) {
    if (searchParams.getAll(key).length > 1) {
      throw new ApiHttpError(
        400,
        "운영 모임 조회 조건을 중복해서 사용할 수 없습니다.",
        "INVALID_LEADER_EVENT_QUERY",
      );
    }
  }

  const view = searchParams.get("view");
  if (
    view !== null &&
    view !== "upcoming" &&
    view !== "attendance" &&
    view !== "drafts"
  ) {
    throw new ApiHttpError(
      400,
      "지원하지 않는 운영 모임 보기입니다.",
      "INVALID_LEADER_EVENT_VIEW",
    );
  }

  const forwarded = new URLSearchParams();
  for (const key of MANAGED_EVENT_QUERY_KEYS) {
    const value = searchParams.get(key);
    if (value !== null) forwarded.set(key, value);
  }
  const query = forwarded.toString();
  return `/v1/leader/events${query ? `?${query}` : ""}`;
}

const MANAGED_CLUB_CURSOR_PATTERN = /^[A-Za-z0-9_-]{8,500}$/;

export function managedClubsBackendPath(requestUrl: string) {
  const searchParams = new URL(requestUrl).searchParams;
  const allowed = new Set(["limit", "cursor"]);
  for (const key of searchParams.keys()) {
    if (!allowed.has(key) || searchParams.getAll(key).length > 1) {
      throw new ApiHttpError(
        400,
        "관리 클럽 조회 조건이 올바르지 않습니다.",
        "INVALID_MANAGED_CLUB_QUERY",
      );
    }
  }

  const limit = searchParams.get("limit");
  if (
    limit &&
    (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100)
  ) {
    throw new ApiHttpError(
      400,
      "관리 클럽 조회 개수는 1~100이어야 합니다.",
      "INVALID_MANAGED_CLUB_QUERY",
    );
  }
  const cursor = searchParams.get("cursor");
  if (cursor && !MANAGED_CLUB_CURSOR_PATTERN.test(cursor)) {
    throw new ApiHttpError(
      400,
      "관리 클럽 목록 위치가 올바르지 않습니다.",
      "INVALID_MANAGED_CLUB_QUERY",
    );
  }

  const forwarded = new URLSearchParams();
  if (limit) forwarded.set("limit", limit);
  if (cursor) forwarded.set("cursor", cursor);
  const query = forwarded.toString();
  return `/v1/leader/clubs${query ? `?${query}` : ""}`;
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new ApiHttpError(
      400,
      "모임 요청 형식이 올바르지 않습니다.",
      "INVALID_JSON",
    );
  }
}

export async function parseCreateLeaderEventRequest(request: Request) {
  const parsed = createLeaderEventInputSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    throw new ApiHttpError(
      400,
      "모임 정보와 날짜, 정원, 참가비를 다시 확인해 주세요.",
      "INVALID_EVENT_INPUT",
      undefined,
      z.flattenError(parsed.error),
    );
  }
  return parsed.data;
}

export async function parseUpdateLeaderEventRequest(request: Request) {
  const parsed = updateLeaderEventInputSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    throw new ApiHttpError(
      400,
      "변경할 모임 정보와 날짜를 다시 확인해 주세요.",
      "INVALID_EVENT_INPUT",
      undefined,
      z.flattenError(parsed.error),
    );
  }
  return parsed.data;
}

export async function parseEmptyEventActionRequest(request: Request) {
  const parsed = z.object({}).strict().safeParse(await readJson(request));
  if (!parsed.success) {
    throw new ApiHttpError(
      400,
      "이 요청에는 추가 정보를 보낼 수 없습니다.",
      "INVALID_EVENT_ACTION",
    );
  }
  return parsed.data;
}

function invalidUpstreamResponse(resource: string): never {
  throw new ApiHttpError(
    502,
    `${resource} 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.`,
    "INVALID_UPSTREAM_RESPONSE",
  );
}

export function parseManagedClubsResponse(value: unknown) {
  const parsed = managedClubsResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : invalidUpstreamResponse("관리 클럽");
}

export function parseLeaderEventDetailResponse(
  value: unknown,
  expectedId?: string,
) {
  const parsed = leaderEventDetailSchema.safeParse(value);
  return parsed.success && (!expectedId || parsed.data.id === expectedId)
    ? parsed.data
    : invalidUpstreamResponse("모임 상세");
}

export function parseEventMutationResponse(value: unknown, expectedId?: string) {
  const parsed = eventMutationResultSchema.safeParse(value);
  return parsed.success && (!expectedId || parsed.data.id === expectedId)
    ? parsed.data
    : invalidUpstreamResponse("모임 변경");
}
