import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";

import type { ApiEnv } from "../config/env";
import { API_ENV } from "../config/env.module";
import { AccountDeletionService } from "./account-deletion.service";

export const ACCOUNT_DELETION_BATCH_SIZE = 25;

@Injectable()
export class AccountDeletionWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AccountDeletionWorker.name);
  private interval: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    private readonly deletions: AccountDeletionService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  onApplicationBootstrap() {
    if (!this.env.OUTBOX_WORKER_ENABLED) return;
    this.interval = setInterval(
      () => this.scheduleDrain(),
      this.env.ACCOUNT_DELETION_POLL_INTERVAL_MS,
    );
    this.interval.unref();
    this.scheduleDrain();
  }

  onApplicationShutdown() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  async drainOnce() {
    if (this.processing) return 0;
    this.processing = true;
    try {
      let processed = 0;
      while (
        processed < ACCOUNT_DELETION_BATCH_SIZE &&
        (await this.deletions.processNext())
      ) {
        processed += 1;
      }
      return processed;
    } finally {
      this.processing = false;
    }
  }

  private scheduleDrain() {
    void this.drainOnce().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Account deletion drain failed: ${message}`);
    });
  }
}
