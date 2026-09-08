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
const yogaBase64 = (await (await import("node:fs/promises")).readFile(resolve(ogWasm, "yoga.wasm")).then((value) => value.toString("base64")));
const resvgBase64 = (await (await import("node:fs/promises")).readFile(resolve(ogWasm, "resvg.wasm")).then((value) => value.toString("base64")));
middlewareSource = middlewareSource
  .replace(/import yoga_wasm from "[^"]+";/, `const yoga_wasm = Promise.resolve(Uint8Array.from(atob("${yogaBase64}"), (character) => character.charCodeAt(0)));`)
  .replace(/import resvg_wasm from "[^"]+";/, `const resvg_wasm = Promise.resolve(Uint8Array.from(atob("${resvgBase64}"), (character) => character.charCodeAt(0)));`);
await (await import("node:fs/promises")).writeFile(middleware, middlewareSource);

console.log(`Staged Sites Worker output at ${dirname(resolve(dist, "server/index.js"))}`);
