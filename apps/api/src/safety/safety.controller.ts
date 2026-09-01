import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  createBlockSchema,
  type CreateBlockInput,
  createReportSchema,
  type CreateReportInput,
  resolveReportSchema,
  type ResolveReportInput,
} from "./safety.contracts";
import { SafetyService } from "./safety.service";

@Controller("v1")
@UseGuards(AccessTokenGuard)
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Post("reports")
  @Header("Cache-Control", "private, no-store")
  report(
    @Body(new ZodValidationPipe(createReportSchema)) input: CreateReportInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.safety.report(input, principal);
  }

  @Get("me/blocks")
  @Header("Cache-Control", "private, no-store")
  blocks(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.safety.blocks(principal);
  }

  @Post("me/blocks")
  @Header("Cache-Control", "private, no-store")
  block(
    @Body(new ZodValidationPipe(createBlockSchema)) input: CreateBlockInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.safety.block(input, principal);
  }

  @Delete("me/blocks/:userId")
  @Header("Cache-Control", "private, no-store")
  unblock(
    @Param("userId") userId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.safety.unblock(userId, principal);
  }

  @Get("admin/reports")
  @Header("Cache-Control", "private, no-store")
  adminReports(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.safety.adminReports(principal);
  }

  @Patch("admin/reports/:id")
  @Header("Cache-Control", "private, no-store")
  resolve(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(resolveReportSchema)) input: ResolveReportInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.safety.resolve(id, input, principal);
  }
}
