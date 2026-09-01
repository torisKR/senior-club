import "reflect-metadata";

import { GUARDS_METADATA, HEADERS_METADATA } from "@nestjs/common/constants";
import { describe, expect, it, vi } from "vitest";

import { AccessTokenGuard } from "../auth/access-token.guard";
import {
  ApprovalMode,
  EventDifficulty,
  UserRole,
} from "../generated/prisma/client";
import {
  EventManagementController,
  LeaderClubsController,
  LeaderEventsController,
} from "./events.controller";
import type { EventsService } from "./events.service";

const principal = {
  userId: "leader-1",
  sessionId: "session-1",
  role: UserRole.LEADER,
};

const createInput = {
  clubId: "club-1",
  title: "북한산 둘레길 걷기",
  description: "천천히 걸으며 북한산 풍경을 함께 감상합니다.",
  locationName: "북한산 안내소",
  address: "서울특별시 은평구 진관동",
  startAt: "2099-08-01T00:00:00.000Z",
  capacity: 20,
  price: 0,
  difficulty: EventDifficulty.EASY,
  approvalMode: ApprovalMode.MANUAL,
  publish: false,
};

describe("event management controller security and caching", () => {
  it("guards all management controllers and makes every response private", () => {
    for (const controller of [
      EventManagementController,
      LeaderEventsController,
      LeaderClubsController,
    ]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
        AccessTokenGuard,
      ]);
    }

    for (const handler of [
      EventManagementController.prototype.create,
      EventManagementController.prototype.update,
      EventManagementController.prototype.publish,
      EventManagementController.prototype.cancel,
      LeaderEventsController.prototype.list,
      LeaderEventsController.prototype.detail,
      LeaderClubsController.prototype.list,
    ]) {
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
        { name: "Cache-Control", value: "private, no-store" },
      ]);
    }
  });

  it("requires a valid idempotency key before delegating create", () => {
    const create = vi.fn().mockReturnValue({ id: "event-1" });
    const controller = new EventManagementController({
      create,
    } as unknown as EventsService);

    expect(() => controller.create(createInput, undefined, principal)).toThrow();
    expect(() => controller.create(createInput, "short", principal)).toThrow();
    expect(() =>
      controller.create(createInput, "a".repeat(161), principal),
    ).toThrow();
    expect(create).not.toHaveBeenCalled();

    expect(
      controller.create(createInput, "event-create-request-1", principal),
    ).toEqual({ id: "event-1" });
    expect(create).toHaveBeenCalledWith(
      createInput,
      principal,
      "event-create-request-1",
    );
  });
});
