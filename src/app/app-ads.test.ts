import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("app-ads.txt", () => {
  it("publishes the owner-specified AdMob seller line", () => {
    const contents = readFileSync(resolve(process.cwd(), "public/app-ads.txt"), "utf8");
    expect(contents.trim()).toBe(
      "google.com, pub-3004906966180197, DIRECT, f08c47fec0942fa0",
    );
  });
});
