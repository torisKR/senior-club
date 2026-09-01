import { describe, expect, it } from "vitest";

import { createEventsPageMetadata } from "@/lib/events/page-metadata";

describe("events page metadata", () => {
  it("indexes only the canonical unfiltered collection", () => {
    expect(createEventsPageMetadata(false).robots).toMatchObject({
      index: true,
      follow: true,
    });
    expect(createEventsPageMetadata(true).robots).toMatchObject({
      index: false,
      follow: true,
      noarchive: true,
    });
    expect(createEventsPageMetadata(true).alternates?.canonical).toContain(
      "/events",
    );
  });
});
