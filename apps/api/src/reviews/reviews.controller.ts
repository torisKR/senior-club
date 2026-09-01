import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  createReviewSchema,
  type CreateReviewInput,
  eventReviewsParamsSchema,
  type EventReviewsParams,
  reviewListQuerySchema,
  type ReviewListQuery,
  reviewParamsSchema,
  type ReviewParams,
  updateReviewSchema,
  type UpdateReviewInput,
} from "./reviews.contracts";
import { ReviewsService } from "./reviews.service";

const PUBLIC_REVIEW_CACHE =
  "public, max-age=30, s-maxage=120, stale-while-revalidate=300";

@Controller("v1/events")
export class EventReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get(":eventId/reviews")
  @Header("Cache-Control", PUBLIC_REVIEW_CACHE)
  list(
    @Param(new ZodValidationPipe(eventReviewsParamsSchema))
    params: EventReviewsParams,
    @Query(new ZodValidationPipe(reviewListQuerySchema)) query: ReviewListQuery,
  ) {
    return this.reviews.list(params.eventId, query);
  }

  @Get(":eventId/reviews/me")
  @UseGuards(AccessTokenGuard)
  @Header("Cache-Control", "private, no-store")
  mine(
    @Param(new ZodValidationPipe(eventReviewsParamsSchema))
    params: EventReviewsParams,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.reviews.mine(params.eventId, principal);
  }

  @Post(":eventId/reviews")
  @UseGuards(AccessTokenGuard)
  @Header("Cache-Control", "private, no-store")
  create(
    @Param(new ZodValidationPipe(eventReviewsParamsSchema))
    params: EventReviewsParams,
    @Body(new ZodValidationPipe(createReviewSchema)) input: CreateReviewInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.reviews.create(params.eventId, input, principal);
  }
}

@Controller("v1/reviews")
@UseGuards(AccessTokenGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Patch(":id")
  @Header("Cache-Control", "private, no-store")
  update(
    @Param(new ZodValidationPipe(reviewParamsSchema)) params: ReviewParams,
    @Body(new ZodValidationPipe(updateReviewSchema)) input: UpdateReviewInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.reviews.update(params.id, input, principal);
  }

  @Delete(":id")
  @Header("Cache-Control", "private, no-store")
  remove(
    @Param(new ZodValidationPipe(reviewParamsSchema)) params: ReviewParams,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.reviews.remove(params.id, principal);
  }
}
