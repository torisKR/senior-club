"use client";

import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";
import type { Route } from "next";
import { Bell, CalendarDays, Home, MessageCircle, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { clsx } from "clsx";

import { Brand } from "@/components/brand";
import { FontSizeControl } from "@/components/font-size-control";
import { ProfileSessionSync } from "@/components/profile-session-sync";

type NavigationItem = {
  href: "/" | "/clubs" | "/events" | "/chat" | "/me";
  icon: ComponentType<LucideProps>;
  label: string;
};

const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { href: "/", icon: Home, label: "홈" },
  { href: "/clubs", icon: UsersRound, label: "커뮤니티" },
  { href: "/events", icon: CalendarDays, label: "모임" },
  { href: "/chat", icon: MessageCircle, label: "채팅" },
  { href: "/me", icon: UserRound, label: "내 정보" },
];

const CHROME_FREE_PATHS = ["/login", "/onboarding"] as const;

function isPathActive(pathname: string, href: NavigationItem["href"]) {
  if (href === "/") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function shouldHideChrome(pathname: string) {
  return CHROME_FREE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function NotificationLink({ compact = false, pathname }: { compact?: boolean; pathname: string }) {
  const isActive = pathname === "/notifications" || pathname.startsWith("/notifications/");

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      aria-label="알림 보기"
      className={clsx(
        "relative inline-flex min-h-13 shrink-0 items-center justify-center gap-2 rounded-xl border font-extrabold no-underline transition-colors",
        "hover:border-[var(--primary)] hover:bg-[var(--canvas)] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--sun)] motion-reduce:transition-none",
        isActive
          ? "border-[var(--primary)] bg-[var(--sky-soft)] text-[var(--primary-strong)]"
          : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]",
        compact ? "w-13 px-0" : "px-3.5 text-[0.9rem]",
      )}
      href="/notifications"
    >
      <Bell aria-hidden="true" className="size-5" strokeWidth={2.25} />
      {!compact && <span>알림</span>}
    </Link>
  );
}

function DesktopNavigation({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="주요 메뉴" className="mx-auto flex items-center gap-1 px-4">
      {NAVIGATION_ITEMS.map((item) => {
        const isActive = isPathActive(pathname, item.href);

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={clsx(
              "relative inline-flex min-h-13 items-center justify-center rounded-xl px-3.5 text-[0.95rem] font-extrabold no-underline transition-colors",
              "focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--sun)] motion-reduce:transition-none",
              isActive
                ? "bg-[var(--primary)] text-white shadow-sm"
                : "text-[var(--muted)] hover:bg-[var(--canvas)] hover:text-[var(--primary-strong)]",
            )}
            href={item.href}
            key={item.href}
          >
            {item.label}
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute -bottom-2 left-1/2 size-1 -translate-x-1/2 rounded-full bg-[var(--sun)]"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function MobileNavigation({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="모바일 주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_96%,transparent)] px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_35px_rgba(20,52,46,0.1)] backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto grid max-w-xl grid-cols-5">
        {NAVIGATION_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = isPathActive(pathname, item.href);

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={clsx(
                "relative flex min-h-[4.6rem] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-2 text-center text-[0.72rem] font-extrabold leading-none no-underline transition-colors",
                "focus-visible:z-10 focus-visible:outline-4 focus-visible:outline-offset-0 focus-visible:outline-[var(--sun)] motion-reduce:transition-none",
                isActive
                  ? "text-[var(--primary-strong)]"
                  : "text-[var(--muted)] hover:bg-[var(--canvas)] hover:text-[var(--primary-strong)]",
              )}
              href={item.href}
              key={item.href}
            >
              <span
                className={clsx(
                  "flex size-8 items-center justify-center rounded-xl",
                  isActive && "bg-[var(--sky-soft)]",
                )}
              >
                <Icon aria-hidden="true" className="size-5" strokeWidth={isActive ? 2.6 : 2.1} />
              </span>
              <span className="w-full truncate">{item.label}</span>
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-3 top-0 h-1 rounded-b-full bg-[var(--primary)]"
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function SiteShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();

  if (shouldHideChrome(pathname)) {
    return children;
  }

  return (
    <div className="min-h-dvh">
      <ProfileSessionSync />
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] backdrop-blur-xl">
        <div className="page-container hidden min-h-[76px] items-center gap-4 lg:flex">
          <Brand priority />
          <DesktopNavigation pathname={pathname} />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <FontSizeControl />
            <NotificationLink pathname={pathname} />
          </div>
        </div>

        <div className="flex min-h-[68px] items-center gap-2 px-3 lg:hidden">
          <Brand className="mr-auto" compact priority />
          <FontSizeControl compact />
          <NotificationLink compact pathname={pathname} />
        </div>
      </header>

      <main
        className="min-h-[calc(100dvh-76px)] pb-[calc(5.35rem+env(safe-area-inset-bottom))] lg:pb-0"
        id="main-content"
        tabIndex={-1}
      >
        {children}
      </main>

      <footer className="hidden border-t border-[var(--line)] bg-[var(--surface)] lg:block">
        <div className="page-container flex min-h-24 items-center justify-between gap-6 py-5 text-sm font-bold text-[var(--muted)]">
          <p>© 2026 시니어클럽 · 목적에서 관계까지 이어지는 시니어 커뮤니티</p>
          <nav aria-label="서비스 정보" className="flex flex-wrap justify-end gap-x-5 gap-y-2">
            <Link href={"/about" as Route}>서비스 안내</Link>
            <Link href="/privacy">개인정보 처리방침</Link>
            <Link href="/terms">이용약관</Link>
            <Link href="/account-deletion">계정 삭제</Link>
          </nav>
        </div>
      </footer>

      <MobileNavigation pathname={pathname} />
    </div>
  );
}
