import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PersonalizedEventReviewsController } from "./personalized-reviews.controller";
import {
  EventReviewsController,
  ReviewsController,
} from "./reviews.controller";
import { ReviewsService } from "./reviews.service";

@Module({
  imports: [AuthModule],
  controllers: [
    EventReviewsController,
    PersonalizedEventReviewsController,
    ReviewsController,
  ],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
