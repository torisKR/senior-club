"use client";

import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  PlusCircle,
  Send,
  Trash2,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

import {
  createLeaderEventInputSchema,
  eventMutationResultSchema,
  type LeaderEventDetail,
  leaderEventDetailSchema,
  type ManagedClub,
  managedClubsResponseSchema,
  updateLeaderEventInputSchema,
} from "@/lib/leader-events/contracts";

type EventFormMode = "create" | "edit";
type EventStatus = LeaderEventDetail["status"];

export type LeaderEventFormValues = {
  clubId: string;
  title: string;
  description: string;
  locationName: string;
  address: string;
  mapUrl: string;
  startAt: string;
  endAt: string;
  registrationDeadline: string;
  capacity: string;
  price: string;
  difficulty: "EASY" | "MODERATE" | "HARD";
  supplies: string;
  approvalMode: "AUTO" | "MANUAL";
  publish: boolean;
};

const EMPTY_VALUES: LeaderEventFormValues = {
  clubId: "",
  title: "",
  description: "",
  locationName: "",
  address: "",
  mapUrl: "",
  startAt: "",
  endAt: "",
  registrationDeadline: "",
  capacity: "10",
  price: "0",
  difficulty: "EASY",
  supplies: "",
  approvalMode: "MANUAL",
  publish: false,
};

const STATUS_LABEL: Record<EventStatus, string> = {
  DRAFT: "작성 중",
  PUBLISHED: "모집 중",
  CLOSED: "모집 마감",
  COMPLETED: "종료",
  CANCELED: "취소됨",
};

const FIELD_LABEL: Record<string, string> = {
  clubId: "운영 클럽",
  title: "모임 제목",
  description: "모임 설명",
  locationName: "장소 이름",
  address: "주소",
  mapUrl: "지도 링크",
  startAt: "시작 일시",
  endAt: "종료 일시",
  registrationDeadline: "신청 마감",
  capacity: "정원",
  price: "참가비",
  difficulty: "난이도",
  supplies: "준비물",
  approvalMode: "신청 승인 방식",
};

class LeaderEventRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LeaderEventRequestError";
  }
}

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoDateTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function eventToValues(event: LeaderEventDetail): LeaderEventFormValues {
  return {
    clubId: event.clubId,
    title: event.title,
    description: event.description,
    locationName: event.locationName,
    address: event.address,
    mapUrl: event.mapUrl ?? "",
    startAt: toLocalDateTime(event.startAt),
    endAt: toLocalDateTime(event.endAt),
    registrationDeadline: toLocalDateTime(event.registrationDeadline),
    capacity: String(event.capacity),
    price: String(event.price),
    difficulty: event.difficulty,
    supplies: event.supplies ?? "",
    approvalMode: event.approvalMode,
    publish: false,
  };
}

function inputErrorMessage(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const issue = error.issues[0];
  const key = typeof issue?.path[0] === "string" ? issue.path[0] : "";
  const label = FIELD_LABEL[key] ?? "입력값";
  if (issue?.message.includes("종료 일시") || issue?.message.includes("신청 마감")) {
    return issue.message;
  }
  return `${label} 입력을 확인해 주세요.`;
}

export function buildLeaderEventRequest(
  values: LeaderEventFormValues,
  mode: EventFormMode,
) {
  const startAt = toIsoDateTime(values.startAt) ?? values.startAt;
  const endAt = values.endAt ? (toIsoDateTime(values.endAt) ?? values.endAt) : null;
  const registrationDeadline = values.registrationDeadline
    ? (toIsoDateTime(values.registrationDeadline) ?? values.registrationDeadline)
    : null;
  const shared = {
    title: values.title,
    description: values.description,
    locationName: values.locationName,
    address: values.address,
    mapUrl: values.mapUrl.trim() || null,
    startAt,
    endAt,
    registrationDeadline,
    capacity: values.capacity.trim() ? Number(values.capacity) : Number.NaN,
    price: values.price.trim() ? Number(values.price) : Number.NaN,
    difficulty: values.difficulty,
    supplies: values.supplies.trim() || null,
    approvalMode: values.approvalMode,
  };

  const parsed =
    mode === "create"
      ? createLeaderEventInputSchema.safeParse({
          ...shared,
          clubId: values.clubId,
          publish: values.publish,
        })
      : updateLeaderEventInputSchema.safeParse(shared);

  return parsed.success
    ? ({ success: true, data: parsed.data } as const)
    : ({ success: false, message: inputErrorMessage(parsed.error) } as const);
}

async function responseError(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: { message?: unknown };
    };
    const message =
      typeof payload.error?.message === "string" && payload.error.message.trim()
        ? payload.error.message
        : "요청을 처리하지 못했습니다.";
    if (response.status === 401) {
      return new LeaderEventRequestError(
        "로그인 시간이 만료되었습니다. 다시 로그인해 주세요.",
        response.status,
      );
    }
    if (response.status === 403) {
      return new LeaderEventRequestError(
        "이 클럽의 모임을 운영할 권한이 없습니다.",
        response.status,
      );
    }
    return new LeaderEventRequestError(message, response.status);
  } catch {
    return new LeaderEventRequestError(
      "서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      response.status,
    );
  }
}

async function fetchJson(request: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(request, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
  });
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as unknown;
}

export function LeaderEventForm({
  mode,
  eventId,
  initialAnnouncement = "",
}: {
  mode: EventFormMode;
  eventId?: string;
  initialAnnouncement?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<LeaderEventFormValues>(EMPTY_VALUES);
  const [clubs, setClubs] = useState<ManagedClub[]>([]);
  const [clubsNextCursor, setClubsNextCursor] = useState<string | null>(null);
  const [isLoadingMoreClubs, setIsLoadingMoreClubs] = useState(false);
  const [detail, setDetail] = useState<LeaderEventDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [operation, setOperation] = useState<"save" | "publish" | "cancel" | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState(initialAnnouncement);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const operationRef = useRef<typeof operation>(null);
  const createIdempotencyKeyRef = useRef<string | null>(null);

  const fetchAuthoritativeEvent = async (signal?: AbortSignal) => {
    if (!eventId) throw new Error("수정할 모임 식별자가 없습니다.");
    const payload = await fetchJson(
      `/api/leader/events/${encodeURIComponent(eventId)}`,
      { signal },
    );
    const parsed = leaderEventDetailSchema.safeParse(payload);
    if (!parsed.success || parsed.data.id !== eventId) {
      throw new Error("모임 상세 응답을 확인하지 못했습니다.");
    }
    return parsed.data;
  };

  const loadAuthoritativeEvent = async () => {
    const event = await fetchAuthoritativeEvent();
    setDetail(event);
    setValues(eventToValues(event));
    setIsDirty(false);
    return event;
  };

  useEffect(() => {
    const controller = new AbortController();

    void Promise.all([
      fetchJson("/api/leader/clubs?limit=100", { signal: controller.signal }),
      mode === "edit"
        ? fetchAuthoritativeEvent(controller.signal)
        : Promise.resolve(null),
    ])
      .then(([clubPayload, eventPayload]) => {
        if (controller.signal.aborted) return;
        const parsed = managedClubsResponseSchema.safeParse(clubPayload);
        if (!parsed.success) {
          throw new Error("관리 클럽 응답을 확인하지 못했습니다.");
        }
        const initialClubs = eventPayload
          ? [
              ...parsed.data.data,
              ...(parsed.data.data.some(({ id }) => id === eventPayload.club.id)
                ? []
                : [eventPayload.club]),
            ]
          : parsed.data.data;
        setClubs(initialClubs);
        setClubsNextCursor(parsed.data.page.nextCursor);
        if (eventPayload) {
          setDetail(eventPayload);
          setValues(eventToValues(eventPayload));
          setIsDirty(false);
        }
        if (mode === "create" && parsed.data.data.length === 1) {
          setValues((current) => ({
            ...current,
            clubId: parsed.data.data[0].id,
          }));
        }
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "모임 작성 정보를 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
    // eventId and mode define this editor instance; the loader intentionally
    // runs only when either identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, mode]);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  function updateValue<Key extends keyof LeaderEventFormValues>(
    key: Key,
    value: LeaderEventFormValues[Key],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    createIdempotencyKeyRef.current = null;
    setIsDirty(true);
    setError("");
    setAnnouncement("");
  }

  async function loadMoreClubs() {
    if (!clubsNextCursor || isLoadingMoreClubs || operationRef.current) return;
    setIsLoadingMoreClubs(true);
    setError("");
    try {
      const payload = await fetchJson(
        `/api/leader/clubs?limit=100&cursor=${encodeURIComponent(clubsNextCursor)}`,
      );
      const parsed = managedClubsResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("관리 클럽 응답을 확인하지 못했습니다.");
      }
      setClubs((current) => {
        const known = new Set(current.map(({ id }) => id));
        return [
          ...current,
          ...parsed.data.data.filter(({ id }) => !known.has(id)),
        ];
      });
      setClubsNextCursor(parsed.data.page.nextCursor);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "관리 클럽을 더 불러오지 못했습니다.",
      );
    } finally {
      setIsLoadingMoreClubs(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (operationRef.current) return;
    const request = buildLeaderEventRequest(values, mode);
    if (!request.success) {
      setError(request.message);
      return;
    }

    operationRef.current = "save";
    setOperation("save");
    setError("");
    setAnnouncement("");
    try {
      const endpoint =
        mode === "create"
          ? "/api/leader/events"
          : `/api/leader/events/${encodeURIComponent(eventId ?? "")}`;
      const idempotencyKey =
        mode === "create"
          ? (createIdempotencyKeyRef.current ??
            `event-create:${crypto.randomUUID()}`)
          : null;
      if (idempotencyKey) createIdempotencyKeyRef.current = idempotencyKey;
      const payload = await fetchJson(endpoint, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: JSON.stringify(request.data),
      });
      const parsed = eventMutationResultSchema.safeParse(payload);
      if (!parsed.success || (eventId && parsed.data.id !== eventId)) {
        throw new Error("모임 저장 결과를 확인하지 못했습니다.");
      }

      if (mode === "create") {
        router.replace(
          `/leader/events/${encodeURIComponent(parsed.data.id)}/edit?created=1` as Route,
        );
        return;
      }
      await loadAuthoritativeEvent();
      setAnnouncement("모임 정보를 저장하고 서버의 최신 상태를 확인했습니다.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "모임 정보를 저장하지 못했습니다.",
      );
    } finally {
      operationRef.current = null;
      setOperation(null);
    }
  }

  async function runStatusAction(action: "publish" | "cancel") {
    if (!eventId || operationRef.current) return;
    if (isDirty) {
      setError("변경한 내용을 먼저 저장한 뒤 모임 상태를 바꿔 주세요.");
      return;
    }
    operationRef.current = action;
    setOperation(action);
    setError("");
    setAnnouncement("");
    try {
      const payload = await fetchJson(
        `/api/leader/events/${encodeURIComponent(eventId)}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const parsed = eventMutationResultSchema.safeParse(payload);
      if (!parsed.success || parsed.data.id !== eventId) {
        throw new Error("모임 상태 변경 결과를 확인하지 못했습니다.");
      }
      await loadAuthoritativeEvent();
      setShowCancelConfirmation(false);
      setAnnouncement(
        action === "publish"
          ? "모임을 게시했습니다. 이제 회원이 모임을 확인하고 신청할 수 있습니다."
          : "모임을 취소했습니다. 참가자 알림 발송은 서버에서 처리됩니다.",
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "모임 상태를 변경하지 못했습니다.",
      );
    } finally {
      operationRef.current = null;
      setOperation(null);
    }
  }

  if (isLoading) {
    return (
      <div className="panel flex min-h-64 items-center justify-center gap-3 p-8 text-lg font-black" role="status">
        <LoaderCircle aria-hidden="true" className="size-7 animate-spin text-[var(--primary)]" />
        모임 작성 정보를 불러오고 있습니다
      </div>
    );
  }

  if (error && (clubs.length === 0 || (mode === "edit" && !detail))) {
    return (
      <section className="panel p-7 text-center" role="alert">
        <CircleAlert aria-hidden="true" className="mx-auto size-11 text-[var(--danger)]" />
        <h2 className="mt-4 text-xl font-black">작성 화면을 열지 못했습니다</h2>
        <p className="mt-2 text-[var(--danger)]">{error}</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button className="button-primary" onClick={() => window.location.reload()} type="button">
            다시 불러오기
          </button>
          <Link className="button-quiet" href="/leader">리더 운영실로</Link>
        </div>
      </section>
    );
  }

  if (clubs.length === 0) {
    return (
      <section className="panel p-7 text-center">
        <CircleAlert aria-hidden="true" className="mx-auto size-11 text-[var(--warning)]" />
        <h2 className="mt-4 text-xl font-black">운영할 수 있는 클럽이 없습니다</h2>
        <p className="mx-auto mt-2 max-w-xl text-[var(--muted)]">
          모임은 리더 권한이 확인된 활성 클럽에만 만들 수 있습니다. 관리자에게 클럽 리더 등록 상태를 확인해 주세요.
        </p>
        <Link className="button-quiet mt-6" href="/leader">리더 운영실로</Link>
      </section>
    );
  }

  const isBusy = operation !== null;
  const status = detail?.status;
  const eventHasStarted = detail
    ? Number.isFinite(Date.parse(detail.startAt)) &&
      Date.parse(detail.startAt) <= nowMs
    : false;
  const canEdit =
    mode === "create" ||
    status === "DRAFT" ||
    ((status === "PUBLISHED" || status === "CLOSED") && !eventHasStarted);

  return (
    <div className="grid gap-6">
      {detail ? (
        <section className="soft-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" aria-label="모임 운영 상태">
          <div>
            <p className="m-0 font-black">현재 상태</p>
            <p className="mt-1 text-xl font-black text-[var(--primary-strong)]">{STATUS_LABEL[detail.status]}</p>
            {detail.status === "DRAFT" ? (
              <p className="mt-1 text-sm text-[var(--muted)]">초안은 회원에게 공개되지 않으며, 내용을 저장하거나 게시할 수 있습니다.</p>
            ) : null}
          </div>
          <div>
            <div className="flex flex-col gap-3 sm:flex-row">
              {detail.status === "DRAFT" ? (
                <button
                  className="button-primary"
                  disabled={isBusy || isDirty || eventHasStarted}
                  onClick={() => void runStatusAction("publish")}
                  type="button"
                >
                  {operation === "publish" ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <Send aria-hidden="true" className="size-5" />}
                  모임 게시
                </button>
              ) : null}
              {(detail.status === "PUBLISHED" || detail.status === "CLOSED") && !eventHasStarted ? (
                <button
                  className="button-danger"
                  disabled={isBusy || isDirty}
                  onClick={() => setShowCancelConfirmation(true)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" className="size-5" />
                  모임 취소
                </button>
              ) : null}
            </div>
            {isDirty && (detail.status === "DRAFT" || detail.status === "PUBLISHED" || detail.status === "CLOSED") ? (
              <p className="mt-2 max-w-sm text-sm font-bold text-[var(--muted)]">변경 내용을 먼저 저장하면 게시 또는 취소 버튼을 사용할 수 있습니다.</p>
            ) : null}
            {!isDirty && detail.status === "DRAFT" && eventHasStarted ? (
              <p className="mt-2 max-w-sm text-sm font-bold text-[var(--danger)]">시작 일시를 미래로 변경해 저장한 뒤 게시해 주세요.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {showCancelConfirmation ? (
        <section className="panel border-[var(--danger)] p-5" role="alertdialog" aria-labelledby="cancel-event-title" aria-describedby="cancel-event-description">
          <h2 className="text-xl font-black" id="cancel-event-title">이 모임을 정말 취소할까요?</h2>
          <p className="mt-2 text-[var(--muted)]" id="cancel-event-description">
            취소 후에는 되돌릴 수 없으며, 참가자에게 일정 변경 알림이 발송될 수 있습니다.
          </p>
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button autoFocus className="button-quiet" disabled={isBusy} onClick={() => setShowCancelConfirmation(false)} type="button">계속 운영하기</button>
            <button className="button-danger" disabled={isBusy} onClick={() => void runStatusAction("cancel")} type="button">
              {operation === "cancel" ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <Trash2 aria-hidden="true" className="size-5" />}
              취소 확정
            </button>
          </div>
        </section>
      ) : null}

      <form aria-busy={isBusy} className="panel p-5 sm:p-8" noValidate onSubmit={submit}>
        <fieldset disabled={isBusy || !canEdit}>
          <legend className="section-title">기본 정보</legend>

          <div className="mt-6 grid gap-6">
            <div>
              <label className="form-label" htmlFor="event-club">운영 클럽 <span aria-hidden="true">*</span></label>
              <select
                className="form-select"
                disabled={mode === "edit" || isBusy}
                id="event-club"
                onChange={(event) => updateValue("clubId", event.target.value)}
                required
                value={values.clubId}
              >
                <option value="">클럽을 선택해 주세요</option>
                {clubs.map((club) => <option key={club.id} value={club.id}>{club.title}</option>)}
              </select>
              <p className="form-hint">권한이 확인된 활성 클럽만 표시됩니다.</p>
              {mode === "create" && clubsNextCursor ? (
                <button className="button-quiet mt-3" disabled={isBusy || isLoadingMoreClubs} onClick={() => void loadMoreClubs()} type="button">
                  {isLoadingMoreClubs ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <PlusCircle aria-hidden="true" className="size-5" />}
                  운영 클럽 더 불러오기
                </button>
              ) : null}
            </div>

            <div>
              <label className="form-label" htmlFor="event-title">모임 제목 <span aria-hidden="true">*</span></label>
              <input className="form-input" id="event-title" maxLength={120} minLength={2} onChange={(event) => updateValue("title", event.target.value)} required value={values.title} />
              <p className="form-hint">2~120자로 모임의 목적이 드러나게 적어 주세요.</p>
            </div>

            <div>
              <label className="form-label" htmlFor="event-description">모임 설명 <span aria-hidden="true">*</span></label>
              <textarea className="form-textarea min-h-48 resize-y" id="event-description" maxLength={5000} minLength={10} onChange={(event) => updateValue("description", event.target.value)} required value={values.description} />
              <p className="form-hint" aria-live="polite">활동 순서와 참여자가 기대할 수 있는 내용을 적어 주세요. {values.description.length} / 5,000자</p>
            </div>
          </div>

          <hr className="divider my-8" />
          <h2 className="section-title">일정과 장소</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <label className="form-label" htmlFor="event-start-at">시작 일시 <span aria-hidden="true">*</span></label>
              <input className="form-input" id="event-start-at" onChange={(event) => updateValue("startAt", event.target.value)} required type="datetime-local" value={values.startAt} />
            </div>
            <div>
              <label className="form-label" htmlFor="event-end-at">종료 일시</label>
              <input className="form-input" id="event-end-at" onChange={(event) => updateValue("endAt", event.target.value)} type="datetime-local" value={values.endAt} />
            </div>
            <div>
              <label className="form-label" htmlFor="event-deadline">신청 마감</label>
              <input className="form-input" id="event-deadline" onChange={(event) => updateValue("registrationDeadline", event.target.value)} type="datetime-local" value={values.registrationDeadline} />
              <p className="form-hint">비워 두면 모임 시작 전까지 신청할 수 있습니다.</p>
            </div>
            <div>
              <label className="form-label" htmlFor="event-location">장소 이름 <span aria-hidden="true">*</span></label>
              <input className="form-input" id="event-location" maxLength={200} minLength={2} onChange={(event) => updateValue("locationName", event.target.value)} placeholder="예: 서울숲 방문자센터 앞" required value={values.locationName} />
            </div>
            <div className="md:col-span-2">
              <label className="form-label" htmlFor="event-address">주소 <span aria-hidden="true">*</span></label>
              <input className="form-input" id="event-address" maxLength={300} minLength={2} onChange={(event) => updateValue("address", event.target.value)} placeholder="예: 서울 성동구 뚝섬로 273" required value={values.address} />
            </div>
            <div className="md:col-span-2">
              <label className="form-label" htmlFor="event-map-url">지도 링크</label>
              <input className="form-input" id="event-map-url" inputMode="url" maxLength={2048} onChange={(event) => updateValue("mapUrl", event.target.value)} placeholder="https://로 시작하는 지도 주소" type="url" value={values.mapUrl} />
              <p className="form-hint">HTTPS 지도 주소만 입력할 수 있습니다.</p>
            </div>
          </div>

          <hr className="divider my-8" />
          <h2 className="section-title">참여 조건</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <label className="form-label" htmlFor="event-capacity">정원 <span aria-hidden="true">*</span></label>
              <input className="form-input" id="event-capacity" inputMode="numeric" max={500} min={1} onChange={(event) => updateValue("capacity", event.target.value)} required type="number" value={values.capacity} />
            </div>
            <div>
              <label className="form-label" htmlFor="event-price">참가비(원) <span aria-hidden="true">*</span></label>
              <input className="form-input" id="event-price" inputMode="numeric" max={10000000} min={0} onChange={(event) => updateValue("price", event.target.value)} required step={100} type="number" value={values.price} />
            </div>
            <div>
              <label className="form-label" htmlFor="event-difficulty">활동 난이도 <span aria-hidden="true">*</span></label>
              <select className="form-select" id="event-difficulty" onChange={(event) => updateValue("difficulty", event.target.value as LeaderEventFormValues["difficulty"])} value={values.difficulty}>
                <option value="EASY">쉬움 — 가벼운 활동</option>
                <option value="MODERATE">보통 — 일반적인 활동</option>
                <option value="HARD">도전 — 체력 필요</option>
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="event-approval">신청 승인 <span aria-hidden="true">*</span></label>
              <select className="form-select" id="event-approval" onChange={(event) => updateValue("approvalMode", event.target.value as LeaderEventFormValues["approvalMode"])} value={values.approvalMode}>
                <option value="MANUAL">리더가 확인 후 승인</option>
                <option value="AUTO">정원 안에서 자동 승인</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="form-label" htmlFor="event-supplies">준비물</label>
              <textarea className="form-textarea min-h-28 resize-y" id="event-supplies" maxLength={1000} onChange={(event) => updateValue("supplies", event.target.value)} placeholder="예: 편한 신발, 개인 물, 모자" value={values.supplies} />
            </div>
          </div>

          {mode === "create" ? (
            <label className="mt-8 flex min-h-16 cursor-pointer items-start gap-3 rounded-2xl border-2 border-[var(--line)] bg-[var(--canvas)] p-4 font-black">
              <input checked={values.publish} className="mt-1 size-6 min-h-0 shrink-0 accent-[var(--primary)]" onChange={(event) => updateValue("publish", event.target.checked)} type="checkbox" />
              <span>
                입력과 동시에 게시하기
                <span className="mt-1 block font-medium text-[var(--muted)]">선택하지 않으면 작성 중 상태로 안전하게 저장합니다.</span>
              </span>
            </label>
          ) : null}
        </fieldset>

        {error ? <p className="mt-6 flex items-start gap-2 font-black text-[var(--danger)]" role="alert"><CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />{error}</p> : null}
        {announcement ? <p className="mt-6 flex items-start gap-2 font-black text-[var(--success)]" role="status"><CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />{announcement}</p> : null}
        {!canEdit ? <p className="mt-6 font-bold text-[var(--muted)]">이미 시작했거나 종료·취소된 모임은 더 이상 수정할 수 없습니다.</p> : null}

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link className="button-quiet" href="/leader">리더 운영실로</Link>
          {canEdit ? (
            <button className="button-primary" disabled={isBusy || (mode === "edit" && !isDirty)} type="submit">
              {operation === "save" ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <CalendarClock aria-hidden="true" className="size-5" />}
              {mode === "create" ? (values.publish ? "저장하고 게시" : "작성 중으로 저장") : "변경 내용 저장"}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
