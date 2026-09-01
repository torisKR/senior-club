import { describe, expect, it, vi } from "vitest";

import type { ApiEnv } from "../config/env";
import type { AccountDeletionService } from "./account-deletion.service";
import {
  ACCOUNT_DELETION_BATCH_SIZE,
  AccountDeletionWorker,
} from "./account-deletion.worker";

function createHarness(results: boolean[], enabled = true) {
  const processNext = vi.fn();
  for (const result of results) processNext.mockResolvedValueOnce(result);
  processNext.mockResolvedValue(false);
  const deletions = { processNext } as unknown as AccountDeletionService;
  const env = {
    OUTBOX_WORKER_ENABLED: enabled,
    OUTBOX_POLL_INTERVAL_MS: 5_000,
    ACCOUNT_DELETION_POLL_INTERVAL_MS: 300_000,
  } as unknown as ApiEnv;
  const worker = new AccountDeletionWorker(deletions, env);
  return { worker, processNext };
}

async function flushScheduledDrain() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("AccountDeletionWorker", () => {
  it("checks immediately and then uses the dedicated low-frequency interval", async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness([false, false]);
      harness.worker.onApplicationBootstrap();

      await flushScheduledDrain();
      expect(harness.processNext).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(299_999);
      expect(harness.processNext).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(harness.processNext).toHaveBeenCalledTimes(2);

      harness.worker.onApplicationShutdown();
    } finally {
      vi.useRealTimers();
    }
  });

  it("drains a bounded batch so a longer poll interval cannot create backlog", async () => {
    const harness = createHarness(
      Array.from({ length: ACCOUNT_DELETION_BATCH_SIZE + 1 }, () => true),
    );

    await expect(harness.worker.drainOnce()).resolves.toBe(
      ACCOUNT_DELETION_BATCH_SIZE,
    );
    expect(harness.processNext).toHaveBeenCalledTimes(
      ACCOUNT_DELETION_BATCH_SIZE,
    );
  });

  it("does not schedule work when workers are disabled", async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness([], false);
      harness.worker.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(600_000);
      expect(harness.processNext).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
