"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  CircleAlert,
  LogOut,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { BackendUser } from "@/lib/auth/server";
import {
  PROFILE_SESSION_SYNC_KEY,
  clearServerProfileCache,
} from "@/lib/profile-cache";

type Application = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";
  attendance: "NOT_CHECKED" | "ATTENDED" | "ABSENT";
  event: {
    id: string;
    title: string;
    startAt: string;
    locationName: string;
  };
};

type NotificationPreferences = {
  pushEnabled: boolean;
  pushEventUpdates: boolean;
  pushChatMessages: boolean;
  emailEventUpdates: boolean;
  emailNewsletter: boolean;
};

const ROLE_LABELS = {
  MEMBER: "일반 회원",
  LEADER: "모임 리더",
  ADMIN: "관리자",
} as const;

async function apiMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return payload.error?.message ?? "요청을 처리하지 못했습니다.";
  } catch {
    return "서버 응답을 확인하지 못했습니다.";
  }
}

export function ProfilePanel({ initialUser }: { initialUser: BackendUser }) {
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => ({
    pushEnabled: initialUser.notificationPreference?.pushEnabled ?? false,
    pushEventUpdates: initialUser.notificationPreference?.pushEventUpdates ?? true,
    pushChatMessages: initialUser.notificationPreference?.pushChatMessages ?? true,
    emailEventUpdates: initialUser.notificationPreference?.emailEventUpdates ?? true,
    emailNewsletter: initialUser.notificationPreference?.emailNewsletter ?? false,
  }));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/me/applications", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error(await apiMessage(response));
      if (!controller.signal.aborted) {
        setApplications((await response.json()) as Application[]);
      }
    }).catch((caught) => {
      if (!controller.signal.aborted) {
        setError(caught instanceof Error ? caught.message : "활동 내역을 불러오지 못했습니다.");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false);
    });
    return () => controller.abort();
  }, []);

  const activity = useMemo(() => {
    return {
      upcoming: applications.filter(
        (item) =>
          (item.status === "PENDING" || item.status === "APPROVED") &&
          item.attendance === "NOT_CHECKED",
      ).length,
      attended: applications.filter((item) => item.attendance === "ATTENDED").length,
      pending: applications.filter((item) => item.status === "PENDING").length,
    };
  }, [applications]);

  async function updatePreference(
    key: "emailEventUpdates" | "emailNewsletter",
    value: boolean,
  ) {
    const previous = preferences;
    setPreferences((current) => ({ ...current, [key]: value }));
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/me/notification-preferences", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!response.ok) throw new Error(await apiMessage(response));
      setPreferences((await response.json()) as NotificationPreferences);
      setMessage("알림 설정을 저장했습니다.");
    } catch (caught) {
      setPreferences(previous);
      setError(caught instanceof Error ? caught.message : "알림 설정을 저장하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function logout() {
    setIsLoggingOut(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error(await apiMessage(response));
      clearServerProfileCache(window.localStorage);
      try {
        window.sessionStorage.removeItem(PROFILE_SESSION_SYNC_KEY);
      } catch {
        // Session termination does not depend on browser storage access.
      }
      router.replace("/login");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "로그아웃하지 못했습니다.");
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] shadow-[0_20px_60px_rgba(34,49,39,0.07)]">
          <div className="h-24 bg-[linear-gradient(110deg,var(--primary),var(--primary-strong))] sm:h-32" />
          <div className="px-6 pb-7 sm:px-8 sm:pb-9">
            <div className="-mt-11 flex items-end gap-4 sm:-mt-12">
              <span className="grid h-24 w-24 shrink-0 place-items-center rounded-[1.7rem] border-[6px] border-[var(--surface)] bg-[var(--canvas)] text-[var(--primary-strong)] shadow-sm">
                <UserRound aria-hidden="true" className="h-12 w-12" />
              </span>
              <div className="pb-1">
                <p className="text-[18px] font-extrabold text-[var(--primary-strong)]">
                  {ROLE_LABELS[initialUser.role]}
                </p>
                <h2 className="text-3xl font-black tracking-[-0.04em]">{initialUser.name}</h2>
              </div>
            </div>

            <dl className="mt-7 grid gap-3 sm:grid-cols-2">
              <div className="flex min-h-14 items-center gap-3 rounded-2xl bg-[var(--canvas)] px-4 py-3">
                <Smartphone aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--primary-strong)]" />
                <div className="min-w-0">
                  <dt className="text-sm font-bold text-[var(--muted)]">인증 휴대폰</dt>
                  <dd className="truncate text-[17px] font-extrabold">{initialUser.phoneNumber ?? "등록된 번호 없음"}</dd>
                </div>
              </div>
              <div className="flex min-h-14 items-center gap-3 rounded-2xl bg-[var(--canvas)] px-4 py-3">
                <MapPin aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--primary-strong)]" />
                <div>
                  <dt className="text-sm font-bold text-[var(--muted)]">활동 지역</dt>
                  <dd className="text-[17px] font-extrabold">{initialUser.region ?? "아직 설정하지 않음"}</dd>
                </div>
              </div>
            </dl>
          </div>
        </section>

        <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
          <p className="text-[18px] font-extrabold text-[var(--primary-strong)]">나의 취향</p>
          <h2 className="mt-1 text-2xl font-black tracking-[-0.03em]">관심사</h2>
          {initialUser.interests?.length ? (
            <ul className="mt-6 grid gap-3 sm:grid-cols-3">
              {initialUser.interests.map((interest) => (
                <li key={interest.id} className="flex min-h-16 items-center rounded-2xl bg-[var(--canvas)] px-4 py-3 text-[18px] font-extrabold">
                  {interest.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 rounded-2xl bg-[var(--canvas)] px-5 py-4 text-[17px] font-bold text-[var(--muted)]">
              관심사를 설정하면 가까운 모임 추천이 더 정확해집니다.
            </p>
          )}
        </section>

        <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <BellRing aria-hidden="true" className="mt-1 h-6 w-6 shrink-0 text-[var(--primary-strong)]" />
            <div>
              <h2 className="text-2xl font-black tracking-[-0.03em]">알림 설정</h2>
              <p className="mt-2 text-[17px] leading-7 text-[var(--muted)]">
                모임 승인·변경 안내는 앱 푸시로 안내하며, 이메일을 등록한 계정은 이메일도 받을 수 있습니다.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-3">
            <label className="flex min-h-16 items-center justify-between gap-4 rounded-2xl bg-[var(--canvas)] px-4 py-3 text-[17px] font-extrabold">
              모임 진행 이메일
              <input
                checked={preferences.emailEventUpdates}
                className="h-6 w-6 accent-[var(--primary)]"
                disabled={isSaving}
                onChange={(event) => void updatePreference("emailEventUpdates", event.target.checked)}
                type="checkbox"
              />
            </label>
            <label className="flex min-h-16 items-center justify-between gap-4 rounded-2xl bg-[var(--canvas)] px-4 py-3 text-[17px] font-extrabold">
              월간 소식지 이메일 (선택)
              <input
                checked={preferences.emailNewsletter}
                className="h-6 w-6 accent-[var(--primary)]"
                disabled={isSaving}
                onChange={(event) => void updatePreference("emailNewsletter", event.target.checked)}
                type="checkbox"
              />
            </label>
          </div>
          {message ? <p className="mt-4 font-bold text-[var(--primary)]" role="status">{message}</p> : null}
        </section>
      </div>

      <aside className="space-y-6" aria-label="나의 활동 요약">
        <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
          <p className="text-[18px] font-extrabold text-[var(--primary-strong)]">활동 현황</p>
          <h2 className="mt-1 text-2xl font-black tracking-[-0.03em]">함께할 약속을 확인하세요</h2>
          <dl className="mt-6 grid grid-cols-3 gap-2 text-center" aria-busy={isLoading}>
            {[
              { label: "예정 모임", value: activity.upcoming },
              { label: "승인 대기", value: activity.pending },
              { label: "참여 완료", value: activity.attended },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-[var(--canvas)] px-2 py-4">
                <dt className="text-[16px] font-bold leading-7 text-[var(--muted)]">{item.label}</dt>
                <dd className="mt-1 text-3xl font-black text-[var(--primary-strong)]">{isLoading ? "–" : item.value}</dd>
              </div>
            ))}
          </dl>
          <Link href="/events" className="mt-6 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-3 text-[18px] font-extrabold text-white outline-none transition hover:bg-[var(--primary-strong)] focus-visible:ring-4 focus-visible:ring-[var(--primary)]/35">
            모임 찾아보기
            <ArrowRight aria-hidden="true" className="h-5 w-5" />
          </Link>
        </section>

        <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
          <h2 className="text-2xl font-black tracking-[-0.03em]">내 활동 바로가기</h2>
          <div className="mt-5 grid gap-3">
            {([
              { label: "예정된 모임", href: "/events", icon: CalendarDays },
              { label: "모임 채팅", href: "/chat", icon: MessageCircle },
              { label: "관심 커뮤니티", href: "/clubs", icon: UsersRound },
              { label: "계정 및 데이터 삭제", href: "/account-deletion", icon: ShieldCheck },
            ] as const).map(({ label, href, icon: Icon }) => (
              <Link key={label} href={href} className="group flex min-h-14 items-center gap-3 rounded-2xl bg-[var(--canvas)] px-4 py-3 text-[18px] font-extrabold outline-none transition hover:bg-[var(--primary)]/10 focus-visible:ring-4 focus-visible:ring-[var(--primary)]/30">
                <Icon aria-hidden="true" className="h-6 w-6 text-[var(--primary-strong)]" />
                {label}
                <ArrowRight aria-hidden="true" className="ml-auto h-5 w-5 text-[var(--muted)] transition group-hover:translate-x-1" />
              </Link>
            ))}
          </div>
        </section>

        {error ? (
          <p className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-700" role="alert">
            <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            {error}
          </p>
        ) : null}

        <button type="button" disabled={isLoggingOut} onClick={logout} className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-[18px] font-bold text-[var(--muted)] outline-none transition hover:bg-[var(--surface)] hover:text-[var(--ink)] focus-visible:ring-4 focus-visible:ring-[var(--primary)]/30 disabled:cursor-wait disabled:opacity-60">
          <LogOut aria-hidden="true" className="h-5 w-5" />
          {isLoggingOut ? "로그아웃 중…" : "로그아웃"}
        </button>
      </aside>
    </div>
  );
}
