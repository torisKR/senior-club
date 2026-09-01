import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import { AccessTokenGuard } from "./access-token.guard";
import {
  kakaoLoginSchema,
  refreshSessionSchema,
  requestEmailCodeSchema,
  requestPhoneCodeSchema,
  type KakaoLoginInput,
  type RefreshSessionInput,
  type RequestEmailCodeInput,
  type RequestPhoneCodeInput,
  type VerifyEmailCodeInput,
  type VerifyPhoneCodeInput,
  verifyEmailCodeSchema,
  verifyPhoneCodeSchema,
  type AuthenticatedPrincipal,
} from "./auth.contracts";
import { AuthService } from "./auth.service";
import { CurrentPrincipal } from "./current-principal.decorator";

@Controller("v1/auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("email/request")
  @Header("Cache-Control", "private, no-store")
  requestEmailCode(
    @Body(new ZodValidationPipe(requestEmailCodeSchema))
    input: RequestEmailCodeInput,
  ) {
    return this.auth.requestEmailCode(input);
  }

  @Post("email/verify")
  @Header("Cache-Control", "private, no-store")
  verifyEmailCode(
    @Body(new ZodValidationPipe(verifyEmailCodeSchema))
    input: VerifyEmailCodeInput,
    @Req() request: Request,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.auth.verifyEmailCode(input, {
      ...(userAgent ? { userAgent } : {}),
      ...(request.ip ? { ipAddress: request.ip } : {}),
    });
  }

  @Post("phone/request")
  @Header("Cache-Control", "private, no-store")
  requestPhoneCode(
    @Body(new ZodValidationPipe(requestPhoneCodeSchema))
    input: RequestPhoneCodeInput,
  ) {
    return this.auth.requestPhoneCode(input);
  }

  @Post("phone/verify")
  @Header("Cache-Control", "private, no-store")
  verifyPhoneCode(
    @Body(new ZodValidationPipe(verifyPhoneCodeSchema))
    input: VerifyPhoneCodeInput,
    @Req() request: Request,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.auth.verifyPhoneCode(input, {
      ...(userAgent ? { userAgent } : {}),
      ...(request.ip ? { ipAddress: request.ip } : {}),
    });
  }

  @Post("kakao")
  @Header("Cache-Control", "private, no-store")
  kakaoLogin(
    @Body(new ZodValidationPipe(kakaoLoginSchema)) input: KakaoLoginInput,
    @Req() request: Request,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.auth.loginWithKakao(input, {
      ...(userAgent ? { userAgent } : {}),
      ...(request.ip ? { ipAddress: request.ip } : {}),
    });
  }

  @Post("refresh")
  @Header("Cache-Control", "private, no-store")
  refresh(
    @Body(new ZodValidationPipe(refreshSessionSchema))
    input: RefreshSessionInput,
  ) {
    return this.auth.refreshSession(input.refreshToken);
  }

  @Post("logout")
  @Header("Cache-Control", "private, no-store")
  logout(
    @Body(new ZodValidationPipe(refreshSessionSchema))
    input: RefreshSessionInput,
  ) {
    return this.auth.logout(input.refreshToken);
  }
}

@Controller("v1/me")
@UseGuards(AccessTokenGuard)
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  me(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.auth.getMe(principal);
  }
}
