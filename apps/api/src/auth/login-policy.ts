import { type CanActivate, HttpStatus, Injectable } from "@nestjs/common";

import { ApiException } from "../common/http/api.exception";

// Applies to new logins only. Existing sessions and authenticated profile
// verification remain available regardless of their original login provider.
export const loginPolicy = {
  assertAllowed(provider: "kakao" | "google" | "email" | "phone") {
    if (provider === "kakao") return;
    throw new ApiException(
      HttpStatus.FORBIDDEN,
      "AUTH_PROVIDER_DISABLED",
      "카카오 로그인만 사용할 수 있습니다.",
    );
  },
};

@Injectable()
export class DisabledLoginGuard implements CanActivate {
  canActivate(): boolean {
    // Guards run before body validation: even malformed legacy requests receive
    // the same policy error and never reach token verification or the database.
    loginPolicy.assertAllowed("email");
    return true;
  }
}
