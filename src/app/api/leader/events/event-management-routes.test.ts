import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  withBackendAccess: vi.fn(),
}));

vi.mock("@/lib/auth/bff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/bff")>();
  return {
    ...actual,
    backendApi: () => ({
      get: mocks.get,
      patch: mocks.patch,
      post: mocks.post,
    }),
    withBackendAccess: mocks.withBackendAccess,
  };
});

import { GET as getManagedClubs } from "@/app/api/leader/clubs/route";
import {
  GET as getManagedEvent,
  PATCH as updateManagedEvent,
} from "@/app/api/leader/events/[id]/route";
import { POST as cancelManagedEvent } from "@/app/api/leader/events/[id]/cancel/route";
import { POST as publishManagedEvent } from "@/app/api/leader/events/[id]/publish/route";
import { POST as createManagedEvent } from "@/app/api/leader/events/route";
import { managedClubsBackendPath } from "@/lib/leader-events/bff";

const origin = "https://seniorclub.example";
const eventId = "event-managed-1";
const clubId = "club-operator-1";
const detail = {
  id: eventId,
  clubId,
  title: "서울숲 천천히 걷기",
  description: "무리하지 않고 서울숲을 함께 걸으며 대화하는 모임입니다.",
  coverImageUrl: null,
  locationName: "서울숲 방문자센터",
  address: "서울 성동구 뚝섬로 273",
  mapUrl: null,
  startAt: "2026-08-20T01:00:00.000Z",
  endAt: "2026-08-20T03:00:00.000Z",
  registrationDeadline: "2026-08-19T09:00:00.000Z",
  capacity: 20,
  price: 5000,
  currency: "KRW",
  difficulty: "EASY",
  supplies: "편한 신발, 개인 물",
  approvalMode: "MANUAL",
  status: "DRAFT",
  club: { id: clubId, slug: "seoul-forest", title: "서울숲 산책 모임" },
  createdAt: "2026-07-30T02:00:00.000Z",
  updatedAt: "2026-07-30T03:00:00.000Z",
};
const createInput = {
  clubId,
  title: detail.title,
  description: detail.description,
  locationName: detail.locationName,
  address: detail.address,
  mapUrl: null,
  startAt: detail.startAt,
  endAt: detail.endAt,
  registrationDeadline: detail.registrationDeadline,
  capacity: detail.capacity,
  price: detail.price,
  difficulty: detail.difficulty,
  supplies: detail.supplies,
  approvalMode: detail.approvalMode,
  publish: false,
};

function jsonRequest(
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
  options: { idempotencyKey?: string } = {},
) {
  return new Request(`${origin}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("leader event-management BFF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation("access-token"),
      refreshed: null,
    }));
  });

  it("loads only the authenticated operator club projection", async () => {
    mocks.get.mockResolvedValue({
      data: [detail.club],
      page: { hasNextPage: false, nextCursor: null },
    });

    const response = await getManagedClubs(
      new Request(`${origin}/api/leader/clubs`),
    );

    expect(mocks.get).toHaveBeenCalledWith("/v1/leader/clubs", {
      cache: "no-store",
      headers: { Authorization: "Bearer access-token" },
    });
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    await expect(response.json()).resolves.toEqual({
      data: [detail.club],
      page: { hasNextPage: false, nextCursor: null },
    });
  });

  it("forwards only a bounded managed-club cursor query", async () => {
    expect(
      managedClubsBackendPath(
        `${origin}/api/leader/clubs?limit=100&cursor=opaque_cursor-123`,
      ),
    ).toBe("/v1/leader/clubs?limit=100&cursor=opaque_cursor-123");
    expect(() =>
      managedClubsBackendPath(
        `${origin}/api/leader/clubs?limit=101`,
      ),
    ).toThrowError(expect.objectContaining({ status: 400 }));
    expect(() =>
      managedClubsBackendPath(
        `${origin}/api/leader/clubs?cursor=../admin`,
      ),
    ).toThrowError(expect.objectContaining({ status: 400 }));
    expect(() =>
      managedClubsBackendPath(
        `${origin}/api/leader/clubs?limit=10&limit=20`,
      ),
    ).toThrowError(expect.objectContaining({ status: 400 }));
  });

  it("creates a normalized event through same-origin authenticated JSON", async () => {
    mocks.post.mockResolvedValue(detail);
    const response = await createManagedEvent(
      jsonRequest("/api/leader/events", "POST", {
        ...createInput,
        title: `  ${createInput.title}  `,
      }, { idempotencyKey: "event-create:123e4567-e89b-42d3-a456-426614174000" }),
    );

    expect(mocks.post).toHaveBeenCalledWith(
      "/v1/events",
      createInput,
      {
        headers: {
          Authorization: "Bearer access-token",
          "Idempotency-Key":
            "event-create:123e4567-e89b-42d3-a456-426614174000",
        },
      },
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: eventId,
      status: "DRAFT",
      updatedAt: detail.updatedAt,
    });
  });

  it("loads and updates the exact private event before returning a bounded result", async () => {
    mocks.get.mockResolvedValue(detail);
    const getResponse = await getManagedEvent(
      new Request(`${origin}/api/leader/events/${eventId}`),
      { params: Promise.resolve({ id: eventId }) },
    );
    expect(mocks.get).toHaveBeenCalledWith(`/v1/leader/events/${eventId}`, {
      cache: "no-store",
      headers: { Authorization: "Bearer access-token" },
    });
    await expect(getResponse.json()).resolves.toMatchObject({
      id: eventId,
      clubId,
      status: "DRAFT",
    });

    mocks.patch.mockResolvedValue({ ...detail, title: "수정한 모임" });
    const patchResponse = await updateManagedEvent(
      jsonRequest(`/api/leader/events/${eventId}`, "PATCH", {
        title: "  수정한 모임  ",
      }),
      { params: Promise.resolve({ id: eventId }) },
    );
    expect(mocks.patch).toHaveBeenCalledWith(
      `/v1/events/${eventId}`,
      { title: "수정한 모임" },
      { headers: { Authorization: "Bearer access-token" } },
    );
    await expect(patchResponse.json()).resolves.toEqual({
      id: eventId,
      status: "DRAFT",
      updatedAt: detail.updatedAt,
    });
  });

  it.each([
    ["publish", publishManagedEvent],
    ["cancel", cancelManagedEvent],
  ] as const)("forwards an empty %s action and validates its event identity", async (action, handler) => {
    mocks.post.mockResolvedValue({
      ...detail,
      status: action === "publish" ? "PUBLISHED" : "CANCELED",
    });
    const response = await handler(
      jsonRequest(`/api/leader/events/${eventId}/${action}`, "POST", {}),
      { params: Promise.resolve({ id: eventId }) },
    );

    expect(mocks.post).toHaveBeenCalledWith(
      `/v1/events/${eventId}/${action}`,
      {},
      { headers: { Authorization: "Bearer access-token" } },
    );
    expect(response.status).toBe(200);
  });

  it("rejects unknown fields, unsafe ids, and cross-origin writes before auth", async () => {
    const unknownField = await createManagedEvent(
      jsonRequest("/api/leader/events", "POST", {
        ...createInput,
        creatorId: "someone-else",
      }, { idempotencyKey: "event-create:123e4567-e89b-42d3-a456-426614174000" }),
    );
    const unsafeId = await updateManagedEvent(
      jsonRequest("/api/leader/events/bad", "PATCH", { title: "수정 제목" }),
      { params: Promise.resolve({ id: "../admin" }) },
    );
    const crossOrigin = await createManagedEvent(
      new Request(`${origin}/api/leader/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
          "Idempotency-Key":
            "event-create:123e4567-e89b-42d3-a456-426614174000",
        },
        body: JSON.stringify(createInput),
      }),
    );

    expect(unknownField.status).toBe(400);
    expect(unsafeId.status).toBe(400);
    expect(crossOrigin.status).toBe(403);
    expect(mocks.withBackendAccess).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it("requires a bounded create idempotency key before authentication", async () => {
    const missing = await createManagedEvent(
      jsonRequest("/api/leader/events", "POST", createInput),
    );
    const malformed = await createManagedEvent(
      jsonRequest("/api/leader/events", "POST", createInput, {
        idempotencyKey: "reused-by-everyone",
      }),
    );

    expect(missing.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(mocks.withBackendAccess).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("fails closed when the backend returns a different resource or malformed DTO", async () => {
    mocks.get.mockResolvedValue({ ...detail, id: "event-other-1" });
    const mismatched = await getManagedEvent(
      new Request(`${origin}/api/leader/events/${eventId}`),
      { params: Promise.resolve({ id: eventId }) },
    );
    mocks.post.mockResolvedValue({ ...detail, updatedAt: "not-a-date" });
    const malformed = await publishManagedEvent(
      jsonRequest(`/api/leader/events/${eventId}/publish`, "POST", {}),
      { params: Promise.resolve({ id: eventId }) },
    );

    expect(mismatched.status).toBe(502);
    expect(malformed.status).toBe(502);
    await expect(malformed.json()).resolves.toMatchObject({
      error: { code: "INVALID_UPSTREAM_RESPONSE" },
    });
  });
});
