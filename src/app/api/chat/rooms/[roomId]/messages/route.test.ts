import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiErrorResponse: vi.fn(),
  assertSameOrigin: vi.fn(),
  authorizedHeaders: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  privateNextJson: vi.fn(),
  setSessionCookies: vi.fn(),
  withBackendAccess: vi.fn(),
}));

vi.mock("@/lib/auth/bff", () => ({
  apiErrorResponse: mocks.apiErrorResponse,
  assertSameOrigin: mocks.assertSameOrigin,
  authorizedHeaders: mocks.authorizedHeaders,
  backendApi: () => ({ get: mocks.get, post: mocks.post }),
  privateNextJson: mocks.privateNextJson,
  setSessionCookies: mocks.setSessionCookies,
  withBackendAccess: mocks.withBackendAccess,
}));

import {
  GET,
  POST,
} from "@/app/api/chat/rooms/[roomId]/messages/route";

const context = { params: Promise.resolve({ roomId: "room_A-1" }) };

describe("/api/chat/rooms/:roomId/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizedHeaders.mockReturnValue({ Authorization: "Bearer access" });
    mocks.privateNextJson.mockImplementation((value, status = 200) =>
      NextResponse.json(value, { status }),
    );
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation("access"),
      refreshed: null,
    }));
    mocks.apiErrorResponse.mockImplementation(() =>
      NextResponse.json({ error: { code: "INVALID_REQUEST" } }, { status: 400 }),
    );
  });

  it("forwards only a validated bounded cursor query", async () => {
    const page = {
      data: [],
      page: { hasNextPage: false, nextCursor: null, nextAfter: null },
    };
    mocks.get.mockResolvedValue(page);
    const request = new Request(
      "https://seniorclub.example/api/chat/rooms/room_A-1/messages?limit=25&cursor=YWJjZGVmZ2g",
    );

    const response = await GET(request, context);

    expect(mocks.get).toHaveBeenCalledWith(
      "/v1/chat/rooms/room_A-1/messages?limit=25&cursor=YWJjZGVmZ2g",
      { headers: { Authorization: "Bearer access" } },
    );
    expect(await response.json()).toEqual(page);
  });

  it("forwards an after watermark without mixing cursor directions", async () => {
    const page = {
      data: [],
      page: {
        hasNextPage: false,
        nextCursor: null,
        nextAfter: "YWZ0ZXJfMg",
      },
    };
    mocks.get.mockResolvedValue(page);
    const request = new Request(
      "https://seniorclub.example/api/chat/rooms/room_A-1/messages?limit=50&after=YWZ0ZXJfMQ",
    );

    const response = await GET(request, context);

    expect(mocks.get).toHaveBeenCalledWith(
      "/v1/chat/rooms/room_A-1/messages?limit=50&after=YWZ0ZXJfMQ",
      { headers: { Authorization: "Bearer access" } },
    );
    expect(await response.json()).toEqual(page);
  });

  it("rejects unknown query keys before acquiring backend access", async () => {
    const response = await GET(
      new Request(
        "https://seniorclub.example/api/chat/rooms/room_A-1/messages?limit=25&admin=true",
      ),
      context,
    );

    expect(response.status).toBe(400);
    expect(mocks.withBackendAccess).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("checks same-origin JSON and forwards the strict UUID-keyed send body", async () => {
    const body = {
      clientMessageId: "49e84d7e-7251-4f39-8410-7dbb444cf7f9",
      message: "  반갑습니다  ",
    };
    const sent = { id: "message-1", message: "반갑습니다" };
    mocks.post.mockResolvedValue(sent);
    const request = new Request(
      "https://seniorclub.example/api/chat/rooms/room_A-1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://seniorclub.example",
        },
        body: JSON.stringify(body),
      },
    );

    const response = await POST(request, context);

    expect(mocks.assertSameOrigin).toHaveBeenCalledWith(request);
    expect(mocks.post).toHaveBeenCalledWith(
      "/v1/chat/rooms/room_A-1/messages",
      { ...body, message: "반갑습니다" },
      { headers: { Authorization: "Bearer access" } },
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(sent);
  });

  it("rejects extra JSON fields and never forwards them", async () => {
    const request = new Request(
      "https://seniorclub.example/api/chat/rooms/room_A-1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://seniorclub.example",
        },
        body: JSON.stringify({
          clientMessageId: "49e84d7e-7251-4f39-8410-7dbb444cf7f9",
          message: "반갑습니다",
          role: "ADMIN",
        }),
      },
    );

    expect((await POST(request, context)).status).toBe(400);
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
