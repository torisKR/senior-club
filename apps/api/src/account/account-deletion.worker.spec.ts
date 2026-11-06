import { Logger } from "@nestjs/common";
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

  it("prevents overlapping drains and releases the guard after a failure", async () => {
    const harness = createHarness([]);
    let reject!: (reason: unknown) => void;
    harness.processNext.mockImplementationOnce(() => new Promise<boolean>((_, fail) => {
      reject = fail;
    }));
    const first = harness.worker.drainOnce();
    await expect(harness.worker.drainOnce()).resolves.toBe(0);
    expect(harness.processNext).toHaveBeenCalledTimes(1);
    const rejected = expect(first).rejects.toThrow("database unavailable");
    reject(new Error("database unavailable"));
    await rejected;
    await expect(harness.worker.drainOnce()).resolves.toBe(0);
    expect(harness.processNext).toHaveBeenCalledTimes(2);
  });

  it.each([
    Object.assign(new Error("token=secret phone=+821012345678"), { name: "Private member name" }),
    "raw token=secret",
    { code: "Private member name", phoneNumber: "+821012345678" },
  ])("logs only a fixed safe code for a rejected scheduled drain (%#)", async (error) => {
    vi.useFakeTimers();
    const log = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const harness = createHarness([]);
    try {
      harness.processNext.mockRejectedValueOnce(error);
      harness.worker.onApplicationBootstrap();
      await flushScheduledDrain();
      expect(log).toHaveBeenCalledExactlyOnceWith("ACCOUNT_DELETION_DRAIN_FAILED");
      await vi.advanceTimersByTimeAsync(300_000);
      expect(harness.processNext).toHaveBeenCalledTimes(2);
    } finally {
      harness.worker.onApplicationShutdown();
      log.mockRestore();
      vi.useRealTimers();
    }
  });

  it("does not inspect fields on an untrusted thrown value", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const readField = vi.fn(() => "sensitive value");
    const error = Object.defineProperties({}, {
      name: { get: readField },
      message: { get: readField },
      code: { get: readField },
    });
    const harness = createHarness([]);
    try {
      harness.processNext.mockRejectedValueOnce(error);
      harness.worker.onApplicationBootstrap();
      await flushScheduledDrain();
      expect(log).toHaveBeenCalledExactlyOnceWith("ACCOUNT_DELETION_DRAIN_FAILED");
      expect(readField).not.toHaveBeenCalled();
    } finally {
      harness.worker.onApplicationShutdown();
      log.mockRestore();
      vi.useRealTimers();
    }
  });
});
