"use client";

import {
  CalendarDays,
  Check,
  CircleAlert,
  Clock3,
  LoaderCircle,
  MapPin,
  MessageCircleMore,
  PencilLine,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type ApplicationStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";
type ApplicationFilter = ApplicationStatus | "ALL";
type AttendanceStatus = "NOT_CHECKED" | "ATTENDED" | "NO_SHOW";
type AttendanceDecision = Exclude<AttendanceStatus, "NOT_CHECKED">;
type ManagedEventView = "upcoming" | "attendance" | "drafts";

type ManagedEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  locationName: string;
  capacity: number;
  participantCount: number;
  pendingCount: number;
  remainingCapacity: number;
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "COMPLETED";
  club: { slug: string; title: string };
};

type Applicant = {
  name: string;
  ageGroup: string | null;
  region: string | null;
  interests: Array<{ slug: string; name: string }>;
  attendedEventCount: number;
};

type Application = {
  id: string;
  status: ApplicationStatus;
  attendance: AttendanceStatus;
  appliedAt: string;
  decidedAt: string | null;
  updatedAt: string;
  applicant: Applicant;
};

type CursorPage = { nextCursor: string | null; hasNextPage: boolean };
type ManagedEventsResponse = { data: ManagedEvent[]; page: CursorPage };
type ApplicationsResponse = {
  event: ManagedEvent;
  applications: Application[];
  page: CursorPage;
};

type AttendanceUpdate = {
  id: string;
  attendance: AttendanceDecision;
  checkedInAt: string | null;
  updatedAt: string;
};

type AttendanceFailure = {
  applicationId: string;
  attendance: AttendanceDecision;
  reason?: string;
  message: string;
  status: number | null;
  code?: string;
};

const FILTERS: Array<{ id: ApplicationFilter; label: string }> = [
  { id: "PENDING", label: "승인 대기" },
  { id: "ALL", label: "전체" },
  { id: "APPROVED", label: "승인" },
  { id: "REJECTED", label: "거절" },
  { id: "CANCELED", label: "신청 취소" },
];

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인됨",
  REJECTED: "거절됨",
  CANCELED: "신청 취소",
};

const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  NOT_CHECKED: "출석 미확인",
  ATTENDED: "참석",
  NO_SHOW: "불참",
};

class LeaderRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "LeaderRequestError";
  }
}

async function apiFailure(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    return new LeaderRequestError(
      payload.error?.message ?? "요청을 처리하지 못했습니다.",
      response.status,
      payload.error?.code,
    );
  } catch {
    return new LeaderRequestError(
      "서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      response.status,
    );
  }
}

async function apiMessage(response: Response) {
  return (await apiFailure(response)).message;
}

export function canDecideApplication(
  applicationStatus: ApplicationStatus,
  eventStatus: ManagedEvent["status"],
  startAt: string,
  nowMs: number,
) {
  const startMs = Date.parse(startAt);
  return (
    applicationStatus === "PENDING" &&
    eventStatus === "PUBLISHED" &&
    Number.isFinite(startMs) &&
    startMs > nowMs
  );
}

export function canMarkAttendance(
  applicationStatus: ApplicationStatus,
  eventView: ManagedEventView,
  startAt: string,
  nowMs: number,
) {
  const startMs = Date.parse(startAt);
  return (
    applicationStatus === "APPROVED" &&
    eventView === "attendance" &&
    Number.isFinite(startMs) &&
    startMs <= nowMs
  );
}

export function parseAttendanceUpdate(
  value: unknown,
  expectedApplicationId: string,
): AttendanceUpdate | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AttendanceUpdate>;
  if (
    candidate.id !== expectedApplicationId ||
    (candidate.attendance !== "ATTENDED" &&
      candidate.attendance !== "NO_SHOW") ||
    (candidate.checkedInAt !== null &&
      (typeof candidate.checkedInAt !== "string" ||
        !Number.isFinite(Date.parse(candidate.checkedInAt)))) ||
    typeof candidate.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.updatedAt))
  ) {
    return null;
  }
  return candidate as AttendanceUpdate;
}

export function attendanceRecovery(status: number | null) {
  return status === 403 || status === 409 ? "reload" : "retry";
}

export function attendanceFailureTitle(status: number | null) {
  if (status === 403) return "출석 처리 권한을 확인해 주세요";
  if (status === 409) return "현재 신청 상태와 맞지 않습니다";
  return "출석 처리를 완료하지 못했습니다";
}

export function managedEventsApiPath(
  view: ManagedEventView,
  cursor?: string | null,
) {
  const query = new URLSearchParams({ limit: "50", view });
  if (cursor) query.set("cursor", cursor);
  return `/api/leader/events?${query.toString()}`;
}

function eventDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function appliedDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function daysUntil(value: string, nowMs: number) {
  const difference = new Date(value).getTime() - nowMs;
  return Math.max(Math.ceil(difference / (24 * 60 * 60 * 1_000)), 0);
}

export function LeaderPanel() {
  const [upcomingEvents, setUpcomingEvents] = useState<ManagedEvent[]>([]);
  const [attendanceEvents, setAttendanceEvents] = useState<ManagedEvent[]>([]);
  const [draftEvents, setDraftEvents] = useState<ManagedEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [snapshot, setSnapshot] = useState<ApplicationsResponse | null>(null);
  const [activeFilter, setActiveFilter] = useState<ApplicationFilter>("PENDING");
  const [isEventsLoading, setIsEventsLoading] = useState(true);
  const [isApplicationsLoading, setIsApplicationsLoading] = useState(false);
  const [eventsReloadKey, setEventsReloadKey] = useState(0);
  const [applicationsReloadKey, setApplicationsReloadKey] = useState(0);
  const [upcomingNextCursor, setUpcomingNextCursor] = useState<string | null>(null);
  const [attendanceNextCursor, setAttendanceNextCursor] = useState<string | null>(null);
  const [draftNextCursor, setDraftNextCursor] = useState<string | null>(null);
  const [applicationsNextCursor, setApplicationsNextCursor] = useState<
    string | null
  >(null);
  const [isLoadingMoreUpcoming, setIsLoadingMoreUpcoming] = useState(false);
  const [isLoadingMoreAttendance, setIsLoadingMoreAttendance] = useState(false);
  const [isLoadingMoreDrafts, setIsLoadingMoreDrafts] = useState(false);
  const [isLoadingMoreApplications, setIsLoadingMoreApplications] =
    useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [attendanceEditingId, setAttendanceEditingId] = useState<string | null>(null);
  const [attendanceReason, setAttendanceReason] = useState("");
  const [attendanceFailure, setAttendanceFailure] = useState<AttendanceFailure | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const submittingRef = useRef<string | null>(null);
  const selectedEventRef = useRef(selectedEventId);

  useEffect(() => {
    selectedEventRef.current = selectedEventId;
  }, [selectedEventId]);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const loadView = async (view: ManagedEventView) => {
      const response = await fetch(managedEventsApiPath(view), {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await apiMessage(response));
      return (await response.json()) as ManagedEventsResponse;
    };

    void Promise.all([
      loadView("upcoming"),
      loadView("attendance"),
      loadView("drafts"),
    ])
      .then(([upcoming, attendance, drafts]) => {
        if (controller.signal.aborted) return;
        setUpcomingEvents(upcoming.data);
        setAttendanceEvents(attendance.data);
        setDraftEvents(drafts.data);
        setUpcomingNextCursor(upcoming.page.nextCursor);
        setAttendanceNextCursor(attendance.page.nextCursor);
        setDraftNextCursor(drafts.page.nextCursor);

        const current = selectedEventRef.current;
        const allEvents = [...attendance.data, ...upcoming.data];
        const nextId = allEvents.some(({ id }) => id === current)
          ? current
          : (allEvents[0]?.id ?? "");
        selectedEventRef.current = nextId;
        setSelectedEventId(nextId);
        if (nextId) {
          setIsApplicationsLoading(true);
          setActiveFilter(
            attendance.data.some(({ id }) => id === nextId)
              ? "APPROVED"
              : "PENDING",
          );
        }
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "담당 모임을 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsEventsLoading(false);
      });

    return () => controller.abort();
  }, [eventsReloadKey]);

  useEffect(() => {
    if (!selectedEventId) return;

    const controller = new AbortController();

    void fetch(
      `/api/leader/events/${encodeURIComponent(selectedEventId)}/applications?limit=100`,
      {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(await apiMessage(response));
        return (await response.json()) as ApplicationsResponse;
      })
      .then((payload) => {
        if (
          !controller.signal.aborted &&
          selectedEventRef.current === selectedEventId
        ) {
          setSnapshot(payload);
          setApplicationsNextCursor(payload.page.nextCursor);
        }
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "참가 신청을 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsApplicationsLoading(false);
      });

    return () => controller.abort();
  }, [applicationsReloadKey, selectedEventId]);

  const applications = useMemo(
    () => snapshot?.applications ?? [],
    [snapshot],
  );
  const event = snapshot?.event ?? null;
  const selectedEventView: ManagedEventView = attendanceEvents.some(
    ({ id }) => id === selectedEventId,
  )
    ? "attendance"
    : "upcoming";
  const pendingCount = event?.pendingCount ?? 0;
  const eventHasStarted = event
    ? selectedEventView === "attendance" &&
      Number.isFinite(Date.parse(event.startAt)) &&
      Date.parse(event.startAt) <= nowMs
    : false;
  const canDecidePending = event
    ? canDecideApplication("PENDING", event.status, event.startAt, nowMs)
    : false;
  const filteredApplications = useMemo(
    () =>
      activeFilter === "ALL"
        ? applications
        : applications.filter(
            (application) => application.status === activeFilter,
          ),
    [activeFilter, applications],
  );

  function selectManagedEvent(eventId: string, view: ManagedEventView) {
    selectedEventRef.current = eventId;
    setError("");
    setSnapshot(null);
    setRejectingId(null);
    setRejectionReason("");
    setAttendanceEditingId(null);
    setAttendanceReason("");
    setAttendanceFailure(null);
    setApplicationsNextCursor(null);
    setActiveFilter(view === "attendance" ? "APPROVED" : "PENDING");
    setIsApplicationsLoading(true);
    setSelectedEventId(eventId);
  }

  function reloadSelectedApplications() {
    setError("");
    setAttendanceFailure(null);
    setSnapshot(null);
    setApplicationsNextCursor(null);
    setIsApplicationsLoading(true);
    setApplicationsReloadKey((value) => value + 1);
  }

  async function loadMoreEvents(view: ManagedEventView) {
    const cursor =
      view === "attendance"
        ? attendanceNextCursor
        : view === "drafts"
          ? draftNextCursor
          : upcomingNextCursor;
    const loading =
      view === "attendance"
        ? isLoadingMoreAttendance
        : view === "drafts"
          ? isLoadingMoreDrafts
          : isLoadingMoreUpcoming;
    if (!cursor || loading) return;
    if (view === "attendance") setIsLoadingMoreAttendance(true);
    else if (view === "drafts") setIsLoadingMoreDrafts(true);
    else setIsLoadingMoreUpcoming(true);
    setError("");
    try {
      const response = await fetch(
        managedEventsApiPath(view, cursor),
        { cache: "no-store", credentials: "same-origin" },
      );
      if (!response.ok) throw new Error(await apiMessage(response));
      const payload = (await response.json()) as ManagedEventsResponse;
      const merge = (current: ManagedEvent[]) => {
        const known = new Set(current.map(({ id }) => id));
        return [
          ...current,
          ...payload.data.filter(({ id }) => !known.has(id)),
        ];
      };
      if (view === "attendance") {
        setAttendanceEvents(merge);
        setAttendanceNextCursor(payload.page.nextCursor);
      } else if (view === "drafts") {
        setDraftEvents(merge);
        setDraftNextCursor(payload.page.nextCursor);
      } else {
        setUpcomingEvents(merge);
        setUpcomingNextCursor(payload.page.nextCursor);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "담당 모임을 더 불러오지 못했습니다.",
      );
    } finally {
      if (view === "attendance") setIsLoadingMoreAttendance(false);
      else if (view === "drafts") setIsLoadingMoreDrafts(false);
      else setIsLoadingMoreUpcoming(false);
    }
  }

  async function loadMoreApplications() {
    if (!applicationsNextCursor || isLoadingMoreApplications) return;
    const eventId = selectedEventId;
    setIsLoadingMoreApplications(true);
    setError("");
    try {
      const response = await fetch(
        `/api/leader/events/${encodeURIComponent(eventId)}/applications?limit=100&cursor=${encodeURIComponent(applicationsNextCursor)}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      if (!response.ok) throw new Error(await apiMessage(response));
      const payload = (await response.json()) as ApplicationsResponse;
      if (selectedEventRef.current !== eventId) return;
      setSnapshot((current) => {
        if (!current || current.event.id !== eventId) return current;
        const known = new Set(current.applications.map(({ id }) => id));
        return {
          event: current.event,
          applications: [
            ...current.applications,
            ...payload.applications.filter(({ id }) => !known.has(id)),
          ],
          page: payload.page,
        };
      });
      setApplicationsNextCursor(payload.page.nextCursor);
    } catch (caught) {
      if (selectedEventRef.current === eventId) {
        setError(
          caught instanceof Error
            ? caught.message
            : "참가 신청을 더 불러오지 못했습니다.",
        );
      }
    } finally {
      setIsLoadingMoreApplications(false);
    }
  }

  async function decide(
    application: Application,
    status: "APPROVED" | "REJECTED",
    reason?: string,
  ) {
    if (submittingRef.current || isLoadingMoreApplications) return;
    const decisionEventId = selectedEventId;
    submittingRef.current = application.id;
    setSubmittingId(application.id);
    setError("");
    setAnnouncement("");

    try {
      const response = await fetch(
        `/api/leader/applications/${encodeURIComponent(application.id)}`,
        {
          method: "PATCH",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
        },
      );
      if (!response.ok) throw new Error(await apiMessage(response));
      const updated = (await response.json()) as Pick<
        Application,
        "id" | "status" | "decidedAt" | "updatedAt"
      >;

      setSnapshot((current) => {
        if (!current || current.event.id !== decisionEventId) return current;
        const nextApplications = current.applications.map((item) =>
          item.id === application.id
            ? {
                ...item,
                status: updated.status,
                decidedAt: updated.decidedAt,
                updatedAt: updated.updatedAt,
              }
            : item,
        );
        const participantDelta =
          updated.status === "APPROVED" &&
          application.status !== "APPROVED"
            ? 1
            : updated.status !== "APPROVED" &&
                application.status === "APPROVED"
              ? -1
              : 0;
        const participantCount = Math.max(
          current.event.participantCount + participantDelta,
          0,
        );
        return {
          applications: nextApplications,
          event: {
            ...current.event,
            participantCount,
            pendingCount: Math.max(current.event.pendingCount - 1, 0),
            remainingCapacity: Math.max(
              current.event.capacity - participantCount,
              0,
            ),
          },
          page: current.page,
        };
      });
      const updateCatalog = (current: ManagedEvent[]) =>
        current.map((item) => {
          if (item.id !== decisionEventId) return item;
          const delta =
            status === "APPROVED" && application.status !== "APPROVED"
              ? 1
              : status !== "APPROVED" && application.status === "APPROVED"
                ? -1
                : 0;
          const participantCount = Math.max(item.participantCount + delta, 0);
          return {
            ...item,
            participantCount,
            pendingCount: Math.max(item.pendingCount - 1, 0),
            remainingCapacity: Math.max(item.capacity - participantCount, 0),
          };
        });
      setUpcomingEvents(updateCatalog);
      setAttendanceEvents(updateCatalog);
      if (selectedEventRef.current === decisionEventId) {
        setRejectingId(null);
        setRejectionReason("");
        setAnnouncement(
          `${application.applicant.name}님의 신청을 ${
            status === "APPROVED" ? "승인" : "거절"
          }했습니다. 이메일과 앱 알림 발송을 준비합니다.`,
        );
      }
    } catch (caught) {
      if (selectedEventRef.current === decisionEventId) {
        setError(
          caught instanceof Error
            ? caught.message
            : "신청 상태를 변경하지 못했습니다.",
        );
      }
    } finally {
      submittingRef.current = null;
      setSubmittingId(null);
    }
  }

  async function markAttendance(
    application: Application,
    attendance: AttendanceDecision,
    reason?: string,
  ) {
    if (
      submittingRef.current ||
      isLoadingMoreApplications ||
      !event ||
      !canMarkAttendance(
        application.status,
        selectedEventView,
        event.startAt,
        nowMs,
      )
    ) {
      return;
    }

    const attendanceEventId = selectedEventId;
    const normalizedReason = reason?.trim() || undefined;
    if (
      normalizedReason &&
      (normalizedReason.length < 2 || normalizedReason.length > 500)
    ) {
      return;
    }

    submittingRef.current = application.id;
    setSubmittingId(application.id);
    setAttendanceFailure(null);
    setAnnouncement("");

    try {
      const response = await fetch(
        `/api/leader/applications/${encodeURIComponent(application.id)}/attendance`,
        {
          method: "PATCH",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attendance,
            ...(normalizedReason ? { reason: normalizedReason } : {}),
          }),
        },
      );
      if (!response.ok) throw await apiFailure(response);
      const updated = parseAttendanceUpdate(
        await response.json(),
        application.id,
      );
      if (!updated) {
        throw new Error("출석 처리 결과 형식을 확인하지 못했습니다.");
      }

      setSnapshot((current) => {
        if (!current || current.event.id !== attendanceEventId) return current;
        return {
          ...current,
          applications: current.applications.map((item) =>
            item.id === application.id
              ? {
                  ...item,
                  attendance: updated.attendance,
                  updatedAt: updated.updatedAt,
                }
              : item,
          ),
        };
      });
      if (selectedEventRef.current === attendanceEventId) {
        setAttendanceEditingId(null);
        setAttendanceReason("");
        setAttendanceFailure(null);
        setAnnouncement(
          `${application.applicant.name}님을 ${
            attendance === "ATTENDED" ? "참석" : "불참"
          }으로 처리했습니다.`,
        );
      }
    } catch (caught) {
      if (selectedEventRef.current === attendanceEventId) {
        setAttendanceFailure({
          applicationId: application.id,
          attendance,
          ...(normalizedReason ? { reason: normalizedReason } : {}),
          message:
            caught instanceof Error
              ? caught.message
              : "출석 상태를 변경하지 못했습니다.",
          status: caught instanceof LeaderRequestError ? caught.status : null,
          ...(caught instanceof LeaderRequestError && caught.code
            ? { code: caught.code }
            : {}),
        });
      }
    } finally {
      submittingRef.current = null;
      setSubmittingId(null);
    }
  }

  if (isEventsLoading) {
    return (
      <div className="panel flex min-h-56 items-center justify-center gap-3 p-8 text-lg font-black" role="status">
        <LoaderCircle aria-hidden="true" className="size-7 animate-spin text-[var(--primary)]" />
        담당 모임을 불러오고 있습니다
      </div>
    );
  }

  if (
    upcomingEvents.length === 0 &&
    attendanceEvents.length === 0 &&
    draftEvents.length === 0
  ) {
    return (
      <div className="panel p-8 text-center">
        <Check aria-hidden="true" className="mx-auto size-12 text-[var(--success)]" />
        <h2 className="mt-3 text-xl font-black">관리할 모임이 없습니다</h2>
        <p className="mt-2 text-[var(--muted)]">
          예정 모임이나 출석을 확인할 최근 모임이 생기면 이곳에서 관리할 수 있습니다.
        </p>
        {error && (
          <div className="mt-5" role="alert">
            <p className="font-bold text-[var(--danger)]">{error}</p>
            <button
              className="button-quiet mt-3"
              onClick={() => {
                setError("");
                setUpcomingEvents([]);
                setAttendanceEvents([]);
                setDraftEvents([]);
                setUpcomingNextCursor(null);
                setAttendanceNextCursor(null);
                setDraftNextCursor(null);
                setIsEventsLoading(true);
                setEventsReloadKey((value) => value + 1);
              }}
              type="button"
            >
              <RefreshCw aria-hidden="true" className="size-5" />
              다시 불러오기
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 max-w-full gap-8">
      {draftEvents.length > 0 ? (
        <section className="soft-panel p-5 sm:p-6" aria-labelledby="draft-events-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-black" id="draft-events-title">작성 중인 모임</h2>
              <p className="mt-1 text-[var(--muted)]">아직 회원에게 공개되지 않았습니다. 내용을 확인한 뒤 게시해 주세요.</p>
            </div>
            {draftNextCursor ? (
              <button className="button-quiet shrink-0" disabled={isLoadingMoreDrafts || Boolean(submittingId)} onClick={() => void loadMoreEvents("drafts")} type="button">
                {isLoadingMoreDrafts ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-5" />}
                초안 더 불러오기
              </button>
            ) : null}
          </div>
          <ul className="mt-5 grid list-none gap-3 p-0 sm:grid-cols-2">
            {draftEvents.map((item) => (
              <li className="rounded-2xl border border-[var(--line)] bg-white p-4" key={item.id}>
                <p className="text-sm font-black text-[var(--primary)]">{item.club.title}</p>
                <h3 className="mt-1 text-lg font-black">{item.title}</h3>
                <p className="mt-2 flex items-center gap-2 text-[var(--muted)]">
                  <CalendarDays aria-hidden="true" className="size-5 shrink-0" />
                  {eventDate(item.startAt)}
                </p>
                <Link className="button-secondary mt-4 w-full" href={`/leader/events/${encodeURIComponent(item.id)}/edit` as Route}>
                  <PencilLine aria-hidden="true" className="size-5" />
                  계속 작성하기
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="panel grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
        <section aria-labelledby="attendance-events-title" className="min-w-0">
          <h2 className="text-lg font-black" id="attendance-events-title">
            출석 관리
          </h2>
          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            시작한 진행·최근 모임을 최신순으로 보여드립니다.
          </p>
          <label className="screen-reader-only" htmlFor="attendance-event">
            출석 관리할 모임
          </label>
          <select
            className="mt-3 min-h-13 w-full rounded-2xl border border-[var(--line)] bg-white px-4 text-base font-bold text-[var(--ink)]"
            disabled={attendanceEvents.length === 0 || Boolean(submittingId)}
            id="attendance-event"
            onChange={(input) => selectManagedEvent(input.target.value, "attendance")}
            value={
              attendanceEvents.some(({ id }) => id === selectedEventId)
                ? selectedEventId
                : ""
            }
          >
            <option disabled value="">
              {attendanceEvents.length > 0
                ? "출석 관리할 모임 선택"
                : "출석 관리할 최근 모임 없음"}
            </option>
            {attendanceEvents.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · {eventDate(item.startAt)}
              </option>
            ))}
          </select>
          {attendanceNextCursor && (
            <button
              className="button-quiet mt-3"
              disabled={isLoadingMoreAttendance || Boolean(submittingId)}
              onClick={() => void loadMoreEvents("attendance")}
              type="button"
            >
              {isLoadingMoreAttendance ? (
                <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
              ) : (
                <RefreshCw aria-hidden="true" className="size-5" />
              )}
              최근 모임 더 불러오기
            </button>
          )}
        </section>

        <section aria-labelledby="upcoming-events-title" className="min-w-0 border-t border-[var(--line)] pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <h2 className="text-lg font-black" id="upcoming-events-title">
            예정 모임 신청 관리
          </h2>
          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            시작 전 모임의 승인 대기 신청을 관리합니다.
          </p>
          <label className="screen-reader-only" htmlFor="upcoming-event">
            신청 관리할 예정 모임
          </label>
          <select
            className="mt-3 min-h-13 w-full rounded-2xl border border-[var(--line)] bg-white px-4 text-base font-bold text-[var(--ink)]"
            disabled={upcomingEvents.length === 0 || Boolean(submittingId)}
            id="upcoming-event"
            onChange={(input) => selectManagedEvent(input.target.value, "upcoming")}
            value={
              upcomingEvents.some(({ id }) => id === selectedEventId)
                ? selectedEventId
                : ""
            }
          >
            <option disabled value="">
              {upcomingEvents.length > 0
                ? "신청 관리할 모임 선택"
                : "신청 관리할 예정 모임 없음"}
            </option>
            {upcomingEvents.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · {eventDate(item.startAt)}
              </option>
            ))}
          </select>
          {upcomingNextCursor && (
            <button
              className="button-quiet mt-3"
              disabled={isLoadingMoreUpcoming || Boolean(submittingId)}
              onClick={() => void loadMoreEvents("upcoming")}
              type="button"
            >
              {isLoadingMoreUpcoming ? (
                <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
              ) : (
                <RefreshCw aria-hidden="true" className="size-5" />
              )}
              예정 모임 더 불러오기
            </button>
          )}
        </section>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--danger)] bg-red-50 p-4 text-[var(--danger)]" role="alert">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-6 shrink-0" />
          <div>
            <p className="font-black">신청 관리 정보를 확인하지 못했습니다</p>
            <p className="mt-1">{error}</p>
            <button
              className="button-quiet mt-3"
              onClick={reloadSelectedApplications}
              type="button"
            >
              <RefreshCw aria-hidden="true" className="size-5" />
              다시 불러오기
            </button>
          </div>
        </div>
      )}

      {isApplicationsLoading ? (
        <div className="panel flex min-h-56 items-center justify-center gap-3 p-8 text-lg font-black" role="status">
          <LoaderCircle aria-hidden="true" className="size-7 animate-spin text-[var(--primary)]" />
          참가 신청을 불러오고 있습니다
        </div>
      ) : event ? (
        <>
          <section aria-labelledby="event-operation-title" className="panel min-w-0 max-w-full overflow-hidden">
            <div className="min-w-0 max-w-full bg-[var(--ink)] p-5 text-white sm:p-7">
              <div className="flex min-w-0 max-w-full flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <p className="m-0 text-base font-extrabold text-[var(--sky-soft)]">
                    {event.club.title}
                  </p>
                  <h2 className="mt-2 max-w-3xl text-2xl font-black leading-tight tracking-[-0.035em] sm:text-3xl" id="event-operation-title">
                    {event.title}
                  </h2>
                  <div className="mt-4 flex min-w-0 flex-wrap gap-x-5 gap-y-2 text-base font-bold text-white/80">
                    <span className="inline-flex items-center gap-2">
                      <CalendarDays aria-hidden="true" className="size-5" />
                      {eventDate(event.startAt)}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <MapPin aria-hidden="true" className="size-5" />
                      {event.locationName}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
                  <Link className="button-secondary border-white bg-white" href={`/leader/events/${encodeURIComponent(event.id)}/edit` as Route}>
                    <PencilLine aria-hidden="true" className="size-5" />
                    모임 정보 수정
                  </Link>
                  <Link className="button-secondary border-white bg-white" href="/chat">
                    <MessageCircleMore aria-hidden="true" className="size-5" />
                    참가자 대화방
                  </Link>
                </div>
              </div>
            </div>

            <dl className="grid min-w-0 max-w-full grid-cols-1 divide-y divide-[var(--line)] min-[360px]:grid-cols-2 min-[360px]:divide-x sm:grid-cols-4 sm:divide-y-0">
              <div className="min-w-0 p-5 sm:p-6">
                <dt className="text-base font-extrabold text-[var(--muted)]">확정 인원</dt>
                <dd className="mt-1 text-3xl font-black tracking-[-0.04em]">
                  {event.participantCount}<span className="text-base text-[var(--muted)]"> / {event.capacity}명</span>
                </dd>
              </div>
              <div className="min-w-0 p-5 sm:p-6">
                <dt className="text-base font-extrabold text-[var(--muted)]">남은 자리</dt>
                <dd className="mt-1 text-3xl font-black tracking-[-0.04em] text-[var(--primary)]">
                  {event.remainingCapacity}<span className="text-base">자리</span>
                </dd>
              </div>
              <div className="min-w-0 p-5 sm:p-6">
                <dt className="text-base font-extrabold text-[var(--muted)]">승인 대기</dt>
                <dd className="mt-1 text-3xl font-black tracking-[-0.04em] text-[var(--accent)]">
                  {pendingCount}<span className="text-base">명</span>
                </dd>
              </div>
              <div className="min-w-0 p-5 sm:p-6">
                <dt className="text-base font-extrabold text-[var(--muted)]">
                  {eventHasStarted ? "운영 상태" : "모임까지"}
                </dt>
                <dd className="mt-1 text-3xl font-black tracking-[-0.04em]">
                  {eventHasStarted ? (
                    <span className="text-xl text-[var(--success)]">출석 확인 가능</span>
                  ) : (
                    <>{daysUntil(event.startAt, nowMs)}<span className="text-base">일</span></>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="application-list-title" className="min-w-0 max-w-full">
            <div className="mb-5 flex min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="eyebrow">
                  <ShieldCheck aria-hidden="true" className="size-5" />
                  안전한 만남을 위한 확인
                </p>
                <h2 className="section-title" id="application-list-title">
                  {eventHasStarted ? "참가자 출석 관리" : "참가 신청 관리"}
                </h2>
                <p className="mt-2 text-[var(--muted)]">
                  {eventHasStarted
                    ? "승인된 참가자의 실제 참석 여부를 확인해 주세요."
                    : "신청자의 프로필과 참여 이력을 확인한 뒤 결정해 주세요."}
                </p>
              </div>
              {pendingCount > 0 && (
                <span className="tag self-start bg-[var(--accent-soft)] text-[var(--warning)] sm:self-auto">
                  <Clock3 aria-hidden="true" className="size-4" />
                  {pendingCount}명 확인 필요
                </span>
              )}
            </div>

            <div aria-label="신청 상태" className="mb-5 flex min-w-0 max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-2">
              {FILTERS.map((filter) => {
                const isActive = activeFilter === filter.id;
                const count = filter.id === "ALL"
                  ? applications.length
                  : filter.id === "PENDING"
                    ? pendingCount
                    : applications.filter((application) => application.status === filter.id).length;
                return (
                  <button
                    aria-pressed={isActive}
                    className={`shrink-0 ${isActive ? "button-primary" : "button-quiet"}`}
                    key={filter.id}
                    onClick={() => setActiveFilter(filter.id)}
                    type="button"
                  >
                    {filter.label}
                    <span className={`tag ${isActive ? "bg-white text-[var(--primary-strong)]" : ""}`}>{count}</span>
                  </button>
                );
              })}
            </div>

            {filteredApplications.length > 0 ? (
              <ul className="m-0 grid min-w-0 max-w-full list-none gap-4 p-0">
                {filteredApplications.map((application) => {
                  const applicant = application.applicant;
                  const isSubmitting = submittingId === application.id;
                  const attendanceOpen = canMarkAttendance(
                    application.status,
                    selectedEventView,
                    event.startAt,
                    nowMs,
                  );
                  const applicationAttendanceFailure =
                    attendanceFailure?.applicationId === application.id
                      ? attendanceFailure
                      : null;
                  const normalizedAttendanceReason = attendanceReason.trim();
                  const attendanceReasonValid =
                    normalizedAttendanceReason.length === 0 ||
                    normalizedAttendanceReason.length >= 2;
                  return (
                    <li className="panel min-w-0 max-w-full p-5 sm:p-6" key={application.id}>
                      <article className="grid min-w-0 max-w-full gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                        <div className="flex min-w-0 items-start gap-4">
                          <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--sky-soft)] text-xl font-black text-[var(--primary-strong)]">
                            {applicant.name.slice(0, 1)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="m-0 text-xl font-black tracking-[-0.025em]">{applicant.name}</h3>
                              <span className={`tag ${
                                application.status === "APPROVED"
                                  ? "bg-[var(--sky-soft)] text-[var(--success)]"
                                  : application.status === "REJECTED"
                                    ? "bg-[var(--accent-soft)] text-[var(--danger)]"
                                    : "bg-[var(--canvas-deep)]"
                              }`}>
                                {STATUS_LABEL[application.status]}
                              </span>
                              {application.status === "APPROVED" && (
                                <span className={`tag ${
                                  application.attendance === "ATTENDED"
                                    ? "bg-green-50 text-[var(--success)]"
                                    : application.attendance === "NO_SHOW"
                                      ? "bg-red-50 text-[var(--danger)]"
                                      : "bg-[var(--canvas-deep)] text-[var(--muted)]"
                                }`}>
                                  {ATTENDANCE_LABEL[application.attendance]}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 font-bold text-[var(--muted)]">
                              {applicant.ageGroup ?? "연령 미입력"} · {applicant.region ?? "지역 미입력"} · 출석 참여 {applicant.attendedEventCount}회
                            </p>
                            {applicant.interests.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {applicant.interests.map((interest) => (
                                  <span className="tag" key={interest.slug}>{interest.name}</span>
                                ))}
                              </div>
                            )}
                            <p className="mt-3 text-base font-bold text-[var(--muted)]">신청 {appliedDate(application.appliedAt)}</p>
                          </div>
                        </div>

                        <div className="grid min-w-0 max-w-full grid-cols-2 gap-2 lg:max-w-[24rem] lg:justify-self-end">
                          {application.status === "PENDING" ? (
                            rejectingId === application.id ? (
                              <div className="col-span-2 grid gap-2">
                                <label className="font-black" htmlFor={`reason-${application.id}`}>거절 사유</label>
                                <textarea
                                  className="min-h-24 rounded-2xl border border-[var(--line)] p-3"
                                  id={`reason-${application.id}`}
                                  maxLength={500}
                                  onChange={(input) => setRejectionReason(input.target.value)}
                                  placeholder="신청자에게 전달할 사유를 2자 이상 입력해 주세요."
                                  value={rejectionReason}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    className="button-danger min-w-0 w-full"
                                    disabled={!canDecidePending || isLoadingMoreApplications || rejectionReason.trim().length < 2 || Boolean(submittingId)}
                                    onClick={() => void decide(application, "REJECTED", rejectionReason.trim())}
                                    type="button"
                                  >
                                    {isSubmitting ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <UserRoundX aria-hidden="true" className="size-5" />}
                                    거절 확정
                                  </button>
                                  <button
                                    className="button-quiet min-w-0 w-full"
                                    disabled={Boolean(submittingId)}
                                    onClick={() => {
                                      setRejectingId(null);
                                      setRejectionReason("");
                                    }}
                                    type="button"
                                  >
                                    취소
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <button
                                  className="button-primary min-w-0 w-full"
                                  disabled={!canDecidePending || isLoadingMoreApplications || event.remainingCapacity === 0 || Boolean(submittingId)}
                                  onClick={() => void decide(application, "APPROVED")}
                                  type="button"
                                >
                                  {isSubmitting ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <UserRoundCheck aria-hidden="true" className="size-5" />}
                                  승인
                                </button>
                                <button
                                  className="button-danger min-w-0 w-full"
                                  disabled={!canDecidePending || isLoadingMoreApplications || Boolean(submittingId)}
                                  onClick={() => {
                                    setRejectingId(application.id);
                                    setRejectionReason("");
                                  }}
                                  type="button"
                                >
                                  <UserRoundX aria-hidden="true" className="size-5" />
                                  거절
                                </button>
                              </>
                            )
                          ) : application.status === "APPROVED" ? (
                            attendanceOpen ? (
                              attendanceEditingId === application.id ? (
                                <div className="col-span-2 grid gap-3">
                                  <label
                                    className="font-black"
                                    htmlFor={`attendance-reason-${application.id}`}
                                  >
                                    출석 처리 메모 <span className="font-bold text-[var(--muted)]">(선택)</span>
                                  </label>
                                  <textarea
                                    className="min-h-20 rounded-2xl border border-[var(--line)] p-3"
                                    id={`attendance-reason-${application.id}`}
                                    maxLength={500}
                                    onChange={(input) => setAttendanceReason(input.target.value)}
                                    placeholder="메모를 남기려면 2자 이상 입력해 주세요."
                                    value={attendanceReason}
                                  />
                                  {!attendanceReasonValid && (
                                    <p className="m-0 text-sm font-bold text-[var(--danger)]">
                                      메모는 비우거나 2자 이상 입력해 주세요.
                                    </p>
                                  )}
                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      className="button-primary min-w-0 w-full"
                                      disabled={!attendanceReasonValid || isLoadingMoreApplications || Boolean(submittingId)}
                                      onClick={() =>
                                        void markAttendance(
                                          application,
                                          "ATTENDED",
                                          normalizedAttendanceReason,
                                        )
                                      }
                                      type="button"
                                    >
                                      {isSubmitting ? (
                                        <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
                                      ) : (
                                        <UserRoundCheck aria-hidden="true" className="size-5" />
                                      )}
                                      참석
                                    </button>
                                    <button
                                      className="button-danger min-w-0 w-full"
                                      disabled={!attendanceReasonValid || isLoadingMoreApplications || Boolean(submittingId)}
                                      onClick={() =>
                                        void markAttendance(
                                          application,
                                          "NO_SHOW",
                                          normalizedAttendanceReason,
                                        )
                                      }
                                      type="button"
                                    >
                                      {isSubmitting ? (
                                        <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
                                      ) : (
                                        <UserRoundX aria-hidden="true" className="size-5" />
                                      )}
                                      불참
                                    </button>
                                  </div>
                                  <button
                                    className="button-quiet w-full"
                                    disabled={Boolean(submittingId)}
                                    onClick={() => {
                                      setAttendanceEditingId(null);
                                      setAttendanceReason("");
                                      setAttendanceFailure(null);
                                    }}
                                    type="button"
                                  >
                                    취소
                                  </button>
                                </div>
                              ) : (
                                <button
                                  className="button-quiet col-span-2 w-full"
                                  disabled={isLoadingMoreApplications || Boolean(submittingId)}
                                  onClick={() => {
                                    setAttendanceEditingId(application.id);
                                    setAttendanceReason("");
                                    setAttendanceFailure(null);
                                  }}
                                  type="button"
                                >
                                  <UserRoundCheck aria-hidden="true" className="size-5" />
                                  {application.attendance === "NOT_CHECKED"
                                    ? "출석 처리"
                                    : "출석 상태 수정"}
                                </button>
                              )
                            ) : (
                              <span className="tag col-span-2 justify-center py-3">
                                모임 시작 후 출석 처리 가능
                              </span>
                            )
                          ) : (
                            <span className="tag col-span-2 justify-center py-3">처리 완료</span>
                          )}

                          {applicationAttendanceFailure && (
                            <div
                              className="col-span-2 rounded-2xl border border-[var(--danger)] bg-red-50 p-3 text-[var(--danger)]"
                              role="alert"
                            >
                              <p className="m-0 font-black">
                                {attendanceFailureTitle(
                                  applicationAttendanceFailure.status,
                                )}
                              </p>
                              <p className="mt-1 text-sm font-bold">
                                {applicationAttendanceFailure.message}
                              </p>
                              {applicationAttendanceFailure.code && (
                                <p className="mt-1 text-xs font-bold">
                                  오류 코드: {applicationAttendanceFailure.code}
                                </p>
                              )}
                              {attendanceRecovery(applicationAttendanceFailure.status) === "retry" ? (
                                <button
                                  className="button-quiet mt-3 w-full"
                                  disabled={Boolean(submittingId)}
                                  onClick={() =>
                                    void markAttendance(
                                      application,
                                      applicationAttendanceFailure.attendance,
                                      applicationAttendanceFailure.reason,
                                    )
                                  }
                                  type="button"
                                >
                                  <RefreshCw aria-hidden="true" className="size-5" />
                                  같은 내용으로 다시 시도
                                </button>
                              ) : (
                                <button
                                  className="button-quiet mt-3 w-full"
                                  disabled={Boolean(submittingId)}
                                  onClick={reloadSelectedApplications}
                                  type="button"
                                >
                                  <RefreshCw aria-hidden="true" className="size-5" />
                                  최신 신청 상태 다시 불러오기
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="panel min-w-0 max-w-full p-8 text-center">
                <Check aria-hidden="true" className="mx-auto size-12 text-[var(--success)]" />
                <h3 className="mt-3 text-xl font-black">해당 상태의 신청이 없습니다</h3>
                <p className="mt-2 text-[var(--muted)]">새 신청이나 상태 변경이 생기면 이곳에 표시됩니다.</p>
              </div>
            )}

            {applicationsNextCursor && (
              <div className="mt-5 text-center">
                <button
                  className="button-quiet"
                  disabled={isLoadingMoreApplications || Boolean(submittingId)}
                  onClick={() => void loadMoreApplications()}
                  type="button"
                >
                  {isLoadingMoreApplications ? (
                    <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
                  ) : (
                    <RefreshCw aria-hidden="true" className="size-5" />
                  )}
                  참가 신청 더 불러오기
                </button>
              </div>
            )}

            {!canDecidePending && pendingCount > 0 && (
              <div className="mt-4 flex min-w-0 max-w-full items-start gap-3 rounded-2xl border border-[var(--warning)] bg-[var(--accent-soft)] p-4 text-[var(--warning)]" role="alert">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-6 shrink-0" />
                <div>
                  <p className="m-0 font-black">신청 결정을 마감했습니다</p>
                  <p className="mt-1">모집 중이며 시작 전인 모임의 대기 신청만 승인하거나 거절할 수 있습니다.</p>
                </div>
              </div>
            )}

            {canDecidePending && event.remainingCapacity === 0 && pendingCount > 0 && (
              <div className="mt-4 flex min-w-0 max-w-full items-start gap-3 rounded-2xl border border-[var(--warning)] bg-[var(--accent-soft)] p-4 text-[var(--warning)]" role="alert">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-6 shrink-0" />
                <div>
                  <p className="m-0 font-black">정원이 모두 찼습니다</p>
                  <p className="mt-1">추가 승인은 서버에서도 차단됩니다. 정원과 기존 참가자 상태를 확인해 주세요.</p>
                </div>
              </div>
            )}
          </section>
        </>
      ) : null}

      <section aria-labelledby="leader-checklist-title" className="soft-panel min-w-0 max-w-full p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <UsersRound aria-hidden="true" className="mt-1 size-7 shrink-0 text-[var(--primary)]" />
          <div className="min-w-0">
            <h2 className="section-title" id="leader-checklist-title">모임 전 확인</h2>
            <ul className="mt-3 grid min-w-0 gap-2 pl-6 text-[var(--ink)] sm:grid-cols-2">
              <li>참가자에게 준비물과 만나는 곳 안내하기</li>
              <li>우천 시 대체 일정과 비상 연락 방법 확인하기</li>
            </ul>
          </div>
        </div>
      </section>

      <p aria-live="polite" className="screen-reader-only" role="status">
        {announcement}
      </p>
    </div>
  );
}
