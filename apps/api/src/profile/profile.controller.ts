import { Body, Controller, Get, Header, Patch, UseGuards } from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  type UpdateProfileInput,
  updateProfileSchema,
} from "./profile.contracts";
import { ProfileService } from "./profile.service";

@Controller("v1")
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get("interests")
  @Header(
    "Cache-Control",
    "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  )
  interests() {
    return this.profiles.listInterests();
  }

  @Patch("me/profile")
  @UseGuards(AccessTokenGuard)
  @Header("Cache-Control", "private, no-store")
  updateProfile(
    @Body(new ZodValidationPipe(updateProfileSchema)) input: UpdateProfileInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.profiles.updateProfile(input, principal);
  }
}
