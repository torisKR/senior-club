"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Brand } from "@/components/brand";
import { browserSessionStillCurrent, readBrowserSession } from "@/lib/auth/browser-session";
import { sanitizeReturnTo } from "@/lib/auth/return-to";
import { postLoginRoute } from "@/lib/auth/post-login-route";
import {
  PROFILE_SESSION_SYNC_KEY,
  syncServerProfileCacheFromSession,
} from "@/lib/profile-cache";

const JOURNEY = [
  { label: "관심사를 고르고", icon: Sparkles },
  { label: "마음 맞는 사람을 만나", icon: Users },
  { label: "함께 활동해요", icon: HeartHandshake },
];

type SessionProfilePayload = {
  authenticated?: boolean;
  user?: {
    id?: unknown;
    name?: unknown;
    birthYear?: unknown;
    region?: unknown;
    onboardingCompletedAt?: unknown;
    interests?: unknown;
  };
};

function returnDestination() {
  if (typeof window === "undefined") return "/";
  return sanitizeReturnTo(
    new URLSearchParams(window.location.search).get("returnTo"),
  );
}

async function syncProfileFromSession(signal?: AbortSignal) {
  const response = await readBrowserSession({ signal });
  if (!response.ok) return null;

  const session = (await response.json()) as SessionProfilePayload;
  if (!browserSessionStillCurrent(response)) return null;
  if (syncServerProfileCacheFromSession(window.localStorage, session)) {
    try {
      window.sessionStorage.setItem(PROFILE_SESSION_SYNC_KEY, "done");
    } catch {
      // Cache synchronization is still valid without the per-tab marker.
    }
  }
  return session.authenticated === true ? session : null;
}

function KakaoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 3C6.477 3 2 6.477 2 10.767c0 2.766 1.874 5.188 4.707 6.556l-1.196 4.394a.5.5 0 0 0 .74.56l5.244-3.48c.168.01.336.02.505.02 5.523 0 10-3.477 10-7.767C22 6.477 17.523 3 12 3z" />
    </svg>
  );
}

function subscribeToLoginUrl(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function getLoginUrlError() {
  return new URLSearchParams(window.location.search).get("error") ?? "";
}

function getServerLoginUrlError() {
  return "";
}

export default function LoginPage() {
  const router = useRouter();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  // Hydration starts with the same empty snapshot as SSR, then reads the URL.
  const urlError = useSyncExternalStore(
    subscribeToLoginUrl,
    getLoginUrlError,
    getServerLoginUrlError,
  );
  const [formError, setError] = useState<string | null>(null);
  const error = formError ?? urlError;

  const allAccepted = termsAccepted && privacyAccepted;

  function toggleAllAccepted(checked: boolean) {
    setTermsAccepted(checked);
    setPrivacyAccepted(checked);
    setError("");
  }

  useEffect(() => {
    const controller = new AbortController();
    void syncProfileFromSession(controller.signal).then((session) => {
      if (!controller.signal.aborted && session) {
        router.replace(
          postLoginRoute(
            returnDestination(),
            session.user?.onboardingCompletedAt,
          ),
        );
      }
    }).catch(() => undefined);
    return () => controller.abort();
  }, [router]);

  function startKakaoLogin() {
    if (!termsAccepted || !privacyAccepted) {
      setError("이용약관과 개인정보 처리방침에 동의해 주세요.");
      return;
    }
    const params = new URLSearchParams({
      returnTo: returnDestination(),
      termsAccepted: "1",
      privacyAccepted: "1",
    });
    window.location.assign(`/api/auth/kakao/authorize?${params.toString()}`);
  }

  return (
    <main
      id="main-content"
      className="min-h-screen bg-[var(--canvas)] px-5 py-6 text-[var(--ink)] sm:px-8 lg:px-12"
    >
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col">
        <header className="flex items-center justify-between gap-4 py-2">
          <Brand priority />
          <span className="hidden rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-[16px] font-bold text-[var(--muted)] sm:inline-flex">
            간편하고 안전한 로그인
          </span>
        </header>

        <div className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-12">
          <section aria-labelledby="login-heading" className="max-w-2xl">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-[var(--primary)]/10 px-4 py-2 text-[18px] font-bold text-[var(--primary-strong)]">
              <Sparkles aria-hidden="true" className="h-5 w-5" />
              오늘부터 이어지는 새로운 관계
            </p>
            <h1
              id="login-heading"
              className="text-[clamp(2.5rem,7vw,5.6rem)] font-black leading-[1.03] tracking-[-0.055em]"
            >
              좋아하는 일을
              <br />
              <span className="text-[var(--primary-strong)]">함께</span> 시작해요.
            </h1>
            <p className="mt-7 max-w-xl text-[20px] leading-8 text-[var(--muted)] sm:text-[22px] sm:leading-9">
              목적이 같은 사람과 만나 활동하고, 다음 약속으로 이어지는
              시니어 커뮤니티입니다.
            </p>

            <ol className="mt-8 grid gap-2.5 sm:grid-cols-3" aria-label="시니어클럽 활동 과정">
              {JOURNEY.map(({ label, icon: Icon }, index) => (
                <li
                  key={label}
                  className="flex min-h-16 items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[17px] font-bold"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary-strong)]">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-[15px] font-extrabold text-[var(--primary-strong)]">
                      0{index + 1}
                    </span>
                    {label}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section
            id="login-card"
            aria-labelledby="kakao-login-title"
            className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_24px_70px_rgba(34,49,39,0.10)] sm:p-9"
          >
            <div className="grid h-15 w-15 place-items-center rounded-2xl bg-[var(--primary)]/12 text-[var(--primary-strong)]">
              <ShieldCheck aria-hidden="true" className="h-8 w-8" />
            </div>
            <h2
              id="kakao-login-title"
              className="mt-6 text-3xl font-black tracking-[-0.035em]"
            >
              카카오로 시작하기
            </h2>
            <p className="mt-3 text-[18px] leading-8 text-[var(--muted)]">
              카카오 계정으로 간편하게 로그인하세요. 이름·닉네임·전화번호는
              로그인에 필요하지 않으며, 프로필에서 선택해서 입력할 수 있어요.
            </p>

            <div className="mt-7 grid gap-5">
              <fieldset className="grid gap-3 rounded-2xl border border-[var(--line)] bg-[var(--canvas)] p-4">
                <legend className="sr-only">필수 약관 동의</legend>
                <label className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-[var(--line)] pb-3 text-[18px] font-extrabold">
                  <input checked={allAccepted} className="h-6 w-6 shrink-0 accent-[var(--primary)]" onChange={(event) => toggleAllAccepted(event.target.checked)} type="checkbox" />
                  <span>모두 동의하고 시작하기</span>
                </label>
                {([
                  { id: "login-terms", label: "[필수] 서비스 이용약관 동의", href: "/terms", checked: termsAccepted, set: setTermsAccepted },
                  { id: "login-privacy", label: "[필수] 개인정보 처리방침 동의", href: "/privacy", checked: privacyAccepted, set: setPrivacyAccepted },
                ] as const).map((agreement) => (
                  <div key={agreement.id} className="flex flex-wrap items-center justify-between gap-x-3 text-[16px]">
                    <label className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 font-semibold" htmlFor={agreement.id}>
                      <input id={agreement.id} checked={agreement.checked} className="h-6 w-6 shrink-0 accent-[var(--primary)]" onChange={(event) => { agreement.set(event.target.checked); setError(""); }} type="checkbox" />
                      <span>{agreement.label}</span>
                    </label>
                    <Link aria-label={agreement.href === "/terms" ? "서비스 이용약관 내용보기" : "개인정보 처리방침 내용보기"} className="inline-flex min-h-14 shrink-0 items-center px-2 font-bold text-[var(--primary-strong)] underline underline-offset-4" href={agreement.href} rel="noopener noreferrer" target="_blank">내용보기</Link>
                  </div>
                ))}
              </fieldset>

              {error ? (
                <p
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[17px] font-bold text-red-700"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <button type="button" onClick={startKakaoLogin} className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#FEE500] px-6 py-3 text-[19px] font-extrabold text-[#191919] shadow-sm transition hover:bg-[#FDD800] focus-visible:ring-4 focus-visible:ring-[var(--focus)]/30">
                <KakaoIcon className="h-6 w-6 shrink-0" />
                카카오로 시작하기
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
