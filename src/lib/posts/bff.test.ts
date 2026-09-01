import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let parseClubSlug: typeof import("./bff").parseClubSlug;
let parsePostId: typeof import("./bff").parsePostId;
let parseCreatePostRequest: typeof import("./bff").parseCreatePostRequest;
let parseUpdatePostRequest: typeof import("./bff").parseUpdatePostRequest;
let parseCreateCommentRequest: typeof import("./bff").parseCreateCommentRequest;
let parseUpdateCommentRequest: typeof import("./bff").parseUpdateCommentRequest;

function jsonRequest(body: unknown) {
  return new Request("https://seniorclub.example/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  ({
    parseClubSlug,
    parsePostId,
    parseCreatePostRequest,
    parseUpdatePostRequest,
    parseCreateCommentRequest,
    parseUpdateCommentRequest,
  } = await import("./bff"));
});

describe("posts BFF request contracts", () => {
  it("normalizes a strict create-post payload", async () => {
    await expect(
      parseCreatePostRequest(
        jsonRequest({
          title: "  함께   걷고 싶은 길  ",
          content: "  다음 모임에서 함께 걷고 싶은 길을 나눠 주세요.  ",
        }),
      ),
    ).resolves.toEqual({
      title: "함께 걷고 싶은 길",
      content: "다음 모임에서 함께 걷고 싶은 길을 나눠 주세요.",
    });
  });

  it.each([
    { title: "한", content: "충분히 긴 게시글 본문입니다." },
    { title: "올바른 제목", content: "짧음" },
    {
      title: "올바른 제목",
      content: "충분히 긴 게시글 본문입니다.",
      userId: "other-user",
    },
  ])("rejects an invalid or over-posted create payload", async (body) => {
    await expect(parseCreatePostRequest(jsonRequest(body))).rejects.toMatchObject({
      status: 400,
      code: "INVALID_POST",
    });
  });

  it("rejects malformed JSON with the shared error contract", async () => {
    const request = new Request("https://seniorclub.example/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    await expect(parseCreatePostRequest(request)).rejects.toMatchObject({
      status: 400,
      code: "INVALID_JSON",
    });
  });

  it("accepts one-level comment targets and rejects unknown or unsafe fields", async () => {
    await expect(
      parseCreateCommentRequest(
        jsonRequest({ content: "  함께 가고 싶습니다.  ", parentId: "comment-1" }),
      ),
    ).resolves.toEqual({
      content: "함께 가고 싶습니다.",
      parentId: "comment-1",
    });

    await expect(
      parseCreateCommentRequest(
        jsonRequest({ content: "함께 가요.", parentId: "../comment" }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_COMMENT" });
    await expect(
      parseCreateCommentRequest(
        jsonRequest({ content: "함께 가요.", postId: "post-2" }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_COMMENT" });
  });

  it("requires a real update field and validates comment updates", async () => {
    await expect(parseUpdatePostRequest(jsonRequest({}))).rejects.toMatchObject({
      code: "INVALID_POST",
    });
    await expect(
      parseUpdatePostRequest(jsonRequest({ title: "  새   제목  " })),
    ).resolves.toEqual({ title: "새 제목" });
    await expect(
      parseUpdateCommentRequest(jsonRequest({ content: "  수정한 댓글  " })),
    ).resolves.toEqual({ content: "수정한 댓글" });
  });

  it("fails closed for unsafe route identifiers", () => {
    expect(parseClubSlug("forest-walkers")).toBe("forest-walkers");
    expect(parseClubSlug("Forest-Walkers")).toBeNull();
    expect(parseClubSlug("../admin")).toBeNull();
    expect(parsePostId("post:2026-01")).toBe("post:2026-01");
    expect(parsePostId("../post")).toBeNull();
    expect(parsePostId("x".repeat(129))).toBeNull();
  });
});
