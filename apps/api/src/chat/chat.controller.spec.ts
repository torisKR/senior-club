import "reflect-metadata";

import { GUARDS_METADATA, HEADERS_METADATA } from "@nestjs/common/constants";
import { describe, expect, it, vi } from "vitest";

import { AccessTokenGuard } from "../auth/access-token.guard";
import { UserRole } from "../generated/prisma/client";
import { ChatController } from "./chat.controller";
import type { ChatService } from "./chat.service";

const principal = {
  userId: "member-1",
  sessionId: "session-1",
  role: UserRole.MEMBER,
};

describe("chat controller", () => {
  it("guards every endpoint and disables private response caching", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ChatController)).toEqual([
      AccessTokenGuard,
    ]);
    for (const handler of [
      ChatController.prototype.rooms,
      ChatController.prototype.messages,
      ChatController.prototype.send,
      ChatController.prototype.markRead,
    ]) {
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
        { name: "Cache-Control", value: "private, no-store" },
      ]);
    }
  });

  it("passes the validated forward watermark to the message service", () => {
    const messages = vi.fn().mockReturnValue({ data: [], page: {} });
    const controller = new ChatController({
      messages,
    } as unknown as ChatService);
    const query = { limit: 50, after: "forward_cursor_123" };

    expect(controller.messages("room-1", query, principal)).toEqual({
      data: [],
      page: {},
    });
    expect(messages).toHaveBeenCalledWith("room-1", query, principal);
  });

  it("passes the validated room page query to the service", () => {
    const rooms = vi.fn().mockReturnValue({ data: [], page: {} });
    const controller = new ChatController({ rooms } as unknown as ChatService);
    const query = { limit: 20, cursor: "room_cursor_123" };

    expect(controller.rooms(query, principal)).toEqual({ data: [], page: {} });
    expect(rooms).toHaveBeenCalledWith(query, principal);
  });
});
