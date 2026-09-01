import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import { ApiException } from "../common/http/api.exception";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  applicationDecisionSchema,
  type ApplicationDecisionInput,
  attendanceUpdateSchema,
  type AttendanceUpdateInput,
  createEventSchema,
  type CreateEventInput,
  eventListQuerySchema,
  type EventListQuery,
  IDEMPOTENCY_KEY_PATTERN,
  leaderApplicationListQuerySchema,
  type LeaderApplicationListQuery,
  managedClubListQuerySchema,
  type ManagedClubListQuery,
  managedEventListQuerySchema,
  type ManagedEventListQuery,
  updateEventSchema,
  type UpdateEventInput,
} from "./events.contracts";
import { EventsService } from "./events.service";

@Controller("v1/events")
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @Header("Cache-Control", "public, max-age=30, s-maxage=120, stale-while-revalidate=300")
  list(
    @Query(new ZodValidationPipe(eventListQuerySchema)) query: EventListQuery,
  ) {
    return this.events.list(query);
  }

  @Get(":id")
  @Header("Cache-Control", "public, max-age=30, s-maxage=120, stale-while-revalidate=300")
  detail(@Param("id") id: string) {
    return this.events.detail(id);
  }

  @Post(":id/applications")
  @UseGuards(AccessTokenGuard)
  @Header("Cache-Control", "private, no-store")
  apply(
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "IDEMPOTENCY_KEY_REQUIRED",
        "안전한 신청 처리를 위해 요청 식별자가 필요합니다.",
      );
    }
    return this.events.apply(id, principal, idempotencyKey);
  }

  @Delete(":id/applications/me")
  @UseGuards(AccessTokenGuard)
  @Header("Cache-Control", "private, no-store")
  cancel(
    @Param("id") id: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.events.cancel(id, principal);
  }

  @Get(":id/applications/me")
  @UseGuards(AccessTokenGuard)
  @Header("Cache-Control", "private, no-store")
  myApplication(
    @Param("id") id: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.events.myApplication(id, principal);
  }

  @Get(":id/applications")
  @UseGuards(AccessTokenGuard)
  @Header("Cache-Control", "private, no-store")
  applications(
    @Param("id") id: string,
    @Query(new ZodValidationPipe(leaderApplicationListQuerySchema))
    query: LeaderApplicationListQuery,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.events.leaderApplications(id, principal, query);
  }
}

@Controller("v1/events")
@UseGuards(AccessTokenGuard)
export class EventManagementController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @Header("Cache-Control", "private, no-store")
  create(
    @Body(new ZodValidationPipe(createEventSchema)) input: CreateEventInput,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "IDEMPOTENCY_KEY_REQUIRED",
        "안전한 모임 생성을 위해 요청 식별자가 필요합니다.",
      );
    }
    return this.events.create(input, principal, idempotencyKey);
  }

  @Patch(":id")
  @Header("Cache-Control", "private, no-store")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateEventSchema)) input: UpdateEventInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.events.update(id, input, principal);
  }

  @Post(":id/publish")
  @Header("Cache-Control", "private, no-store")
  publish(
    @Param("id") id: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.events.publish(id, principal);
  }

  @Post(":id/cancel")
  @Header("Cache-Control", "private, no-store")
  cancel(
    @Param("id") id: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.events.cancelEvent(id, principal);
  }
}

@Controller("v1/leader/events")
@UseGuards(AccessTokenGuard)
export class LeaderEventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(
    @Query(new ZodValidationPipe(managedEventListQuerySchema))
    query: ManagedEventListQuery,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.events.managedEvents(principal, query);
  }

  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  detail(
    @Param("id") id: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.events.managedDetail(id, principal);
  }
}

@Controller("v1/leader/clubs")
@UseGuards(AccessTokenGuard)
export class LeaderClubsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(
    @Query(new ZodValidationPipe(managedClubListQuerySchema))
    query: ManagedClubListQuery,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.events.managedClubs(principal, query);
  }
}

@Controller("v1/applications")
@UseGuards(AccessTokenGuard)
export class ApplicationsController {
  constructor(private readonly events: EventsService) {}

  @Patch(":id")
  @Header("Cache-Control", "private, no-store")
  decide(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(applicationDecisionSchema))
    input: ApplicationDecisionInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.events.decide(id, input, principal);
  }

  @Patch(":id/attendance")
  @Header("Cache-Control", "private, no-store")
  attendance(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(attendanceUpdateSchema))
    input: AttendanceUpdateInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.events.markAttendance(id, input, principal);
  }
}

@Controller("v1/me/applications")
@UseGuards(AccessTokenGuard)
export class MyApplicationsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.events.myApplications(principal);
  }
}
