// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => React.createElement("img", Object.fromEntries(Object.entries(props).filter(([key]) => !["fill", "priority", "unoptimized"].includes(key)))),
}));
import { CoverImage } from "./cover-image";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("public cover photos", () => {
  it("replaces an unavailable remote photo with a labeled category reference", async () => {
    const render = (image: string) => root.render(React.createElement(CoverImage, { image, category: "photo", alt: "모임 대표 사진", width: 500, height: 300 }));
    await act(async () => render("https://example.test/missing.jpg"));
    await act(async () => container.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(container.querySelector("img")!.getAttribute("src")).toBe("/images/event-photo.jpg");
    expect(container.querySelector("img")!.alt).toContain("참고");
    expect(container.textContent).toContain("주제 참고 이미지");
    await act(async () => render("https://example.test/valid.jpg"));
    expect(container.querySelector("img")!.getAttribute("src")).toBe("https://example.test/valid.jpg");
    expect(container.querySelector("img")!.alt).toBe("모임 대표 사진");
    expect(container.textContent).not.toContain("주제 참고 이미지");
  });
});
