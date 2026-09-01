import { Global, Module } from "@nestjs/common";

import { DATABASE_HEALTH_PROBE } from "./database-health-probe";
import { PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: DATABASE_HEALTH_PROBE,
      useExisting: PrismaService,
    },
  ],
  exports: [PrismaService, DATABASE_HEALTH_PROBE],
})
export class PrismaModule {}

