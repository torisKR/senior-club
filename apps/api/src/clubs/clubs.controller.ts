import { Controller, Get, Header, Param, Query } from "@nestjs/common";

import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  type ClubListQuery,
  clubListQuerySchema,
  clubSlugSchema,
} from "./clubs.contracts";
import { ClubsService } from "./clubs.service";

const PUBLIC_CLUB_CACHE =
  "public, max-age=30, s-maxage=120, stale-while-revalidate=300";

@Controller("v1/clubs")
export class ClubsController {
  constructor(private readonly clubs: ClubsService) {}

  @Get()
  @Header("Cache-Control", PUBLIC_CLUB_CACHE)
  list(
    @Query(new ZodValidationPipe(clubListQuerySchema)) query: ClubListQuery,
  ) {
    return this.clubs.list(query);
  }

  @Get(":slug")
  @Header("Cache-Control", PUBLIC_CLUB_CACHE)
  detail(
    @Param("slug", new ZodValidationPipe(clubSlugSchema)) slug: string,
  ) {
    return this.clubs.detail(slug);
  }
}

