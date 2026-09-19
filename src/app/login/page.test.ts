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
}));

import LoginPage from "./page";

describe("login page", () => {
  it("renders brand logo linking back to home", () => {
    const html = renderToStaticMarkup(React.createElement(LoginPage));
    expect(html).toContain('href="/"');
    expect(html).toContain("시니어클럽");
    expect(html).toContain("senior-club-mark-v3.png");
  });

  it("renders both Kakao and Google social login options", () => {
    const html = renderToStaticMarkup(React.createElement(LoginPage));
    expect(html).toContain("카카오로 시작하기");
    expect(html).toContain("Google로 시작하기");
  });

  it("renders terms agreement section with master checkbox and view links", () => {
    const html = renderToStaticMarkup(React.createElement(LoginPage));
    expect(html).toContain("모두 동의하고 시작하기");
    expect(html).toContain("[필수] 서비스 이용약관 동의");
    expect(html).toContain("[필수] 개인정보 처리방침 동의");
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("내용보기");
  });

  it("renders phone login fallback with phone and name inputs", () => {
    const html = renderToStaticMarkup(React.createElement(LoginPage));
    expect(html).toContain("또는 휴대폰 번호로 로그인");
    expect(html).toContain('id="login-phone"');
    expect(html).toContain('id="login-name"');
    expect(html).toContain("010-1234-5678");
    expect(html).toContain("예: 김정희");
    expect(html).toContain("인증번호 받기");
  });

  it("renders journey steps for community introduction", () => {
    const html = renderToStaticMarkup(React.createElement(LoginPage));
    expect(html).toContain("관심사를 고르고");
    expect(html).toContain("마음 맞는 사람을 만나");
    expect(html).toContain("함께 활동해요");
  });
});
