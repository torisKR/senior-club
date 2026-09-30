import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(apiRoot, "../..");
export const DATABASE_QA_NAME = "senior_role_qa_20260930";
export const DATABASE_QA_SUITES = [
  "src/auth/auth-events.e2e.spec.ts",
  "src/reviews/reviews.database.spec.ts",
  "src/safety/safety.database.spec.ts",
];

// An enabled run must fail before constructing a client if its target is unsafe.
// DATABASE_URL alone never opts into these destructive fixture/cleanup suites.
export function databaseTestUrl(env = process.env) {
  if (env.RUN_DATABASE_E2E === undefined || env.RUN_DATABASE_E2E === "false") {
    return undefined;
  }
  if (env.RUN_DATABASE_E2E !== "true") {
    throw new Error("RUN_DATABASE_E2E must be true or false");
  }
  if (env.NODE_ENV !== "test" || !env.DATABASE_QA_URL) {
    throw new Error("Enabled DB QA requires NODE_ENV=test and explicit DATABASE_QA_URL");
  }
  let url;
  try {
    url = new URL(env.DATABASE_QA_URL);
  } catch {
    throw new Error("DATABASE_QA_URL must be a disposable local PostgreSQL URL");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== "127.0.0.1" || url.port !== "55432" ||
    url.pathname !== `/${DATABASE_QA_NAME}` || url.username !== "postgres" ||
    !url.password || url.hash || url.search !== "?sslmode=disable"
  ) {
    throw new Error(`DB QA accepts only postgres at 127.0.0.1:55432/${DATABASE_QA_NAME}?sslmode=disable`);
  }
  if (env.DATABASE_URL !== env.DATABASE_QA_URL) {
    throw new Error("DATABASE_URL must exactly match explicit DATABASE_QA_URL");
  }
  for (const provider of ["EMAIL_PROVIDER", "SMS_PROVIDER", "PUSH_PROVIDER"]) {
    if (env[provider] !== "disabled") throw new Error(`${provider} must be disabled for DB QA`);
  }
  if (env.OUTBOX_WORKER_ENABLED !== "false") {
    throw new Error("OUTBOX_WORKER_ENABLED must be false for DB QA");
  }
  return env.DATABASE_QA_URL;
}

export function databaseQaEnvironment(env = process.env) {
  const databaseUrl = databaseTestUrl(env);
  if (!databaseUrl) throw new Error("DB QA runner requires RUN_DATABASE_E2E=true");
  // Build from an allowlist; never pass inherited provider, PG, TLS or cloud credentials.
  return {
    PATH: `${dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin`,
    LANG: "en_US.UTF-8",
    TMPDIR: tmpdir(),
    NODE_ENV: "test",
    DATABASE_QA_URL: databaseUrl,
    DATABASE_URL: databaseUrl,
    RUN_DATABASE_E2E: "true",
    DATABASE_POOL_MAX: "8",
    EMAIL_PROVIDER: "disabled",
    SMS_PROVIDER: "disabled",
    PUSH_PROVIDER: "disabled",
    OUTBOX_WORKER_ENABLED: "false",
    AUTH_DEV_OTP_EXPOSE: "false",
    DOTENV_CONFIG_PATH: "/dev/null",
    CHECKPOINT_DISABLE: "1",
    PRISMA_HIDE_UPDATE_MESSAGE: "1",
    KAKAO_APP_ID: "1539455",
  };
}

export function validateDatabaseQaReport(report) {
  const suites = report.testResults;
  if (!Array.isArray(suites) || suites.length !== DATABASE_QA_SUITES.length ||
      !report.success || report.numFailedTests || report.numFailedTestSuites ||
      report.numPendingTests || report.numTodoTests) {
    throw new Error("DB QA failed, skipped tests, or did not execute all three suites");
  }
  const counts = {};
  for (const suite of DATABASE_QA_SUITES) {
    const result = suites.find((item) => resolve(item.name) === join(apiRoot, suite));
    if (!result || result.status !== "passed" || !result.assertionResults?.length ||
        result.assertionResults.some((item) => item.status !== "passed")) {
      throw new Error(`DB QA suite missing, failed or skipped: ${suite}`);
    }
    counts[suite] = result.assertionResults.length;
  }
  return counts;
}

function run(entry, args, env, cwd) {
  const result = spawnSync(process.execPath, [entry, ...args], { env, cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`DB QA command failed (${result.status ?? result.signal}): ${entry}`);
}

function main() {
  if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("DB QA requires Node 24");
  if (process.argv.length !== 2) throw new Error("DB QA runner accepts no filtering arguments");
  const env = databaseQaEnvironment();
  const tempRoot = mkdtempSync(join(tmpdir(), "senior-role-qa-"));
  try {
    // The repository Prisma config loads .env. Use absolute paths and a temporary
    // config that never reads it, including for migrations and the seed.
    const prismaConfig = join(tempRoot, "prisma.config.mjs");
    writeFileSync(prismaConfig, `export default ${JSON.stringify({
      schema: join(repoRoot, "prisma/schema.prisma"),
      migrations: { path: join(repoRoot, "prisma/migrations") },
      datasource: { url: env.DATABASE_URL },
    })};\n`, { mode: 0o600 });
    run(join(apiRoot, "node_modules/prisma/build/index.js"), ["migrate", "deploy", "--config", prismaConfig], env, tempRoot);
    run(require.resolve("tsx/cli"), [join(repoRoot, "prisma/seed.ts")], env, tempRoot);

    const reportPath = join(tempRoot, "results.json");
    const vitestConfig = join(tempRoot, "vitest.config.mjs");
    // esbuild omits design:paramtypes, which Nest needs for real dependency
    // injection. Use the installed TypeScript compiler only in this QA run.
    writeFileSync(vitestConfig, `
import ts from ${JSON.stringify(pathToFileURL(require.resolve("typescript")).href)};
export default {
  root: ${JSON.stringify(apiRoot)},
  oxc: false,
  plugins: [{
    name: "database-qa-nest-metadata", enforce: "pre",
    transform(code, id) {
      if (!id.startsWith(${JSON.stringify(`${apiRoot}/src/`)}) || !id.endsWith(".ts")) return;
      const output = ts.transpileModule(code, { fileName: id, compilerOptions: {
        target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext,
        experimentalDecorators: true, emitDecoratorMetadata: true, sourceMap: true
      }});
      return { code: output.outputText, map: output.sourceMapText };
    }
  }],
  test: {
    include: ${JSON.stringify(DATABASE_QA_SUITES)}, environment: "node",
    fileParallelism: false, hookTimeout: 30000, testTimeout: 30000,
    reporters: ["default", "json"], outputFile: { json: ${JSON.stringify(reportPath)} }
  }
};\n`, { mode: 0o600 });
    run(join(dirname(require.resolve("vitest/package.json")), "vitest.mjs"),
      ["run", "--config", vitestConfig], env, apiRoot);
    const counts = validateDatabaseQaReport(JSON.parse(readFileSync(reportPath, "utf8")));
    console.log("DB QA verified: every suite passed with zero skipped tests", counts);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : "DB QA failed");
    process.exitCode = 1;
  }
}
