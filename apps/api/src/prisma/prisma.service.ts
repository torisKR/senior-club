import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";
import { API_ENV } from "../config/env.module";
import type { ApiEnv } from "../config/env";
import type { DatabaseHealthProbe } from "./database-health-probe";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements DatabaseHealthProbe, OnModuleDestroy
{
  constructor(@Inject(API_ENV) env: ApiEnv) {
    const adapter = new PrismaPg({
      connectionString: env.DATABASE_URL,
      max: env.DATABASE_POOL_MAX,
      connectionTimeoutMillis: env.DATABASE_CONNECT_TIMEOUT_MS,
      idleTimeoutMillis: env.DATABASE_IDLE_TIMEOUT_MS,
    });

    super({
      adapter,
      log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }

  async ping(): Promise<void> {
    const rows = await this.$queryRaw<Array<{ result: number }>>`
      SELECT 1 AS result
    `;

    if (rows.length !== 1 || Number(rows[0]?.result) !== 1) {
      throw new Error("Unexpected database readiness response");
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
