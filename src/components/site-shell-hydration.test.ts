// @vitest-environment jsdom
import React, { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/index" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", props),
}));
vi.mock("next/image", () => ({
  default: (props: { src: string; alt: string; className?: string }) =>
    React.createElement("img", { src: props.src, alt: props.alt, className: props.className }),
}));

import { SiteShell } from "./site-shell";

let root: Root | undefined;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ authenticated: false })));
  navigation.pathname = "/index";
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.classList.remove("large-text");
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container.remove();
  document.documentElement.classList.remove("large-text");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Vercel home prerender pathname hydration", () => {
  it.each(["default", "large-text", "storage-denied"])(
    "hydrates /index SSR as / without replacing the tree (%s)",
    async (preference) => {
      if (preference === "large-text") localStorage.setItem("club-senior-large-text", "true");
      if (preference === "storage-denied") {
        vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
          throw new DOMException("Storage denied", "SecurityError");
        });
      }
      const tree = React.createElement(SiteShell, null,
        React.createElement("h1", null, "QA home"));
      // Trusted server-rendered component HTML, not user input.
      container.innerHTML = renderToString(tree);
      const serverMain = container.querySelector("main");
      navigation.pathname = "/";
      const errors: unknown[] = [];
      await act(async () => {
        root = hydrateRoot(container, tree, {
          onRecoverableError: (error) => errors.push(error),
          onUncaughtError: (error) => errors.push(error),
        });
      });
      expect(errors).toEqual([]);
      expect(container.querySelector("main")).toBe(serverMain);
      expect(container.querySelectorAll('a[href="/"][aria-current="page"]')).toHaveLength(2);
      expect(container.querySelectorAll('a[href="/login?returnTo=%2Findex"]')).toHaveLength(0);
      expect(document.documentElement.classList.contains("large-text")).toBe(preference === "large-text");

      navigation.pathname = "/events";
      // A new tree makes the mocked route update observable, like client navigation.
      await act(async () => root?.render(React.createElement(SiteShell, null,
        React.createElement("h1", null, "QA events"))));
      expect(container.querySelectorAll('a[href="/events"][aria-current="page"]')).toHaveLength(2);
      expect(container.querySelectorAll('a[href="/"][aria-current="page"]')).toHaveLength(0);
    },
  );
});
