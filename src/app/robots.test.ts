import { describe, expect, it } from "vitest";

import {
  AI_CRAWLER_USER_AGENTS,
  createRobotsMetadata,
} from "@/app/robots";

describe("robots metadata", () => {
  it("names current AI search and user-fetch crawlers", () => {
    expect(AI_CRAWLER_USER_AGENTS).toContain("OAI-SearchBot");
    expect(AI_CRAWLER_USER_AGENTS).toContain("Claude-SearchBot");
    expect(AI_CRAWLER_USER_AGENTS).toContain("Claude-User");
    expect(AI_CRAWLER_USER_AGENTS).toContain("Perplexity-User");
    expect(AI_CRAWLER_USER_AGENTS).not.toContain("anthropic-ai");
  });

  it("allows public pages while keeping API routes out of the crawl surface", () => {
    const metadata = createRobotsMetadata("https://senior-club.example/");

    expect(metadata.host).toBe("https://senior-club.example");
    expect(metadata.sitemap).toBe(
      "https://senior-club.example/sitemap.xml",
    );
    expect(metadata.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userAgent: "*",
          allow: "/",
          disallow: ["/api/"],
        }),
      ]),
    );
  });

  it("explicitly permits the supported search and AI crawler group", () => {
    const metadata = createRobotsMetadata("https://senior-club.example");
    const rules = Array.isArray(metadata.rules)
      ? metadata.rules
      : [metadata.rules];
    const aiRule = rules.find((rule) => Array.isArray(rule.userAgent));

    expect(aiRule).toBeDefined();
    expect(aiRule?.userAgent).toEqual([...AI_CRAWLER_USER_AGENTS]);
    expect(aiRule).toMatchObject({
      allow: "/",
      disallow: ["/api/"],
    });
  });
});
