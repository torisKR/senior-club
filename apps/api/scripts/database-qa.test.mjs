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

test("registers all four database suites, including account deletion", () => {
  assert.deepEqual(DATABASE_QA_SUITES, [
    "src/auth/auth-events.e2e.spec.ts",
    "src/reviews/reviews.database.spec.ts",
    "src/safety/safety.database.spec.ts",
    "src/account/account-deletion.database.spec.ts",
  ]);
});

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
    localUrl.replace("127.0.0.1", "localhost"),
    localUrl.replace("127.0.0.1", "[::1]"),
    localUrl.replace("55432", "5432"),
    localUrl.replace("senior_role_qa_20260930", "postgres"),
    localUrl.replace("senior_role_qa_20260930", "senior_club"),
    localUrl.replace("postgresql:", "https:"),
    localUrl.replace("postgres:", "other-user:"),
    localUrl.replace("local-test-only", ""),
    `${localUrl}#override`,
    localUrl.replace("?sslmode=disable", "?sslmode=disable&host=remote"),
    localUrl.replace("?sslmode=disable", "?sslmode=disable&options=-csearch_path=production"),
    localUrl.replace("?sslmode=disable", ""),
  ];
  for (const url of unsafeUrls) {
    assert.throws(() => databaseTestUrl({ ...safeEnv, DATABASE_QA_URL: url, DATABASE_URL: url }), /DB QA accepts only/);
  }
  assert.throws(() => databaseTestUrl({ ...safeEnv, DATABASE_QA_URL: "invalid" }), /disposable local/);
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
    ACCOUNT_DELETION_WORKER_ENABLED: "true", ACCOUNT_DELETION_POLL_INTERVAL_MS: "1",
  });
  for (const key of ["PGHOSTADDR", "PGOPTIONS", "NODE_TLS_REJECT_UNAUTHORIZED", "NODE_OPTIONS",
    "RESEND_API_KEY", "AWS_SECRET_ACCESS_KEY", "GOOGLE_APPLICATION_CREDENTIALS",
    "ACCOUNT_DELETION_WORKER_ENABLED", "ACCOUNT_DELETION_POLL_INTERVAL_MS"]) {
    assert.equal(isolated[key], undefined);
  }
  assert.equal(isolated.DATABASE_URL, localUrl);
  assert.equal(isolated.DOTENV_CONFIG_PATH, "/dev/null");
  assert.equal(isolated.OUTBOX_WORKER_ENABLED, "false");
});

const report = () => ({ success: true, numFailedTests: 0, numPendingTests: 0,
  testResults: DATABASE_QA_SUITES.map((suite) => ({
    name: resolve(import.meta.dirname, "..", suite), status: "passed",
    assertionResults: [{ status: "passed" }],
  })),
});

test("returns assertion counts only after all four suites pass", () => {
  assert.deepEqual(validateDatabaseQaReport(report()),
    Object.fromEntries(DATABASE_QA_SUITES.map((suite) => [suite, 1])));
});

test("rejects skipped, empty or failed assertions in each suite even if Vitest exits successfully", () => {
  for (let index = 0; index < DATABASE_QA_SUITES.length; index += 1) {
    for (const status of ["pending", "skipped", "todo", "failed"]) {
      const value = report();
      value.testResults[index].assertionResults[0].status = status;
      assert.throws(() => validateDatabaseQaReport(value), /missing, failed or skipped/);
    }
    const value = report();
    value.testResults[index].assertionResults = [];
    assert.throws(() => validateDatabaseQaReport(value), /missing, failed or skipped/);
  }
});

test("rejects missing account deletion, duplicate, unexpected or extra suite reports", () => {
  const missing = report();
  missing.testResults.pop();
  assert.throws(() => validateDatabaseQaReport(missing), /all 4 suites/);
  for (const name of [report().testResults[0].name, resolve(import.meta.dirname, "unexpected.spec.ts")]) {
    const value = report();
    value.testResults[3].name = name;
    assert.throws(() => validateDatabaseQaReport(value), /account-deletion\.database\.spec\.ts/);
  }
  const extra = report();
  extra.testResults.push(extra.testResults[0]);
  assert.throws(() => validateDatabaseQaReport(extra), /all 4 suites/);
});

test("rejects non-passing suite status and failure, pending or todo summary counters", () => {
  for (let index = 0; index < DATABASE_QA_SUITES.length; index += 1) {
    for (const status of ["pending", "skipped", "failed"]) {
      const value = report();
      value.testResults[index].status = status;
      assert.throws(() => validateDatabaseQaReport(value), /missing, failed or skipped/);
    }
  }
  for (const key of ["numFailedTests", "numFailedTestSuites", "numPendingTests", "numPendingTestSuites", "numTodoTests"]) {
    assert.throws(() => validateDatabaseQaReport({ ...report(), [key]: 1 }), /DB QA failed/);
  }
  for (const success of [false, "true", undefined]) {
    assert.throws(() => validateDatabaseQaReport({ ...report(), success }), /DB QA failed/);
  }
});
