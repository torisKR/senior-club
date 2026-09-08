import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(process.cwd());
const openNext = resolve(root, ".open-next");
const dist = resolve(root, "dist");
const worker = resolve(openNext, "worker.js");

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "server"), { recursive: true });
await cp(openNext, resolve(dist, "server"), { recursive: true, dereference: true });
await cp(worker, resolve(dist, "server/index.js"), { dereference: true });
await cp(resolve(openNext, "assets"), resolve(dist, "assets"), { recursive: true, dereference: true });
const ogWasm = resolve(root, "node_modules/next/dist/compiled/@vercel/og");
await mkdir(resolve(dist, "server/wasm"), { recursive: true });
await cp(resolve(ogWasm, "yoga.wasm"), resolve(dist, "server/wasm/yoga.wasm"));
await cp(resolve(ogWasm, "resvg.wasm"), resolve(dist, "server/wasm/resvg.wasm"));
const middleware = resolve(dist, "server/middleware/handler.mjs");
let middlewareSource = await (await import("node:fs/promises")).readFile(middleware, "utf8");
const absoluteWasmPrefix = resolve(ogWasm) + "/";
middlewareSource = middlewareSource
  .replaceAll(absoluteWasmPrefix + "yoga.wasm?module", "../wasm/yoga.wasm?module")
  .replaceAll(absoluteWasmPrefix + "resvg.wasm?module", "../wasm/resvg.wasm?module")
  .replace(/\/[^"\n]+\/next\/dist\/compiled\/@vercel\/og\/yoga\.wasm\?module/g, "../wasm/yoga.wasm?module")
  .replace(/\/[^"\n]+\/next\/dist\/compiled\/@vercel\/og\/resvg\.wasm\?module/g, "../wasm/resvg.wasm?module");
await (await import("node:fs/promises")).writeFile(middleware, middlewareSource);

console.log(`Staged Sites Worker output at ${dirname(resolve(dist, "server/index.js"))}`);
