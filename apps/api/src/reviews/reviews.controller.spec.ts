import "reflect-metadata";

import { GUARDS_METADATA, HEADERS_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";

import { AccessTokenGuard } from "../auth/access-token.guard";
import {
  EventReviewsController,
  ReviewsController,
} from "./reviews.controller";

describe("review controller security and caching", () => {
  it("makes only the published review feed publicly cacheable", () => {
    expect(
      Reflect.getMetadata(
        HEADERS_METADATA,
        EventReviewsController.prototype.list,
      ),
    ).toEqual([
      {
        name: "Cache-Control",
        value:
          "public, max-age=30, s-maxage=120, stale-while-revalidate=300",
      },
    ]);
  });

  it("protects owner reads and mutations and marks their responses private", () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        EventReviewsController.prototype.mine,
      ),
    ).toEqual([AccessTokenGuard]);
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        EventReviewsController.prototype.create,
      ),
    ).toEqual([AccessTokenGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA, ReviewsController)).toEqual([
      AccessTokenGuard,
    ]);

    for (const handler of [
      EventReviewsController.prototype.mine,
      EventReviewsController.prototype.create,
      ReviewsController.prototype.update,
      ReviewsController.prototype.remove,
    ]) {
      expect(
        Reflect.getMetadata(HEADERS_METADATA, handler),
      ).toEqual([{ name: "Cache-Control", value: "private, no-store" }]);
    }
  });
});
