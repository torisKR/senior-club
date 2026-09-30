import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
  DATABASE_QA_SUITES,
  databaseQaEnvironment,
  databaseTestUrl,
  validateDatabaseQaReport,
} from "./database-qa.mjs";

const localUrl = "postgresql://postgres:local-test-only@127.0.0.1:55432/senior_role_qa_20260930?sslmode=disable";
const safeEnv = {
  NODE_ENV: "test", RUN_DATABASE_E2E: "true",
  DATABASE_QA_URL: localUrl, DATABASE_URL: localUrl,
  EMAIL_PROVIDER: "disabled", SMS_PROVIDER: "disabled", PUSH_PROVIDER: "disabled",
  OUTBOX_WORKER_ENABLED: "false",
};

test("requires explicit opt-in and fails an enabled run with a missing URL", () => {
  assert.equal(databaseTestUrl({ DATABASE_URL: "postgresql://remote/production" }), undefined);
  assert.equal(databaseTestUrl({ RUN_DATABASE_E2E: "false" }), undefined);
  assert.throws(() => databaseTestUrl({ RUN_DATABASE_E2E: "true" }), /explicit DATABASE_QA_URL/);
  assert.throws(() => databaseTestUrl({ ...safeEnv, RUN_DATABASE_E2E: "TRUE" }), /true or false/);
  assert.throws(() => databaseQaEnvironment({}), /RUN_DATABASE_E2E=true/);
  assert.equal(databaseTestUrl(safeEnv), localUrl);
});

test("rejects production, default DBs, other ports, remote hosts and URL overrides", () => {
  const unsafeUrls = [
    localUrl.replace("127.0.0.1", "qa.example.invalid"),
    localUrl.replace("55432", "5432"),
    localUrl.replace("senior_role_qa_20260930", "postgres"),
    localUrl.replace("senior_role_qa_20260930", "senior_club"),
    localUrl.replace("postgresql:", "https:"),
    localUrl.replace("?sslmode=disable", "?sslmode=disable&host=remote"),
    localUrl.replace("?sslmode=disable", "?sslmode=disable&options=-csearch_path=production"),
    localUrl.replace("?sslmode=disable", ""),
  ];
  for (const url of unsafeUrls) {
    assert.throws(() => databaseTestUrl({ ...safeEnv, DATABASE_QA_URL: url, DATABASE_URL: url }), /DB QA accepts only/);
  }
  assert.throws(() => databaseTestUrl({ ...safeEnv, NODE_ENV: "production" }), /NODE_ENV=test/);
  assert.throws(() => databaseTestUrl({ ...safeEnv, DATABASE_URL: "postgresql://remote/production" }), /exactly match/);
});

test("requires disabled deliveries and isolates inherited credentials and PG/TLS settings", () => {
  for (const key of ["EMAIL_PROVIDER", "SMS_PROVIDER", "PUSH_PROVIDER", "OUTBOX_WORKER_ENABLED"]) {
    assert.throws(() => databaseTestUrl({ ...safeEnv, [key]: "true" }), /must be/);
  }
  const isolated = databaseQaEnvironment({ ...safeEnv,
    PGHOSTADDR: "203.0.113.1", PGOPTIONS: "-csearch_path=production",
    NODE_TLS_REJECT_UNAUTHORIZED: "0", NODE_OPTIONS: "--require=dotenv/config",
    RESEND_API_KEY: "inherited", AWS_SECRET_ACCESS_KEY: "inherited",
    GOOGLE_APPLICATION_CREDENTIALS: "/credentials.json",
  });
  for (const key of ["PGHOSTADDR", "PGOPTIONS", "NODE_TLS_REJECT_UNAUTHORIZED", "NODE_OPTIONS",
    "RESEND_API_KEY", "AWS_SECRET_ACCESS_KEY", "GOOGLE_APPLICATION_CREDENTIALS"]) {
    assert.equal(isolated[key], undefined);
  }
  assert.equal(isolated.DATABASE_URL, localUrl);
  assert.equal(isolated.DOTENV_CONFIG_PATH, "/dev/null");
});

test("rejects skipped, empty, failed or missing suites even if Vitest exits successfully", () => {
  const report = () => ({ success: true, numFailedTests: 0, numPendingTests: 0,
    testResults: DATABASE_QA_SUITES.map((suite) => ({
      name: resolve(import.meta.dirname, "..", suite), status: "passed",
      assertionResults: [{ status: "passed" }],
    })),
  });
  assert.equal(Object.keys(validateDatabaseQaReport(report())).length, 3);
  for (const status of ["pending", "skipped", "todo", "failed"]) {
    const value = report();
    value.testResults[0].assertionResults[0].status = status;
    assert.throws(() => validateDatabaseQaReport(value), /missing, failed or skipped/);
  }
  const empty = report();
  empty.testResults[0].assertionResults = [];
  assert.throws(() => validateDatabaseQaReport(empty), /missing, failed or skipped/);
  const missing = report();
  missing.testResults.pop();
  assert.throws(() => validateDatabaseQaReport(missing), /all three suites/);
  assert.throws(() => validateDatabaseQaReport({ ...report(), success: false }), /DB QA failed/);
});
