import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Post,
  UseGuards,
} from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  requestAccountDeletionSchema,
  type RequestAccountDeletionInput,
} from "./account.contracts";
import { AccountDeletionService } from "./account-deletion.service";

@Controller("v1/me/deletion-request")
@UseGuards(AccessTokenGuard)
export class AccountController {
  constructor(private readonly deletions: AccountDeletionService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  async current(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { deletionRequest: await this.deletions.current(principal) };
  }

  @Post()
  @Header("Cache-Control", "private, no-store")
  request(
    @Body(new ZodValidationPipe(requestAccountDeletionSchema))
    input: RequestAccountDeletionInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.deletions.request(input, principal);
  }

  @Delete()
  @Header("Cache-Control", "private, no-store")
  cancel(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.deletions.cancel(principal);
  }
}
