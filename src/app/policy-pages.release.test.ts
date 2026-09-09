import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const POLICY_PAGES = [
  "src/app/privacy/page.tsx",
  "src/app/terms/page.tsx",
  "src/app/account-deletion/page.tsx",
] as const;

const RELEASE_BLOCKERS = [
  { label: "초안", pattern: /초안/u },
  { label: "임시", pattern: /임시/u },
  { label: "미확정", pattern: /미확정/u },
  { label: "출시 전", pattern: /(?:정식\s*)?출시\s*전(?:에|\s*확인)?/u },
  { label: "시행 예정일", pattern: /시행\s*예정일/u },
  { label: "확정 필요", pattern: /확정해야\s*합니다/u },
  { label: "교체 필요", pattern: /교체해야\s*합니다/u },
] as const;

describe("public policy pages", () => {
  it("omit Play release-blocker wording", () => {
    for (const relativePath of POLICY_PAGES) {
      const contents = readFileSync(resolve(process.cwd(), relativePath), "utf8");
      for (const blocker of RELEASE_BLOCKERS) {
        expect(contents, `${relativePath} contains "${blocker.label}"`).not.toMatch(
          blocker.pattern,
        );
      }
    }
  });
});
