import { Module } from "@nestjs/common";

import { AccessTokenGuard } from "./access-token.guard";
import { AuthController, MeController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { KakaoTokenVerifier } from "./kakao-token-verifier";
import { TokenService } from "./token.service";

@Module({
  controllers: [AuthController, MeController],
  providers: [AuthService, TokenService, KakaoTokenVerifier, AccessTokenGuard],
  exports: [AuthService, TokenService, AccessTokenGuard],
})
export class AuthModule {}
