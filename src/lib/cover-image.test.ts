import { describe, expect, it } from "vitest";
import {
  DEFAULT_COVER_IMAGE,
  getCategoryCoverImage,
  resolveCoverImage,
} from "./cover-image";

describe("cover-image helpers", () => {
  it("resolves category-specific images when available", () => {
    expect(getCategoryCoverImage("photo")).toBe("/images/event-photo.jpg");
    expect(getCategoryCoverImage("history")).toBe("/images/event-history.jpg");
    expect(getCategoryCoverImage("rail-travel")).toBe("/images/event-rail.jpg");
    expect(getCategoryCoverImage("reading")).toBe("/images/event-reading.jpg");
    expect(getCategoryCoverImage("classical")).toBe("/images/event-classical.jpg");
    expect(getCategoryCoverImage("gardening")).toBe("/images/event-gardening.jpg");
    expect(getCategoryCoverImage("hiking")).toBe("/images/club-senior-hero.jpg");
  });

  it("falls back to default hero cover image for unknown or empty categories", () => {
    expect(getCategoryCoverImage(undefined)).toBe(DEFAULT_COVER_IMAGE);
    expect(getCategoryCoverImage(null)).toBe(DEFAULT_COVER_IMAGE);
    expect(getCategoryCoverImage("unknown-category")).toBe(DEFAULT_COVER_IMAGE);
  });

  it("prioritizes item image over fallback", () => {
    expect(resolveCoverImage("/custom/path.jpg", "photo")).toBe(
      "/custom/path.jpg",
    );
    expect(resolveCoverImage("", "photo")).toBe("/images/event-photo.jpg");
    expect(resolveCoverImage(undefined, "history")).toBe(
      "/images/event-history.jpg",
    );
  });
});
