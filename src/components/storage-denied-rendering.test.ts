// @vitest-environment jsdom
import React, { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { AuthNav } from "./auth-nav";
import { ProfileSessionSync } from "./profile-session-sync";
import { readCachedServerProfile } from "@/lib/profile-cache";

let root: Root | undefined;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ authenticated: false })));
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("rendering when browser storage is denied", () => {
  it.each(["localStorage", "sessionStorage"] as const)(
    "hydrates navigation and the optional mirror when %s getter throws",
    async (storage) => {
      vi.spyOn(window, storage, "get").mockImplementation(() => {
        throw new DOMException("Storage denied", "SecurityError");
      });
      const tree = React.createElement(React.Fragment, null,
        React.createElement(AuthNav), React.createElement(ProfileSessionSync));
      // Trusted server-rendered component HTML, not user input.
      container.innerHTML = renderToString(tree);
      const errors: unknown[] = [];
      await act(async () => {
        root = hydrateRoot(container, tree, {
          onUncaughtError: (error) => errors.push(error),
          onRecoverableError: (error) => errors.push(error),
        });
      });
      expect(errors).toEqual([]);
      expect(container.querySelector('[aria-label="로그인하기"]')).not.toBeNull();
      expect(readCachedServerProfile()).toBeNull();
    },
  );
});
