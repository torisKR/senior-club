import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { AuthenticatedRequest } from "./access-token.guard";

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().auth,
);
