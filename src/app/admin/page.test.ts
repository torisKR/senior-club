import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireServerUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({ requireServerUser: mocks.requireServerUser }));
vi.mock("@/components/admin-panel", () => ({ AdminPanel: () => "LIVE_ADMIN_REPORTS" }));

import AdminPage from "@/app/admin/page";

describe("admin page authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireServerUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
  });

  it("verifies an admin session before rendering the live operations panel", async () => {
    const html = renderToStaticMarkup(await AdminPage());

    expect(mocks.requireServerUser).toHaveBeenCalledWith("/admin", ["ADMIN"]);
    expect(html).toContain("LIVE_ADMIN_REPORTS");
  });
});
