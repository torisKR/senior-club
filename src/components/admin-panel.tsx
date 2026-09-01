"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  Flag,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
} from "lucide-react";

type ReportStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";
type ReportFilter = "ALL" | ReportStatus;
type ReportTarget = "USER" | "POST" | "COMMENT" | "REVIEW" | "CHAT_MESSAGE";
type ReportReason =
  | "SPAM"
  | "ABUSE"
  | "HARASSMENT"
  | "MISINFORMATION"
  | "INAPPROPRIATE"
  | "OTHER";

type AdminReport = {
  id: string;
  targetType: ReportTarget;
  targetId: string | null;
  reason: ReportReason;
  detail: string | null;
  status: ReportStatus;
  resolutionNote: string | null;
  reporter: { id: string; name: string };
  resolver: { id: string; name: string } | null;
  createdAt: string;
  resolvedAt: string | null;
  updatedAt: string;
};

const REPORT_STATUSES = new Set<ReportStatus>([
  "OPEN",
  "IN_REVIEW",
  "RESOLVED",
  "DISMISSED",
]);
const REPORT_TARGETS = new Set<ReportTarget>([
  "USER",
  "POST",
  "COMMENT",
  "REVIEW",
  "CHAT_MESSAGE",
]);
const REPORT_REASONS = new Set<ReportReason>([
  "SPAM",
  "ABUSE",
  "HARASSMENT",
  "MISINFORMATION",
  "INAPPROPRIATE",
  "OTHER",
]);

const FILTERS: { id: ReportFilter; label: string }[] = [
  { id: "OPEN", label: "처리 대기" },
  { id: "IN_REVIEW", label: "검토 중" },
  { id: "ALL", label: "전체" },
  { id: "RESOLVED", label: "처리 완료" },
  { id: "DISMISSED", label: "기각" },
];
const STATUS_LABEL: Record<ReportStatus, string> = {
  OPEN: "처리 대기",
  IN_REVIEW: "검토 중",
  RESOLVED: "처리 완료",
  DISMISSED: "신고 기각",
};
const TARGET_LABEL: Record<ReportTarget, string> = {
  USER: "회원",
  POST: "게시글",
  COMMENT: "댓글",
  REVIEW: "후기",
  CHAT_MESSAGE: "채팅 메시지",
};
const REASON_LABEL: Record<ReportReason, string> = {
  SPAM: "광고·도배",
  ABUSE: "욕설·비방",
  HARASSMENT: "괴롭힘",
  MISINFORMATION: "허위 정보",
  INAPPROPRIATE: "부적절한 콘텐츠",
  OTHER: "기타",
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isoDate(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function person(value: unknown, nullable = false) {
  if (nullable && value === null) return null;
  const record = objectValue(value);
  return record && typeof record.id === "string" && typeof record.name === "string"
    ? { id: record.id, name: record.name }
    : undefined;
}

export function parseAdminReport(value: unknown): AdminReport {
  const report = objectValue(value);
  if (!report) throw new Error("신고 응답 형식을 확인하지 못했습니다.");
  const reporter = person(report.reporter);
  const resolver = person(report.resolver, true);
  if (
    typeof report.id !== "string" ||
    !REPORT_TARGETS.has(report.targetType as ReportTarget) ||
    !REPORT_REASONS.has(report.reason as ReportReason) ||
    !REPORT_STATUSES.has(report.status as ReportStatus) ||
    (report.targetId !== null && typeof report.targetId !== "string") ||
    (report.detail !== null && typeof report.detail !== "string") ||
    (report.resolutionNote !== null && typeof report.resolutionNote !== "string") ||
    !reporter ||
    resolver === undefined ||
    !isoDate(report.createdAt) ||
    !isoDate(report.updatedAt) ||
    (report.resolvedAt !== null && !isoDate(report.resolvedAt))
  ) {
    throw new Error("신고 응답 형식을 확인하지 못했습니다.");
  }
  return {
    id: report.id,
    targetType: report.targetType as ReportTarget,
    targetId: report.targetId as string | null,
    reason: report.reason as ReportReason,
    detail: report.detail as string | null,
    status: report.status as ReportStatus,
    resolutionNote: report.resolutionNote as string | null,
    reporter,
    resolver,
    createdAt: report.createdAt as string,
    resolvedAt: report.resolvedAt as string | null,
    updatedAt: report.updatedAt as string,
  };
}

function errorMessage(body: unknown, fallback: string) {
  const record = objectValue(body);
  const error = objectValue(record?.error);
  return typeof error?.message === "string" ? error.message : fallback;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminPanel() {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [activeFilter, setActiveFilter] = useState<ReportFilter>("OPEN");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const loadReports = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/reports", {
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body, "신고 목록을 불러오지 못했습니다."));
      if (!Array.isArray(body)) throw new Error("신고 응답 형식을 확인하지 못했습니다.");
      const next = body.map(parseAdminReport);
      if (!signal?.aborted) setReports(next);
    } catch (requestError) {
      if (!signal?.aborted) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "신고 목록을 불러오지 못했습니다.",
        );
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const task = window.setTimeout(() => void loadReports(controller.signal), 0);
    return () => {
      window.clearTimeout(task);
      controller.abort();
    };
  }, [loadReports]);

  const counts = useMemo(
    () => ({
      ALL: reports.length,
      OPEN: reports.filter((report) => report.status === "OPEN").length,
      IN_REVIEW: reports.filter((report) => report.status === "IN_REVIEW").length,
      RESOLVED: reports.filter((report) => report.status === "RESOLVED").length,
      DISMISSED: reports.filter((report) => report.status === "DISMISSED").length,
    }),
    [reports],
  );
  const filteredReports = useMemo(
    () =>
      activeFilter === "ALL"
        ? reports
        : reports.filter((report) => report.status === activeFilter),
    [activeFilter, reports],
  );

  async function updateReport(report: AdminReport, status: Exclude<ReportStatus, "OPEN">) {
    if (
      status === "RESOLVED" &&
      !window.confirm("신고 검토를 완료한 것으로 기록할까요?")
    ) {
      return;
    }
    setPendingId(report.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/reports/${encodeURIComponent(report.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body, "신고 상태를 변경하지 못했습니다."));
      const updated = parseAdminReport(body);
      setReports((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setAnnouncement(`${TARGET_LABEL[updated.targetType]} 신고를 ${STATUS_LABEL[updated.status]} 상태로 변경했습니다.`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "신고 상태를 변경하지 못했습니다.",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="grid min-w-0 max-w-full gap-9">
      <section aria-labelledby="admin-summary-title" className="min-w-0 max-w-full">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow"><ShieldCheck aria-hidden="true" className="size-5" />실제 신고 현황</p>
            <h2 className="section-title" id="admin-summary-title">안전 운영 상황판</h2>
          </div>
          <button className="button-quiet" disabled={loading} onClick={() => void loadReports()} type="button">
            <RefreshCw aria-hidden="true" className={`size-5 ${loading ? "animate-spin" : ""}`} />
            새로고침
          </button>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "처리 대기", value: counts.OPEN, icon: CircleAlert },
            { label: "검토 중", value: counts.IN_REVIEW, icon: SearchCheck },
            { label: "처리 완료", value: counts.RESOLVED, icon: CheckCircle2 },
            { label: "전체 신고", value: counts.ALL, icon: Flag },
          ].map(({ label, value, icon: Icon }) => (
            <div className="panel min-w-0 p-5" key={label}>
              <dt className="flex items-center gap-2 font-extrabold text-[var(--muted)]">
                <Icon aria-hidden="true" className="size-5 text-[var(--primary)]" />{label}
              </dt>
              <dd className="mt-2 text-3xl font-black tracking-[-0.04em]">{value}<span className="ml-1 text-base">건</span></dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="report-list-title" className="min-w-0 max-w-full">
        <h2 className="section-title" id="report-list-title">신고 처리</h2>
        <p className="mt-2 text-[var(--muted)]">최근 신고 최대 100건을 실제 서버 상태로 표시합니다.</p>

        <div aria-label="신고 상태" className="my-5 flex gap-2 overflow-x-auto pb-2">
          {FILTERS.map((filter) => (
            <button
              aria-pressed={activeFilter === filter.id}
              className={`shrink-0 ${activeFilter === filter.id ? "button-primary" : "button-quiet"}`}
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              type="button"
            >
              {filter.label}<span className="tag">{counts[filter.id]}</span>
            </button>
          ))}
        </div>

        {error ? (
          <div className="panel mb-5 border-l-4 border-l-[var(--accent)] p-5" role="alert">
            <p className="font-black">{error}</p>
            <button className="button-quiet mt-3" onClick={() => void loadReports()} type="button">다시 시도</button>
          </div>
        ) : null}

        {loading && reports.length === 0 ? (
          <div className="panel p-8 text-center" role="status"><Clock3 aria-hidden="true" className="mx-auto mb-3 size-8 animate-pulse" />신고 목록을 확인하고 있습니다.</div>
        ) : filteredReports.length > 0 ? (
          <ul className="m-0 grid list-none gap-4 p-0">
            {filteredReports.map((report) => (
              <li className="panel min-w-0 overflow-hidden p-5 sm:p-6" key={report.id}>
                <article className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_13rem] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tag">{TARGET_LABEL[report.targetType]}</span>
                      <span className="tag">{STATUS_LABEL[report.status]}</span>
                    </div>
                    <h3 className="mt-3 text-xl font-black">{REASON_LABEL[report.reason]}</h3>
                    <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-[var(--muted)]">
                      {report.detail ?? "신고자가 추가 설명을 남기지 않았습니다."}
                    </p>
                    <dl className="mt-4 grid gap-1 text-base text-[var(--muted)]">
                      <div><dt className="inline font-black">신고자: </dt><dd className="inline">{report.reporter.name}</dd></div>
                      <div><dt className="inline font-black">접수: </dt><dd className="inline">{formatDate(report.createdAt)}</dd></div>
                      <div><dt className="inline font-black">대상 ID: </dt><dd className="inline break-all">{report.targetId ?? "삭제된 대상"}</dd></div>
                    </dl>
                  </div>
                  <div className="grid gap-2">
                    {report.status === "OPEN" ? (
                      <button className="button-quiet w-full" disabled={pendingId === report.id} onClick={() => void updateReport(report, "IN_REVIEW")} type="button">검토 시작</button>
                    ) : null}
                    {report.status === "OPEN" || report.status === "IN_REVIEW" ? (
                      <>
                        <button className="button-primary w-full" disabled={pendingId === report.id} onClick={() => void updateReport(report, "RESOLVED")} type="button">처리 완료</button>
                        <button className="button-quiet w-full" disabled={pendingId === report.id} onClick={() => void updateReport(report, "DISMISSED")} type="button">신고 기각</button>
                      </>
                    ) : null}
                    {report.resolver ? <p className="text-center text-sm font-bold text-[var(--muted)]">처리자 {report.resolver.name}</p> : null}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <div className="panel p-8 text-center sm:p-12">
            <ShieldCheck aria-hidden="true" className="mx-auto size-12 text-[var(--success)]" />
            <h3 className="mt-3 text-xl font-black">해당 상태의 신고가 없습니다</h3>
          </div>
        )}
      </section>

      <p aria-live="polite" className="screen-reader-only" role="status">{announcement}</p>
    </div>
  );
}
