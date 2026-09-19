import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replace,
    push: mocks.push,
    refresh: mocks.refresh,
  }),
  usePathname: () => "/",
}));

import { AuthNav } from "./auth-nav";
import { SiteShell } from "./site-shell";

describe("AuthNav", () => {
  it("renders login button with /login href by default", () => {
    const html = renderToStaticMarkup(React.createElement(AuthNav));
    expect(html).toContain('href="/login"');
    expect(html).toContain("로그인");
  });

  it("encodes returnTo query when on a specific page", () => {
    const html = renderToStaticMarkup(
      React.createElement(AuthNav, { pathname: "/events/event-123" }),
    );
    expect(html).toContain('href="/login?returnTo=%2Fevents%2Fevent-123"');
    expect(html).toContain("로그인");
  });

  it("renders compact login button for mobile header", () => {
    const html = renderToStaticMarkup(
      React.createElement(AuthNav, { compact: true, pathname: "/clubs" }),
    );
    expect(html).toContain('href="/login?returnTo=%2Fclubs"');
    expect(html).toContain("로그인");
    expect(html).toContain("size-4");
  });
});

describe("SiteShell with AuthNav", () => {
  it("renders login links in both desktop and mobile headers", () => {
    const html = renderToStaticMarkup(
      React.createElement(SiteShell, null, React.createElement("div", null, "Content")),
    );
    expect(html).toContain("로그인");
    expect(html).toContain('href="/login"');
    // Content is rendered inside main
    expect(html).toContain("Content");
  });
});
