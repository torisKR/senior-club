// Disposable local role UI QA. No .env loading, provider calls, remote DB or production writes.
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:net";
import { DATABASE_QA_NAME, databaseQaEnvironment, databaseTestUrl } from "../../scripts/database-qa.mjs";

const require = createRequire(import.meta.url);
const fixtureRoot = dirname(fileURLToPath(import.meta.url));
const phase = process.argv[2] ?? "full";
if (!["full", "refresh-diagnosis", "logout-only", "two-tabs"].includes(phase) || process.argv.length > 3) throw new Error("Unknown bounded role UI phase");
const apiRoot = resolve(fixtureRoot, "../..");
const repoRoot = resolve(apiRoot, "../..");
const container = "senior-club-qa-postgres";
const dbPort = "55432";
const apiPort = 43131;
const webPort = 43132;
const base = `https://localhost:${webPort}`;
const expectedCommit = process.env.ROLE_UI_EXPECTED_COMMIT;
const productPaths = ["src", "shared", "apps/api/src", "apps/mobile/src", "prisma", "next.config.ts", "tsconfig.json", "next-env.d.ts", "postcss.config.mjs", "package.json", "pnpm-lock.yaml", "apps/api/scripts/database-qa.mjs"];
const tempRoot = realpathSync(mkdtempSync(join("/tmp", "senior-role-ui-")));
let createdDb = false;
let apiProcess;
let webProcess;
let browserOpened = false;
let apiExited = false;
let webExited = false;
let env;
let productSnapshot;
const ledger = { phase, startedAt: new Date().toISOString(), tempRoot, reusedContainer: container, ownsContainer: false, database: DATABASE_QA_NAME, databaseCreated: false, ports: { api: apiPort, web: webPort }, processes: [], browserSession: "senior-role-ui", cleanup: {} };
const saveLedger = () => writeFileSync(join(tempRoot, "ledger.json"), JSON.stringify(ledger, null, 2), { mode: 0o600 });
saveLedger();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function command(binary, args, options = {}) {
  const out = spawnSync(binary, args, { encoding: "utf8", ...options });
  if (out.error || out.status !== 0) throw new Error(`${binary} failed (${out.status ?? "spawn"}); inspect private QA logs`);
  return out.stdout;
}
function sql(statement) {
  return command("docker", ["exec", container, "psql", "-X", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", statement]).trim();
}
async function freePort(port) {
  await new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close((error) => error ? reject(error) : resolvePromise()));
  });
}
async function waitForFile(path, deadlineMs, processExited) {
  const until = Date.now() + deadlineMs;
  while (!existsSync(path)) {
    if (processExited()) throw new Error("QA server exited before readiness");
    if (Date.now() >= until) throw new Error("QA readiness timeout");
    await sleep(250);
  }
}
function child(binary, args, childEnv, cwd, logName) {
  const logPath = join(tempRoot, logName);
  writeFileSync(logPath, "", { mode: 0o600 });
  const process = spawn(binary, args, { env: childEnv, cwd, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const chunks = [];
  process.stdout.on("data", (data) => { chunks.push(data); writeFileSync(logPath, Buffer.concat(chunks)); });
  process.stderr.on("data", (data) => { chunks.push(data); writeFileSync(logPath, Buffer.concat(chunks)); });
  ledger.processes.push({ pid: process.pid, binary, args, cwd, logName });
  saveLedger();
  return process;
}
function prisma(args, configPath) {
  command(process.execPath, [join(apiRoot, "node_modules/prisma/build/index.js"), ...args, "--config", configPath], { env, cwd: tempRoot });
}
function sourceSnapshot() {
  const paths = command("git", ["ls-files", "-z", "--", ...productPaths], { cwd: repoRoot }).split("\0").filter(Boolean).sort();
  const hashes = Object.fromEntries(paths.map((path) => [path, createHash("sha256").update(readFileSync(join(repoRoot, path))).digest("hex")]));
  const composite = createHash("sha256");
  for (const [path, hash] of Object.entries(hashes)) composite.update(path).update("\0").update(hash).update("\0");
  return { commit: command("git", ["rev-parse", "HEAD"], { cwd: repoRoot }).trim(), algorithm: "sha256(relative-path+NUL+file-sha256+NUL), sorted tracked product paths", fileCount: paths.length, compositeSha256: composite.digest("hex"), hashes };
}

async function main() {
  if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Node 24 is required");
  productSnapshot = sourceSnapshot();
  if (expectedCommit && (!/^[a-f0-9]{40}$/.test(expectedCommit) || productSnapshot.commit !== expectedCommit)) throw new Error("HEAD does not match the explicit frozen product commit");
  command("git", ["diff", "--quiet", "HEAD", "--", ...productPaths], { cwd: repoRoot });
  writeFileSync(join(tempRoot, "source-manifest.json"), JSON.stringify(productSnapshot, null, 2), { mode: 0o600 });
  ledger.productSource = { commit: productSnapshot.commit, fileCount: productSnapshot.fileCount, compositeSha256: productSnapshot.compositeSha256 };
  saveLedger();
  await freePort(apiPort);
  await freePort(webPort);
  const info = JSON.parse(command("docker", ["inspect", container]))[0];
  if (!info?.State?.Running || info.Name !== `/${container}` || !info.Config.Image.startsWith("postgres:17") || info.NetworkSettings.Ports["5432/tcp"]?.length !== 1 || info.NetworkSettings.Ports["5432/tcp"][0].HostIp !== "127.0.0.1" || info.NetworkSettings.Ports["5432/tcp"][0].HostPort !== dbPort) throw new Error("Existing QA container identity or loopback mapping does not match");
  ledger.containerId = info.Id;
  const password = info.Config.Env.find((value) => value.startsWith("POSTGRES_PASSWORD="))?.slice("POSTGRES_PASSWORD=".length);
  if (!password) throw new Error("Existing QA container has no explicit local DB password");
  for (const name of ["senior-club-qa-api", "senior-club-final-qa-api"]) {
    const service = JSON.parse(command("docker", ["inspect", name]))[0];
    const database = service.Config.Env.find((value) => value.startsWith("DATABASE_URL="))?.slice("DATABASE_URL=".length);
    if (database && new URL(database).pathname === `/${DATABASE_QA_NAME}`) throw new Error("Another API already owns the intended DB");
  }
  if (sql(`SELECT COUNT(*) FROM pg_database WHERE datname = '${DATABASE_QA_NAME}'`) !== "0") throw new Error("QA database already exists; ownership is not proven, refusing mutation");
  env = databaseQaEnvironment({ NODE_ENV: "test", RUN_DATABASE_E2E: "true", DATABASE_QA_URL: `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${dbPort}/${DATABASE_QA_NAME}?sslmode=disable`, DATABASE_URL: `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${dbPort}/${DATABASE_QA_NAME}?sslmode=disable`, EMAIL_PROVIDER: "disabled", SMS_PROVIDER: "disabled", PUSH_PROVIDER: "disabled", OUTBOX_WORKER_ENABLED: "false" });
  databaseTestUrl(env);
  sql(`CREATE DATABASE ${DATABASE_QA_NAME}`);
  createdDb = true;
  ledger.databaseCreated = true;
  ledger.sourceCommit = command("git", ["rev-parse", "HEAD"], { cwd: repoRoot }).trim();
  saveLedger();
  const config = join(tempRoot, "prisma.config.mjs");
  writeFileSync(config, `export default ${JSON.stringify({ schema: join(repoRoot, "prisma/schema.prisma"), migrations: { path: join(repoRoot, "prisma/migrations") }, datasource: { url: env.DATABASE_URL } })};\n`, { mode: 0o600 });
  prisma(["migrate", "deploy"], config);
  command(process.execPath, [require.resolve("tsx/cli"), join(repoRoot, "prisma/seed.ts")], { env, cwd: tempRoot });
  const control = randomBytes(32).toString("hex");
  command("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(tempRoot, "tls.key"), "-out", join(tempRoot, "tls.crt"), "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], { cwd: tempRoot });
  const apiEnv = { ...env, ROLE_UI_TEMP_ROOT: tempRoot, ROLE_UI_CONTROL: control, CORS_ORIGINS: base, PORT: String(apiPort) };
  const vitest = join(tempRoot, "vitest.config.mjs");
  writeFileSync(vitest, `import ts from ${JSON.stringify(pathToFileURL(require.resolve("typescript")).href)};
export default { root: ${JSON.stringify(apiRoot)}, oxc: false, plugins: [{ name: "role-ui-nest-metadata", enforce: "pre", transform(code, id) { if ((!id.startsWith(${JSON.stringify(`${apiRoot}/src/`)}) && !id.startsWith(${JSON.stringify(`${fixtureRoot}/`)})) || !id.endsWith(".ts")) return; const r = ts.transpileModule(code, {fileName:id,compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext,experimentalDecorators:true,emitDecoratorMetadata:true,sourceMap:true}}); return {code:r.outputText,map:r.sourceMapText}; }}], test: { include: [${JSON.stringify(join(fixtureRoot, "server.fixture.ts"))}], environment: "node", fileParallelism: false, hookTimeout: 60000, reporters: ["default", "json"], outputFile: {json:${JSON.stringify(join(tempRoot, "fixture-result.json"))}} } };\n`, { mode: 0o600 });
  apiProcess = child(process.execPath, [join(dirname(require.resolve("vitest/package.json")), "vitest.mjs"), "run", "--config", vitest], apiEnv, tempRoot, "api.log");
  apiProcess.on("exit", () => { apiExited = true; });
  await waitForFile(join(tempRoot, "api-ready.json"), 90_000, () => apiExited);
  console.log(JSON.stringify({ phase: "api-ready", tempRoot, ownsDisposableDb: true }));
  const webRoot = join(tempRoot, "web");
  mkdirSync(webRoot);
  // Copy current product sources so Next never scans the repository .env files.
  for (const path of ["src", "shared", "public", "next.config.ts", "tsconfig.json", "next-env.d.ts", "postcss.config.mjs", "package.json"]) {
    if (existsSync(join(repoRoot, path))) cpSync(join(repoRoot, path), join(webRoot, path), { recursive: true });
  }
  // Existing web typecheck cases reference pure mobile helpers. Copy source
  // only; native credentials, env files and native projects stay excluded.
  mkdirSync(join(webRoot, "apps/mobile"), { recursive: true });
  cpSync(join(repoRoot, "apps/mobile/src"), join(webRoot, "apps/mobile/src"), { recursive: true });
  symlinkSync(join(repoRoot, "node_modules"), join(webRoot, "node_modules"), "dir");
  const originProbeDir = join(webRoot, "src/app/api/qa-role-origin");
  mkdirSync(originProbeDir, { recursive: true });
  writeFileSync(join(originProbeDir, "route.ts"), `export async function POST(request: Request) { return Response.json({ requestOrigin: new URL(request.url).origin, browserOrigin: request.headers.get('origin'), forwardedProtocol: request.headers.get('x-forwarded-proto') }); }\nexport function GET() { return new Response('<!doctype html><html lang="ko"><head><title>Local QA preparation</title></head><body></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }); }\n`, { mode: 0o600 });
  const guard = join(tempRoot, "network-guard.cjs");
  writeFileSync(guard, `require(${JSON.stringify(join(fixtureRoot, "web-trace.cjs"))}).installTracing(${JSON.stringify(tempRoot)});\n`, { mode: 0o600 });
  const webEnv = { PATH: env.PATH, LANG: env.LANG, TMPDIR: env.TMPDIR, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", SENIOR_CLUB_API_BASE_URL: `https://localhost:${apiPort}`, NEXT_PUBLIC_APP_URL: base, NODE_OPTIONS: `--require=${guard}`, NODE_EXTRA_CA_CERTS: join(tempRoot, "tls.crt"), DOTENV_CONFIG_PATH: "/dev/null" };
  const build = spawnSync(process.execPath, [join(repoRoot, "node_modules/next/dist/bin/next"), "build", "--webpack"], { env: webEnv, cwd: webRoot, encoding: "utf8", timeout: 180_000, maxBuffer: 10 * 1024 * 1024 });
  writeFileSync(join(tempRoot, "web-build.log"), `${build.stdout ?? ""}${build.stderr ?? ""}`, { mode: 0o600 });
  if (build.error || build.status !== 0) throw new Error("Isolated production web build failed; inspect private web-build.log");
  const webServer = join(tempRoot, "web-server.cjs");
  writeFileSync(webServer, `const fs=require('node:fs'); const https=require('node:https'); const next=require(${JSON.stringify(join(repoRoot, "node_modules/next"))});
const app=next({dev:false,dir:${JSON.stringify(webRoot)},hostname:'localhost',port:${webPort}});
app.prepare().then(()=>{const handler=require(${JSON.stringify(join(fixtureRoot, "web-trace.cjs"))}).traceHandler(app.getRequestHandler());const server=https.createServer({key:fs.readFileSync(${JSON.stringify(join(tempRoot, "tls.key"))}),cert:fs.readFileSync(${JSON.stringify(join(tempRoot, "tls.crt"))})},(req,res)=>{req.headers['x-forwarded-proto']='https';handler(req,res);});server.listen(${webPort},'127.0.0.1',()=>console.log('ROLE_UI_READY'));process.on('SIGTERM',()=>server.close(()=>process.exit(0)));}).catch(()=>process.exit(1));\n`, { mode: 0o600 });
  webProcess = child(process.execPath, [webServer], webEnv, webRoot, "web.log");
  webProcess.on("exit", () => { webExited = true; });
  const webUntil = Date.now() + 90_000;
  while (!readFileSync(join(tempRoot, "web.log"), "utf8").includes("ROLE_UI_READY")) {
    if (webExited || Date.now() >= webUntil) throw new Error("Web QA server failed readiness");
    await sleep(250);
  }
  console.log(JSON.stringify({ phase: "web-ready", tempRoot, base, productionBuild: true, loopbackApiHttpsWithExplicitCa: true }));
  const browserConfig = join(tempRoot, "cli.json");
  writeFileSync(browserConfig, JSON.stringify({ browser: { browserName: "chromium", launchOptions: { channel: "chrome" }, contextOptions: { ignoreHTTPSErrors: true, locale: "ko-KR", timezoneId: "Asia/Seoul", viewport: { width: 1440, height: 1000 } } } }), { mode: 0o600 });
  const cliEnv = { PATH: `${dirname(process.execPath)}:/Users/toris/.local/bin:/usr/local/bin:/usr/bin:/bin`, HOME: process.env.HOME, TMPDIR: env.TMPDIR, LANG: env.LANG };
  browserOpened = true;
  const open = spawnSync("/Users/toris/.local/bin/playwright-cli", ["-s=senior-role-ui", "open", base, "--config", browserConfig, "--json"], { env: cliEnv, cwd: tempRoot, timeout: 90_000, encoding: "utf8" });
  writeFileSync(join(tempRoot, "browser-open.json"), `${open.stdout ?? ""}${open.stderr ?? ""}`, { mode: 0o600 });
  if (open.error || open.status !== 0) throw new Error("Owned Playwright CLI open failed; inspect private browser-open.json");
  const ready = JSON.parse(readFileSync(join(tempRoot, "api-ready.json")));
  const browserEntry = phase === "full" ? "browser.cjs" : `browser-${phase}.cjs`;
  const browserCallback = require(join(fixtureRoot, browserEntry));
  if (typeof browserCallback !== "function") throw new Error("Bounded role UI browser entry must export a callback");
  const browserCode = browserCallback.toString().replace("__ROLE_UI_CONFIG__", JSON.stringify({ ...ready, base, control }));
  const browserFile = join(tempRoot, "browser-private.cjs");
  writeFileSync(browserFile, browserCode, { mode: 0o600 });
  console.log(JSON.stringify({ phase: "browser-running", tempRoot }));
  const browser = spawn("/Users/toris/.local/bin/playwright-cli", ["-s=senior-role-ui", "run-code", "--filename", browserFile, "--json"], { env: cliEnv, cwd: tempRoot, stdio: ["ignore", "pipe", "pipe"] });
  const chunks = [];
  browser.stdout.on("data", (chunk) => chunks.push(chunk));
  browser.stderr.on("data", (chunk) => chunks.push(chunk));
  const browserExit = await new Promise((r) => browser.on("exit", r));
  const raw = Buffer.concat(chunks).toString("utf8");
  writeFileSync(join(tempRoot, "browser-result.raw.json"), raw, { mode: 0o600 });
  if (browserExit !== 0) throw new Error("Playwright CLI QA failed; private result retained");
  const envelope = JSON.parse(raw);
  const result = typeof envelope.result === "string" ? JSON.parse(envelope.result) : envelope.result;
  writeFileSync(join(tempRoot, "ui-result.json"), JSON.stringify(result, null, 2), { mode: 0o600 });
  if (!result?.passed) {
    console.log(JSON.stringify({ phase: "ui-findings", failures: result?.failures, findings: result?.findings, passedChecks: result?.checks?.length }));
    process.exitCode = 1;
  }
  console.log(JSON.stringify({ phase: "browser-finished", tempRoot, exitCode: browserExit }));
}

async function cleanup() {
  if (browserOpened) {
    try { command("/Users/toris/.local/bin/playwright-cli", ["-s=senior-role-ui", "close"], { cwd: tempRoot }); ledger.cleanup.browserSessionClosed = true; }
    catch { ledger.cleanup.browserSessionClosed = false; }
  }
  if (apiProcess && !apiExited) {
    writeFileSync(join(tempRoot, "stop-api"), "owner-finished\n", { mode: 0o600 });
    const until = Date.now() + 20_000;
    while (!apiExited && Date.now() < until) await sleep(250);
    if (!apiExited) process.kill(-apiProcess.pid, "SIGTERM");
  }
  if (webProcess && !webExited) {
    process.kill(-webProcess.pid, "SIGTERM");
    const until = Date.now() + 10_000;
    while (!webExited && Date.now() < until) await sleep(250);
    if (!webExited) process.kill(-webProcess.pid, "SIGKILL");
  }
  ledger.cleanup.apiExited = !apiProcess || apiExited;
  ledger.cleanup.webExited = !webProcess || webExited;
  if (createdDb) {
    sql(`DROP DATABASE ${DATABASE_QA_NAME} WITH (FORCE)`);
    ledger.cleanup.databaseAbsent = sql(`SELECT COUNT(*) FROM pg_database WHERE datname = '${DATABASE_QA_NAME}'`) === "0";
  }
  if (existsSync(join(tempRoot, "web"))) rmSync(join(tempRoot, "web"), { recursive: true, force: true });
  for (const file of ["prisma.config.mjs", "browser-private.cjs", "tls.key", "tls.crt"]) {
    if (existsSync(join(tempRoot, file))) rmSync(join(tempRoot, file));
  }
  ledger.finishedAt = new Date().toISOString();
  if (productSnapshot) {
    const after = sourceSnapshot();
    ledger.productSourceUnchanged = after.commit === productSnapshot.commit && after.compositeSha256 === productSnapshot.compositeSha256;
    if (!ledger.productSourceUnchanged) process.exitCode = 1;
  }
  saveLedger();
  console.log(JSON.stringify({ phase: "cleanup", tempRoot, ...ledger.cleanup }));
}

try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await cleanup(); }
