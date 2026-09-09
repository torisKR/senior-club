import { describe, expect, it } from "vitest";

import { GET } from "./route";
import { createLlmsText } from "@/lib/llms-text";

describe("llms.txt", () => {
  it("publishes a factual, canonical service summary", () => {
    const text = createLlmsText("https://senior-club.example/");

    expect(text).toContain("# 시니어클럽 (Senior Club)");
    expect(text).toContain("https://senior-club.example/about");
    expect(text).toContain("https://senior-club.example/clubs");
    expect(text).toContain("https://senior-club.example/sitemap.xml");
    expect(text).toContain("https://senior-club.example/privacy");
    expect(text).toContain("https://senior-club.example/terms");
    expect(text).toContain("https://senior-club.example/account-deletion");
    expect(text).not.toContain("출시 전 운영 초안");
    expect(text).not.toContain("[커뮤니티](https://senior-club.example/clubs)");
    expect(text).toContain("게시판과 댓글은 공개 서비스 API의 실제 데이터를 사용");
    expect(text).toContain("예시 게시글로 대체하지 않습니다");
    expect(text).toContain("시작 설정을 마친 회원에게만 허용");
    expect(text).toContain("공개 서비스 API의 데이터");
    expect(text).toContain("표준 한국어 표기: 시니어클럽");
    expect(text).not.toContain("localhost");
  });

  it("serves plain text with an explicit cache policy", () => {
    const response = GET();

    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("cache-control")).toContain("max-age=3600");
  });
});
