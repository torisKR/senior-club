import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";

import { ApiException } from "../common/http/api.exception";
import { UserStatus } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedPrincipal } from "./auth.contracts";
import { TokenService } from "./token.service";

export type AuthenticatedRequest = Request & {
  auth?: AuthenticatedPrincipal;
};

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization ?? "");
    if (!match?.[1]) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "AUTHENTICATION_REQUIRED",
        "로그인이 필요합니다.",
      );
    }

    try {
      const principal = await this.tokens.verifyAccessToken(match[1]);
      const session = await this.prisma.authSession.findUnique({
        where: { id: principal.sessionId },
        select: {
          userId: true,
          revokedAt: true,
          expiresAt: true,
          user: { select: { role: true, status: true } },
        },
      });
      if (
        !session ||
        session.userId !== principal.userId ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        session.user.status !== UserStatus.ACTIVE
      ) {
        throw new Error("Inactive session");
      }

      request.auth = { ...principal, role: session.user.role };
      return true;
    } catch {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "INVALID_SESSION",
        "로그인 시간이 만료되었습니다. 다시 로그인해 주세요.",
      );
    }
  }
}
