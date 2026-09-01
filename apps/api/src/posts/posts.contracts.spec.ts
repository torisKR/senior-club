import { describe, expect, it } from "vitest";

import {
  clubPostsParamsSchema,
  commentFeedQuerySchema,
  createCommentSchema,
  createPostSchema,
  postFeedQuerySchema,
  updatePostSchema,
} from "./posts.contracts";

describe("post and comment contracts", () => {
  it("normalizes valid post input and applies bounded feed defaults", () => {
    expect(
      createPostSchema.parse({
        title: "  숲길   준비물 ",
        content: "  다음 모임에 필요한 준비물을 함께 확인해요.  ",
      }),
    ).toEqual({
      title: "숲길 준비물",
      content: "다음 모임에 필요한 준비물을 함께 확인해요.",
    });
    expect(postFeedQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(commentFeedQuerySchema.parse({ limit: "7" })).toEqual({ limit: 7 });
  });

  it("rejects unknown fields, unsafe slugs, and out-of-range content", () => {
    expect(() =>
      clubPostsParamsSchema.parse({ slug: "../admin" }),
    ).toThrow();
    expect(() => postFeedQuerySchema.parse({ limit: 21 })).toThrow();
    expect(() =>
      createPostSchema.parse({ title: "한", content: "충분하지 않음" }),
    ).toThrow();
    expect(() =>
      createPostSchema.parse({
        title: "정상 제목",
        content: "충분히 긴 게시글 본문입니다.",
        status: "PUBLISHED",
      }),
    ).toThrow();
    expect(() => createCommentSchema.parse({ content: "한" })).toThrow();
  });

  it("requires at least one editable post field", () => {
    expect(() => updatePostSchema.parse({})).toThrow();
    expect(updatePostSchema.parse({ title: "수정 제목" })).toEqual({
      title: "수정 제목",
    });
  });
});
