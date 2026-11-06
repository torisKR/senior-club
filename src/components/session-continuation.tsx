"use client";

import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { browserSessionStillCurrent, readBrowserSession } from "@/lib/auth/browser-session";
import { navigateAfterSessionRestore } from "@/lib/auth/browser-navigation";
import { continuationDestination } from "@/lib/auth/continue-destination";
import { postLoginRoute } from "@/lib/auth/post-login-route";
import { clearServerProfileCache } from "@/lib/profile-cache";

export function SessionContinuation({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const destination = continuationDestination(returnTo);
  const loginHref = `/login?returnTo=${encodeURIComponent(destination)}` as const;
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void readBrowserSession({ signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Session unavailable");
      const session = await response.json() as {
        authenticated?: boolean;
        user?: { id?: unknown; onboardingCompletedAt?: unknown };
      };
      if (!browserSessionStillCurrent(response)) return;
      if (session.authenticated !== true) {
        try { clearServerProfileCache(window.localStorage); } catch { /* Optional browser mirror. */ }
        router.replace(loginHref);
        return;
      }
      if (typeof session.user?.id !== "string" || !session.user.id) throw new Error("Invalid session");
      navigateAfterSessionRestore(postLoginRoute(destination, session.user.onboardingCompletedAt));
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [attempt, destination, loginHref, router]);

  return (
    <section aria-busy={!error} className="mx-auto w-full max-w-xl rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-6 text-center sm:p-10">
      {!error && <LoaderCircle aria-hidden="true" className="mx-auto mb-5 size-10 animate-spin text-[var(--primary)] motion-reduce:animate-none" />}
      <h1 className="text-3xl font-black tracking-[-0.04em]">
        {error ? "연결이 원활하지 않아요" : "로그인 상태를 확인하고 있어요"}
      </h1>
      <p className="mt-4 text-[18px] leading-8 text-[var(--muted)]" role={error ? "alert" : "status"}>
        {error ? "인터넷 연결을 확인하고 다시 시도해 주세요." : "잠시 후 원래 보던 화면으로 이동합니다."}
      </p>
      {error && (
        <div className="mt-7 flex flex-col gap-3">
          <button className="button-primary" onClick={() => { setError(false); setAttempt((value) => value + 1); }} type="button">다시 시도</button>
          <Link className="button-secondary" href={loginHref}>카카오 로그인으로 돌아가기</Link>
        </div>
      )}
    </section>
  );
}
