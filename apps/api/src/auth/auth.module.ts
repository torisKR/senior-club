import { Module } from "@nestjs/common";

import { AccessTokenGuard } from "./access-token.guard";
import { AuthController, MeController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { GoogleTokenVerifier } from "./google-token-verifier";
import { KakaoTokenVerifier } from "./kakao-token-verifier";
import { FirebasePhoneService } from "./firebase-phone.service";
import { TokenService } from "./token.service";
import { DisabledLoginGuard } from "./login-policy";

@Module({
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    TokenService,
    KakaoTokenVerifier,
    GoogleTokenVerifier,
    FirebasePhoneService,
    AccessTokenGuard,
    DisabledLoginGuard,
  ],
  exports: [AuthService, TokenService, FirebasePhoneService, AccessTokenGuard],
})
export class AuthModule {}
