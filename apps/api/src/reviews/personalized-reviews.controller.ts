import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  eventReviewsParamsSchema,
  type EventReviewsParams,
  reviewListQuerySchema,
  type ReviewListQuery,
} from "./reviews.contracts";
import { ReviewsService } from "./reviews.service";

@Controller("v1/me/events")
@UseGuards(AccessTokenGuard)
export class PersonalizedEventReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get(":eventId/reviews")
  @Header("Cache-Control", "private, no-store")
  list(
    @Param(new ZodValidationPipe(eventReviewsParamsSchema))
    params: EventReviewsParams,
    @Query(new ZodValidationPipe(reviewListQuerySchema)) query: ReviewListQuery,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.reviews.list(params.eventId, query, principal.userId);
  }
}
