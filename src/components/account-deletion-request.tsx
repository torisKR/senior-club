"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleAlert, LoaderCircle, LogIn, Trash2, Undo2 } from "lucide-react";

import {
  loadAccountDeletionRequest,
  type AccountDeletionRecord,
} from "@/lib/protected-resource-client";
import {
  PROFILE_SESSION_SYNC_KEY,
  clearServerProfileCache,
} from "@/lib/profile-cache";

type ViewState = "loading" | "anonymous" | "ready" | "submitted";

function messageFrom(value: unknown, fallback: string) {
  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    value.error &&
    typeof value.error === "object" &&
    "message" in value.error &&
    typeof value.error.message === "string"
  ) {
    return value.error.message;
  }
  return fallback;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function AccountDeletionRequest() {
  const [view, setView] = useState<ViewState>("loading");
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [deletionRequest, setDeletionRequest] = useState<AccountDeletionRecord | null>(null);
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await loadAccountDeletionRequest();
        if (!active) return;
        if (!result.authenticated) {
          setView("anonymous");
          return;
        }
        setDeletionRequest(result.deletionRequest);
        setView("ready");
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "삭제 요청 상태를 확인하지 못했습니다.");
        setView("ready");
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function submit() {
    if (confirmation !== "계정 삭제") {
      setError("확인을 위해 ‘계정 삭제’를 정확히 입력해 주세요.");
      return;
    }
    setIsBusy(true);
    setError("");
    try {
      const response = await fetch("/api/me/deletion-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      const body = (await response.json()) as {
        deletionRequest?: AccountDeletionRecord;
        error?: { message?: string };
      };
      if (!response.ok || !body.deletionRequest) {
        throw new Error(messageFrom(body, "계정 삭제를 요청하지 못했습니다."));
      }
      clearServerProfileCache(window.localStorage);
      try {
        window.sessionStorage.removeItem(PROFILE_SESSION_SYNC_KEY);
      } catch {
        // Server-side session revocation is authoritative.
      }
      setDeletionRequest(body.deletionRequest);
      setView("submitted");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "계정 삭제를 요청하지 못했습니다.");
    } finally {
      setIsBusy(false);
    }
  }

  async function cancel() {
    setIsBusy(true);
    setError("");
    try {
      const response = await fetch("/api/me/deletion-request", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = (await response.json()) as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !body.success) {
        throw new Error(messageFrom(body, "삭제 요청을 취소하지 못했습니다."));
      }
      setDeletionRequest(null);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "삭제 요청을 취소하지 못했습니다.");
    } finally {
      setIsBusy(false);
    }
  }

  if (view === "loading") {
    return (
      <div className="mt-5 flex min-h-40 items-center justify-center rounded-[2rem] border border-[var(--line)] bg-[var(--surface)]" role="status">
        <LoaderCircle aria-hidden="true" className="size-7 animate-spin text-[var(--primary)]" />
        <span className="ml-3 text-[18px] font-bold">로그인 상태를 확인하고 있습니다.</span>
      </div>
    );
  }

  if (view === "anonymous") {
    return (
      <div className="mt-5 rounded-[2rem] bg-[var(--ink)] p-6 text-white sm:p-8">
        <LogIn aria-hidden="true" className="size-8 text-[var(--sun)]" />
        <h3 className="mt-4 text-xl font-black">가입한 계정으로 먼저 로그인해 주세요.</h3>
        <p className="mt-3 text-[17px] leading-7 text-white/85 sm:text-[18px]">
          본인 확인 후 이 페이지에서 계정과 연결된 데이터 삭제를 바로 요청할 수 있습니다.
        </p>
        <Link className="mt-6 inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-white px-5 py-3 text-[18px] font-black text-[var(--ink)] sm:w-auto" href="/login?returnTo=%2Faccount-deletion">
          로그인하고 삭제 요청
        </Link>
      </div>
    );
  }

  if (deletionRequest) {
    return (
      <div className="mt-5 rounded-[2rem] border border-[var(--accent)]/35 bg-[var(--accent-soft)] p-6 sm:p-8">
        <h3 className="text-xl font-black">계정 삭제가 요청되었습니다.</h3>
        <p className="mt-3 text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
          예정일은 <strong>{formatDate(deletionRequest.scheduledFor)}</strong>입니다.
          {view === "submitted" ? " 보안을 위해 현재 기기의 세션은 로그아웃되었습니다." : ""}
        </p>
        {view !== "submitted" && deletionRequest.status === "REQUESTED" ? (
          <button className="button-secondary mt-6 w-full sm:w-auto" disabled={isBusy} onClick={() => void cancel()} type="button">
            <Undo2 aria-hidden="true" className="size-5" />
            {isBusy ? "취소 처리 중…" : "삭제 요청 취소"}
          </button>
        ) : null}
        {view === "submitted" ? (
          <Link className="button-secondary mt-6 w-full sm:w-auto" href="/login?returnTo=%2Faccount-deletion">
            요청을 취소하려면 다시 로그인
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="panel mt-5 p-6 sm:p-8">
      <p className="text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
        요청 즉시 모든 로그인 세션과 푸시 토큰이 해제됩니다. 7일의 유예 기간 안에는 다시 로그인해 요청을 취소할 수 있습니다.
      </p>
      <label className="mt-6 block text-[17px] font-black" htmlFor="deletion-reason">
        탈퇴 이유 <span className="font-semibold text-[var(--muted)]">(선택)</span>
      </label>
      <textarea className="input-shell mt-2 min-h-28 w-full resize-y" id="deletion-reason" maxLength={500} onChange={(event) => setReason(event.target.value)} value={reason} />
      <label className="mt-6 block text-[17px] font-black" htmlFor="deletion-confirmation">
        확인을 위해 <strong>계정 삭제</strong>를 입력해 주세요.
      </label>
      <input autoComplete="off" className="input-shell mt-2 w-full" id="deletion-confirmation" onChange={(event) => setConfirmation(event.target.value)} value={confirmation} />
      {error ? (
        <p className="mt-4 flex items-start gap-2 font-bold text-red-700" role="alert">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {error}
        </p>
      ) : null}
      <button className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-[18px] font-black text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto" disabled={isBusy || confirmation !== "계정 삭제"} onClick={() => void submit()} type="button">
        <Trash2 aria-hidden="true" className="size-5" />
        {isBusy ? "삭제 요청 중…" : "계정과 데이터 삭제 요청"}
      </button>
    </div>
  );
}
