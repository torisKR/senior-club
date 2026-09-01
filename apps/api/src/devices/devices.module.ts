import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import {
  DevicesController,
  NotificationPreferencesController,
} from "./devices.controller";
import { DevicesService } from "./devices.service";

@Module({
  imports: [AuthModule],
  controllers: [DevicesController, NotificationPreferencesController],
  providers: [DevicesService],
})
export class DevicesModule {}
