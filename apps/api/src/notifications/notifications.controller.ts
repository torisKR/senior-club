import {
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  notificationListQuerySchema,
  type NotificationListQuery,
} from "./notifications.contracts";
import { NotificationsService } from "./notifications.service";

@Controller("v1/me/notifications")
@UseGuards(AccessTokenGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(
    @Query(new ZodValidationPipe(notificationListQuerySchema)) query: NotificationListQuery,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.notifications.list(query, principal);
  }

  @Get("unread-count")
  @Header("Cache-Control", "private, no-store")
  unreadCount(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.notifications.unreadCount(principal);
  }

  @Patch(":id/read")
  @Header("Cache-Control", "private, no-store")
  markRead(
    @Param("id") id: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.notifications.markRead(id, principal);
  }

  @Post("read-all")
  @Header("Cache-Control", "private, no-store")
  markAllRead(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.notifications.markAllRead(principal);
  }
}
