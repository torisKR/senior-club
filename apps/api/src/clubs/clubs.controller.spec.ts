import "reflect-metadata";

import { HEADERS_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";

import { ClubsController } from "./clubs.controller";

describe("ClubsController cache policy", () => {
  it.each(["list", "detail"] as const)(
    "marks %s as a short-lived public response",
    (method) => {
      expect(
        Reflect.getMetadata(
          HEADERS_METADATA,
          ClubsController.prototype[method],
        ),
      ).toEqual([
        {
          name: "Cache-Control",
          value:
            "public, max-age=30, s-maxage=120, stale-while-revalidate=300",
        },
      ]);
    },
  );
});

