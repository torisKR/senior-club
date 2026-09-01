import { WsException } from "@nestjs/websockets";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import type { TokenService } from "../auth/token.service";
import { UserRole } from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { ChatGateway } from "./chat.gateway";
import type { ChatService } from "./chat.service";

function principal(userId: string, sessionId: string): AuthenticatedPrincipal {
  return { userId, sessionId, role: UserRole.MEMBER };
}

function recipient(auth?: AuthenticatedPrincipal) {
  return {
    data: auth ? { auth } : {},
    emit: vi.fn(),
    leave: vi.fn().mockResolvedValue(undefined),
  };
}

describe("ChatGateway realtime authorization", () => {
  it("batch-validates entitlement and sessions before emitting to room sockets", async () => {
    const senderPrincipal = principal("sender-1", "session-sender");
    const senderSocket = { data: { auth: senderPrincipal } };
    const authorized = recipient(
      principal("authorized-1", "session-authorized"),
    );
    const unauthorized = recipient(
      principal("unauthorized-1", "session-unauthorized"),
    );
    const blocked = recipient(principal("blocked-1", "session-blocked"));
    const revoked = recipient(principal("authorized-1", "session-revoked"));
    const expired = recipient(principal("authorized-1", "session-expired"));
    const missingAuth = recipient();
    const fetchSockets = vi
      .fn()
      .mockResolvedValue([
        authorized,
        blocked,
        unauthorized,
        revoked,
        expired,
        missingAuth,
      ]);
    const server = { in: vi.fn().mockReturnValue({ fetchSockets }) };
    const message = { id: "message-1", roomId: "room-1" };
    const chat = {
      send: vi.fn().mockResolvedValue(message),
      entitledMemberIds: vi
        .fn()
        .mockResolvedValue(
          new Set(["sender-1", "authorized-1", "blocked-1"]),
        ),
      blockedInteractionUserIds: vi
        .fn()
        .mockResolvedValue(new Set(["blocked-1"])),
    };
    const authSession = {
      findFirst: vi.fn().mockResolvedValue({ id: senderPrincipal.sessionId }),
      findMany: vi.fn().mockResolvedValue([
        { id: "session-authorized", userId: "authorized-1" },
        { id: "session-blocked", userId: "blocked-1" },
        { id: "session-unauthorized", userId: "unauthorized-1" },
      ]),
    };
    const gateway = new ChatGateway(
      {} as TokenService,
      { authSession } as unknown as PrismaService,
      chat as unknown as ChatService,
    );
    gateway.server = server as never;

    const result = await gateway.send(senderSocket as never, {
      roomId: "room-1",
      clientMessageId: "client-message-1",
      message: "안녕하세요",
    });

    expect(result).toEqual({ ok: true, message });
    expect(chat.entitledMemberIds).toHaveBeenCalledOnce();
    expect(chat.entitledMemberIds).toHaveBeenCalledWith("room-1");
    expect(authSession.findMany).toHaveBeenCalledOnce();
    expect(chat.blockedInteractionUserIds).toHaveBeenCalledWith(
      "sender-1",
      expect.arrayContaining([
        "authorized-1",
        "blocked-1",
        "unauthorized-1",
      ]),
    );
    expect(fetchSockets).toHaveBeenCalledOnce();
    expect(authorized.emit).toHaveBeenCalledWith("message:new", message);
    expect(authorized.leave).not.toHaveBeenCalled();
    expect(blocked.emit).not.toHaveBeenCalled();
    expect(blocked.leave).not.toHaveBeenCalled();
    for (const socket of [unauthorized, revoked, expired, missingAuth]) {
      expect(socket.emit).not.toHaveBeenCalled();
      expect(socket.leave).toHaveBeenCalledWith("room:room-1");
    }
  });

  it("rejects a sender whose cached socket session has been revoked", async () => {
    const senderPrincipal = principal("sender-1", "session-revoked");
    const chat = {
      send: vi.fn(),
      entitledMemberIds: vi.fn(),
      blockedInteractionUserIds: vi.fn(),
    };
    const prisma = {
      authSession: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn(),
      },
    } as unknown as PrismaService;
    const gateway = new ChatGateway(
      {} as TokenService,
      prisma,
      chat as unknown as ChatService,
    );
    gateway.server = {} as never;

    await expect(
      gateway.send({ data: { auth: senderPrincipal } } as never, {
        roomId: "room-1",
        clientMessageId: "client-message-1",
        message: "보내지지 않아야 합니다",
      }),
    ).rejects.toBeInstanceOf(WsException);
    expect(chat.send).not.toHaveBeenCalled();
    expect(chat.entitledMemberIds).not.toHaveBeenCalled();
    expect(chat.blockedInteractionUserIds).not.toHaveBeenCalled();
  });
});
