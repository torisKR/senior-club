import "reflect-metadata";

import { GUARDS_METADATA, HEADERS_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";

import { AccessTokenGuard } from "../auth/access-token.guard";
import {
  ClubPostsController,
  CommentsController,
  PostsController,
} from "./posts.controller";

describe("post controller security and caching", () => {
  it("makes only public feeds and details publicly cacheable", () => {
    for (const handler of [
      ClubPostsController.prototype.list,
      PostsController.prototype.detail,
      PostsController.prototype.comments,
    ]) {
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
        {
          name: "Cache-Control",
          value:
            "public, max-age=30, s-maxage=120, stale-while-revalidate=300",
        },
      ]);
    }
  });

  it("guards every mutation and marks it private no-store", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CommentsController)).toEqual([
      AccessTokenGuard,
    ]);
    for (const handler of [
      ClubPostsController.prototype.create,
      PostsController.prototype.createComment,
      PostsController.prototype.update,
      PostsController.prototype.remove,
    ]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        AccessTokenGuard,
      ]);
    }
    for (const handler of [
      ClubPostsController.prototype.create,
      PostsController.prototype.createComment,
      PostsController.prototype.update,
      PostsController.prototype.remove,
      CommentsController.prototype.update,
      CommentsController.prototype.remove,
    ]) {
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
        { name: "Cache-Control", value: "private, no-store" },
      ]);
    }
  });
});
