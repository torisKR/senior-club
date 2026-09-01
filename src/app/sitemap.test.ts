import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPublicSitemap } from "@/app/sitemap";
import { CLUBS, EVENTS } from "@/lib/data";

describe("public sitemap", () => {
  it("is stable and contains only verified public event detail pages", () => {
    const baseUrl = "https://senior-club.example";
    const now = new Date("2026-07-29T15:00:00+09:00");
    const first = createPublicSitemap(baseUrl, now, EVENTS, CLUBS);
    const second = createPublicSitemap(baseUrl, now, EVENTS, CLUBS);
    const urls = first.map((entry) => entry.url);

    expect(second).toEqual(first);
    expect(first.every((entry) => entry.lastModified === undefined)).toBe(true);
    expect(urls).toContain(`${baseUrl}/clubs`);
    expect(urls).toContain(`${baseUrl}/events`);
    expect(urls).toContain(`${baseUrl}/about`);
    CLUBS.forEach((club) => {
      expect(urls).toContain(`${baseUrl}/clubs/${club.slug}`);
      expect(urls).not.toContain(`${baseUrl}/clubs/${club.slug}/posts`);
    });
    EVENTS.forEach((event) => {
      expect(urls).toContain(`${baseUrl}/events/${event.id}`);
    });
  });

  it("uses clock-derived event status for crawl frequency and priority", () => {
    const baseUrl = "https://senior-club.example";
    const entries = createPublicSitemap(
      baseUrl,
      new Date("2026-07-29T15:00:00+09:00"),
      EVENTS,
    );
    const expired = entries.find(
      (entry) => entry.url === `${baseUrl}/events/event-bukhansan-dullegil`,
    );
    const upcoming = entries.find(
      (entry) => entry.url === `${baseUrl}/events/event-yangpyeong-rail`,
    );

    expect(expired).toMatchObject({
      changeFrequency: "yearly",
      priority: 0.55,
    });
    expect(upcoming).toMatchObject({
      changeFrequency: "weekly",
      priority: 0.8,
    });
  });

  it("excludes authentication and member-only pages", () => {
    const urls = createPublicSitemap("https://senior-club.example").map(
      (entry) => new URL(entry.url).pathname,
    );

    expect(urls).not.toContain("/login");
    expect(urls).not.toContain("/me");
    expect(urls).not.toContain("/chat");
    expect(urls).not.toContain("/admin");
    expect(urls).not.toContain("/privacy");
    expect(urls).not.toContain("/terms");
    expect(urls).not.toContain("/account-deletion");
  });

  it("does not invent event URLs when the backend catalog is unavailable", () => {
    const urls = createPublicSitemap("https://senior-club.example").map(
      (entry) => new URL(entry.url).pathname,
    );

    expect(urls.some((path) => path.startsWith("/events/"))).toBe(false);
    expect(urls.some((path) => /^\/clubs\/.+/.test(path))).toBe(false);
  });
});
