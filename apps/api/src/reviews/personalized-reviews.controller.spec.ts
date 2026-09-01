import "reflect-metadata";

import { RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { describe, expect, it, vi } from "vitest";

import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { UserRole } from "../generated/prisma/client";
import { reviewListQuerySchema } from "./reviews.contracts";
import { PersonalizedEventReviewsController } from "./personalized-reviews.controller";
import type { ReviewsService } from "./reviews.service";

describe("personalized review controller", () => {
  it("exposes the authenticated no-store review feed at the dedicated route", () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, PersonalizedEventReviewsController),
    ).toBe("v1/me/events");
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        PersonalizedEventReviewsController.prototype.list,
      ),
    ).toBe(":eventId/reviews");
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        PersonalizedEventReviewsController.prototype.list,
      ),
    ).toBe(RequestMethod.GET);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PersonalizedEventReviewsController),
    ).toEqual([AccessTokenGuard]);
    expect(
      Reflect.getMetadata(
        HEADERS_METADATA,
        PersonalizedEventReviewsController.prototype.list,
      ),
    ).toEqual([{ name: "Cache-Control", value: "private, no-store" }]);
  });

  it("scopes the service query to the authenticated user", async () => {
    const list = vi.fn().mockResolvedValue({ data: [] });
    const controller = new PersonalizedEventReviewsController({
      list,
    } as unknown as ReviewsService);
    const query = reviewListQuerySchema.parse({ limit: 10 });
    const principal: AuthenticatedPrincipal = {
      userId: "member-1",
      sessionId: "session-1",
      role: UserRole.MEMBER,
    };

    await expect(
      controller.list({ eventId: "event-1" }, query, principal),
    ).resolves.toEqual({ data: [] });
    expect(list).toHaveBeenCalledWith("event-1", query, "member-1");
  });
});
