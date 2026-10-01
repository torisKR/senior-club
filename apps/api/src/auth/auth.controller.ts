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
  googleLoginSchema,
  kakaoLoginSchema,
  refreshSessionSchema,
  requestEmailCodeSchema,
  requestPhoneCodeSchema,
  type GoogleLoginInput,
  type KakaoLoginInput,
  type RefreshSessionInput,
  type RequestEmailCodeInput,
  type RequestPhoneCodeInput,
  type VerifyEmailCodeInput,
  type VerifyPhoneCodeInput,
  verifyEmailCodeSchema,
  verifyPhoneCodeSchema,
  verifyFirebasePhoneSchema,
  type VerifyFirebasePhoneInput,
  type AuthenticatedPrincipal,
} from "./auth.contracts";
import { AuthService } from "./auth.service";
import { CurrentPrincipal } from "./current-principal.decorator";
import { DisabledLoginGuard } from "./login-policy";

@Controller("v1/auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("email/request")
  @UseGuards(DisabledLoginGuard)
  @Header("Cache-Control", "private, no-store")
  requestEmailCode(
    @Body(new ZodValidationPipe(requestEmailCodeSchema))
    input: RequestEmailCodeInput,
  ) {
    return this.auth.requestEmailCode(input);
  }

  @Post("email/verify")
  @UseGuards(DisabledLoginGuard)
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
  @UseGuards(DisabledLoginGuard)
  @Header("Cache-Control", "private, no-store")
  requestPhoneCode(
    @Body(new ZodValidationPipe(requestPhoneCodeSchema))
    input: RequestPhoneCodeInput,
  ) {
    return this.auth.requestPhoneCode(input);
  }

  @Post("phone/verify")
  @UseGuards(DisabledLoginGuard)
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

  @Post("google")
  @UseGuards(DisabledLoginGuard)
  @Header("Cache-Control", "private, no-store")
  googleLogin(
    @Body(new ZodValidationPipe(googleLoginSchema)) input: GoogleLoginInput,
    @Req() request: Request,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.auth.loginWithGoogle(input, {
      ...(userAgent ? { userAgent } : {}),
      ...(request.ip ? { ipAddress: request.ip } : {}),
    });
  }

  @Post("firebase/verify-phone")
  @UseGuards(AccessTokenGuard)
  @Header("Cache-Control", "private, no-store")
  verifyFirebasePhone(
    @Body(new ZodValidationPipe(verifyFirebasePhoneSchema))
    input: VerifyFirebasePhoneInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.auth.verifyAndLinkFirebasePhone(
      principal.userId,
      input.idToken,
    );
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
