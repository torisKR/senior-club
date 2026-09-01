import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site-url";

export const AI_CRAWLER_USER_AGENTS = [
  "OAI-SearchBot",
  "GPTBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "Google-Extended",
  "Bingbot",
] as const;

export function createRobotsMetadata(
  baseUrl = getSiteUrl(),
): MetadataRoute.Robots {
  const origin = baseUrl.replace(/\/+$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
      {
        userAgent: [...AI_CRAWLER_USER_AGENTS],
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}

export default function robots(): MetadataRoute.Robots {
  return createRobotsMetadata();
}
