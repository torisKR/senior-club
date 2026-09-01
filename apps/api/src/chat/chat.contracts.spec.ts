import { describe, expect, it } from "vitest";

import {
  chatMessageListQuerySchema,
  chatRoomListQuerySchema,
} from "./chat.contracts";

describe("chat request contracts", () => {
  it("supports bounded room pagination", () => {
    expect(chatRoomListQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(
      chatRoomListQuerySchema.parse({ limit: "50", cursor: "room_cursor_123" }),
    ).toEqual({ limit: 50, cursor: "room_cursor_123" });
    expect(() => chatRoomListQuerySchema.parse({ limit: 51 })).toThrow();
    expect(() => chatRoomListQuerySchema.parse({ page: 2 })).toThrow();
  });

  it("supports bounded older and forward message queries", () => {
    expect(chatMessageListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(
      chatMessageListQuerySchema.parse({
        limit: "100",
        cursor: "older_cursor_123",
      }),
    ).toEqual({ limit: 100, cursor: "older_cursor_123" });
    expect(
      chatMessageListQuerySchema.parse({ after: "after_cursor_123" }),
    ).toEqual({ limit: 50, after: "after_cursor_123" });
  });

  it("rejects ambiguous, unbounded, and unknown message queries", () => {
    expect(() =>
      chatMessageListQuerySchema.parse({
        cursor: "older_cursor_123",
        after: "after_cursor_123",
      }),
    ).toThrow();
    expect(() => chatMessageListQuerySchema.parse({ limit: 101 })).toThrow();
    expect(() => chatMessageListQuerySchema.parse({ after: "short" })).toThrow();
    expect(() => chatMessageListQuerySchema.parse({ direction: "asc" })).toThrow();
  });
});
