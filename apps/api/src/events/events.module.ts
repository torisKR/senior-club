import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import {
  ApplicationsController,
  EventManagementController,
  EventsController,
  LeaderClubsController,
  LeaderEventsController,
  MyApplicationsController,
} from "./events.controller";
import { EventsService } from "./events.service";

@Module({
  imports: [AuthModule],
  controllers: [
    EventsController,
    EventManagementController,
    ApplicationsController,
    MyApplicationsController,
    LeaderEventsController,
    LeaderClubsController,
  ],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
