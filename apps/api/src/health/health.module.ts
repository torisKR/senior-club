import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { HealthController } from "./health.controller";
import { ReadinessService } from "./readiness.service";

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [ReadinessService],
})
export class HealthModule {}

