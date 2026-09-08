import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(process.cwd());
const openNext = resolve(root, ".open-next");
const dist = resolve(root, "dist");
const worker = resolve(openNext, "worker.js");

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "server"), { recursive: true });
await cp(openNext, resolve(dist, "server/.open-next"), { recursive: true, dereference: true });
await cp(worker, resolve(dist, "server/index.js"), { dereference: true });
await cp(resolve(openNext, "assets"), resolve(dist, "assets"), { recursive: true, dereference: true });

console.log(`Staged Sites Worker output at ${dirname(resolve(dist, "server/index.js"))}`);
