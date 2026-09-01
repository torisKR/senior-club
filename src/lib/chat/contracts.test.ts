import { describe, expect, it } from "vitest";

import {
  chatMessageListEndpoint,
  chatRoomListEndpoint,
  parseChatMessageListQuery,
  parseChatRoomListQuery,
  parseEmptyJsonObject,
  parseSendChatMessageBody,
  readChatJsonBody,
  validateChatRoomId,
} from "@/lib/chat/contracts";

describe("chat BFF contracts", () => {
  it("accepts only a bounded canonical room cursor query", () => {
    expect(
      parseChatRoomListQuery(
        "https://seniorclub.example/api/chat/rooms?limit=50&cursor=cm9vbV9wYWdl",
      ),
    ).toEqual({ limit: 50, cursor: "cm9vbV9wYWdl" });
    expect(
      chatRoomListEndpoint({ limit: 50, cursor: "cm9vbV9wYWdl" }),
    ).toBe("/v1/chat/rooms?limit=50&cursor=cm9vbV9wYWdl");
    expect(() =>
      parseChatRoomListQuery(
        "https://seniorclub.example/api/chat/rooms?limit=51",
      ),
    ).toThrow();
    expect(() =>
      parseChatRoomListQuery(
        "https://seniorclub.example/api/chat/rooms?admin=true",
      ),
    ).toThrow();
  });

  it("accepts only bounded room ids and a canonical message cursor query", () => {
    expect(validateChatRoomId("room_A-1")).toBe("room_A-1");
    expect(
      parseChatMessageListQuery(
        "https://seniorclub.example/api/chat/rooms/room-1/messages?limit=25&cursor=YWJjZGVmZ2g",
      ),
    ).toEqual({ limit: 25, cursor: "YWJjZGVmZ2g" });
    expect(
      chatMessageListEndpoint("room_A-1", { limit: 25, cursor: "YWJjZGVmZ2g" }),
    ).toBe(
      "/v1/chat/rooms/room_A-1/messages?limit=25&cursor=YWJjZGVmZ2g",
    );
    expect(
      parseChatMessageListQuery(
        "https://seniorclub.example/api/chat/rooms/room-1/messages?limit=50&after=YWZ0ZXJfMQ",
      ),
    ).toEqual({ limit: 50, after: "YWZ0ZXJfMQ" });
    expect(
      chatMessageListEndpoint("room_A-1", { limit: 50, after: "YWZ0ZXJfMQ" }),
    ).toBe("/v1/chat/rooms/room_A-1/messages?limit=50&after=YWZ0ZXJfMQ");
  });

  it.each([
    ["https://seniorclub.example/api/chat/rooms/x/messages?limit=0"],
    ["https://seniorclub.example/api/chat/rooms/x/messages?limit=10&limit=20"],
    ["https://seniorclub.example/api/chat/rooms/x/messages?cursor=../../etc"],
    ["https://seniorclub.example/api/chat/rooms/x/messages?after=../../etc"],
    [
      "https://seniorclub.example/api/chat/rooms/x/messages?cursor=YWJjZGVmZ2g&after=YWZ0ZXJfMQ",
    ],
    ["https://seniorclub.example/api/chat/rooms/x/messages?unknown=true"],
  ])("rejects an unsafe or ambiguous query: %s", (url) => {
    expect(() => parseChatMessageListQuery(url)).toThrow();
  });

  it("normalizes a strict UUID-keyed send body", () => {
    expect(
      parseSendChatMessageBody({
        clientMessageId: "49e84d7e-7251-4f39-8410-7dbb444cf7f9",
        message: "  안녕하세요  ",
      }),
    ).toEqual({
      clientMessageId: "49e84d7e-7251-4f39-8410-7dbb444cf7f9",
      message: "안녕하세요",
    });
  });

  it("rejects unknown send fields, non-UUID keys, unsafe room paths, and non-empty read bodies", () => {
    expect(() =>
      parseSendChatMessageBody({
        clientMessageId: "not-a-uuid",
        message: "안녕하세요",
      }),
    ).toThrow();
    expect(() =>
      parseSendChatMessageBody({
        clientMessageId: "49e84d7e-7251-4f39-8410-7dbb444cf7f9",
        message: "안녕하세요",
        admin: true,
      }),
    ).toThrow();
    expect(() => validateChatRoomId("room%2Fadmin")).toThrow();
    expect(() => parseEmptyJsonObject({ extra: true })).toThrow();
    expect(parseEmptyJsonObject({})).toEqual({});
  });

  it("classifies malformed JSON as a client request error", async () => {
    await expect(
      readChatJsonBody(
        new Request("https://seniorclub.example/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{not-json",
        }),
      ),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_JSON" });
  });
});
