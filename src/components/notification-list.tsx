"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BellOff,
  BellRing,
  CalendarClock,
  Check,
  CheckCheck,
  CircleAlert,
  LoaderCircle,
  MessageSquareText,
  Sparkles,
  Star,
  UserCheck,
} from "lucide-react";

import { resolveNotificationHref } from "@/lib/notification-link";
import { isSafeNotificationId } from "@/lib/notification-id";

type NotificationFilter = "all" | "unread" | "activity" | "community";
type NotificationCategory = Exclude<NotificationFilter, "all" | "unread">;

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationPage = {
  hasNextPage: boolean;
  nextCursor: string | null;
};

type NotificationListResponse = {
  data: NotificationItem[];
  page: NotificationPage;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" };

const PAGE_SIZE = 20;
const FILTERS: { id: NotificationFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "unread", label: "읽지 않음" },
  { id: "activity", label: "모임 일정" },
  { id: "community", label: "커뮤니티" },
];

class NotificationRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "NotificationRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNotificationItem(value: unknown): value is NotificationItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    isSafeNotificationId(value.id) &&
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    (value.link === null || typeof value.link === "string") &&
    (value.readAt === null || isDateString(value.readAt)) &&
    isDateString(value.createdAt)
  );
}

function parseNotificationList(value: unknown): NotificationListResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value.data) ||
    !value.data.every(isNotificationItem) ||
    !isRecord(value.page) ||
    typeof value.page.hasNextPage !== "boolean" ||
    !(
      value.page.nextCursor === null ||
      typeof value.page.nextCursor === "string"
    ) ||
    (value.page.hasNextPage && !value.page.nextCursor)
  ) {
    throw new Error("알림 서버 응답 형식을 확인하지 못했습니다.");
  }

  return {
    data: value.data,
    page: {
      hasNextPage: value.page.hasNextPage,
      nextCursor: value.page.nextCursor,
    },
  };
}

function parseUnreadCount(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.unreadCount !== "number" ||
    !Number.isSafeInteger(value.unreadCount) ||
    value.unreadCount < 0
  ) {
    throw new Error("읽지 않은 알림 수를 확인하지 못했습니다.");
  }
  return value.unreadCount;
}

function apiErrorMessage(value: unknown, fallback: string) {
  if (
    isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.message === "string" &&
    value.error.message.trim()
  ) {
    return value.error.message;
  }
  return fallback;
}

async function requestJson(
  path: string,
  fallbackMessage: string,
  init: RequestInit = {},
) {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new NotificationRequestError(
      response.status,
      "서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }

  if (!response.ok) {
    throw new NotificationRequestError(
      response.status,
      apiErrorMessage(body, fallbackMessage),
    );
  }
  return body;
}

function notificationCategory(type: string): NotificationCategory {
  return type === "COMMENT" || type === "REPLY"
    ? "community"
    : "activity";
}

function notificationActionLabel(href: string) {
  if (href.startsWith("/chat")) return "대화방 보기";
  if (href.startsWith("/reviews/new")) return "후기 쓰기";
  if (href.startsWith("/clubs")) return "커뮤니티 보기";
  if (href.startsWith("/events")) return "모임 확인";
  return "소식 확인";
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  const difference = date.getTime() - Date.now();
  const absoluteDifference = Math.abs(difference);
  const relative = new Intl.RelativeTimeFormat("ko-KR", { numeric: "auto" });

  if (absoluteDifference < 60_000) return difference <= 0 ? "방금 전" : "곧";
  if (absoluteDifference < 3_600_000) {
    return relative.format(Math.round(difference / 60_000), "minute");
  }
  if (absoluteDifference < 86_400_000) {
    return relative.format(Math.round(difference / 3_600_000), "hour");
  }
  if (absoluteDifference < 604_800_000) {
    return relative.format(Math.round(difference / 86_400_000), "day");
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function NotificationIcon({ type }: { type: string }) {
  const commonProps = { "aria-hidden": true as const, className: "size-6" };

  switch (type) {
    case "APPLICATION_APPROVED":
      return <UserCheck {...commonProps} />;
    case "APPLICATION_REJECTED":
      return <CircleAlert {...commonProps} />;
    case "EVENT_REMINDER":
      return <CalendarClock {...commonProps} />;
    case "COMMENT":
    case "REPLY":
      return <MessageSquareText {...commonProps} />;
    case "REVIEW_REQUEST":
      return <Star {...commonProps} />;
    case "NEW_EVENT":
      return <Sparkles {...commonProps} />;
    default:
      return <BellRing {...commonProps} />;
  }
}

export function NotificationList() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [page, setPage] = useState<NotificationPage>({
    hasNextPage: false,
    nextCursor: null,
  });
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");
  const [pendingReadIds, setPendingReadIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const pendingReadIdsRef = useRef(new Set<string>());
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const markingAllRef = useRef(false);
  const [mutationError, setMutationError] = useState("");
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoadState({ status: "loading" });
      setLoadMoreError("");
      setMutationError("");
      try {
        const [listPayload, countPayload] = await Promise.all([
          requestJson(
            `/api/me/notifications?limit=${PAGE_SIZE}`,
            "알림을 불러오지 못했습니다.",
            { signal: controller.signal },
          ),
          requestJson(
            "/api/me/notifications/unread-count",
            "읽지 않은 알림 수를 불러오지 못했습니다.",
            { signal: controller.signal },
          ),
        ]);
        if (controller.signal.aborted) return;

        const list = parseNotificationList(listPayload);
        setNotifications(list.data);
        setPage(list.page);
        setUnreadCount(parseUnreadCount(countPayload));
        setLoadState({ status: "ready" });
      } catch (caught) {
        if (controller.signal.aborted) return;
        if (caught instanceof NotificationRequestError && caught.status === 401) {
          router.replace("/login?returnTo=%2Fnotifications");
          return;
        }
        setLoadState({
          status: "error",
          message:
            caught instanceof Error
              ? caught.message
              : "알림을 불러오지 못했습니다.",
        });
      }
    }

    void load();
    return () => controller.abort();
  }, [loadAttempt, router]);

  const filteredNotifications = useMemo(() => {
    if (activeFilter === "all") return notifications;
    if (activeFilter === "unread") {
      return notifications.filter((item) => item.readAt === null);
    }
    return notifications.filter(
      (item) => notificationCategory(item.type) === activeFilter,
    );
  }, [activeFilter, notifications]);

  async function loadMore() {
    const cursor = page.nextCursor;
    if (!page.hasNextPage || !cursor || isLoadingMore) return;

    setIsLoadingMore(true);
    setLoadMoreError("");
    try {
      const payload = await requestJson(
        `/api/me/notifications?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`,
        "이전 알림을 불러오지 못했습니다.",
      );
      const nextPage = parseNotificationList(payload);
      setNotifications((current) => {
        const knownIds = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...nextPage.data.filter((item) => !knownIds.has(item.id)),
        ];
      });
      setPage(nextPage.page);
    } catch (caught) {
      if (caught instanceof NotificationRequestError && caught.status === 401) {
        router.replace("/login?returnTo=%2Fnotifications");
        return;
      }
      setLoadMoreError(
        caught instanceof Error
          ? caught.message
          : "이전 알림을 불러오지 못했습니다.",
      );
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function markAsRead(id: string) {
    const item = notifications.find((notification) => notification.id === id);
    if (!item || item.readAt !== null) return true;
    if (pendingReadIdsRef.current.has(id) || markingAllRef.current) return false;

    pendingReadIdsRef.current.add(id);
    setPendingReadIds(new Set(pendingReadIdsRef.current));
    setMutationError("");
    try {
      const payload = await requestJson(
        `/api/me/notifications/${encodeURIComponent(id)}/read`,
        "알림을 읽음으로 표시하지 못했습니다.",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!isRecord(payload) || payload.success !== true) {
        throw new Error("알림 읽음 처리 결과를 확인하지 못했습니다.");
      }

      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === id && notification.readAt === null
            ? { ...notification, readAt }
            : notification,
        ),
      );
      setUnreadCount((current) => Math.max(0, current - 1));
      setAnnouncement("알림을 읽음으로 표시했습니다.");
      return true;
    } catch (caught) {
      if (caught instanceof NotificationRequestError && caught.status === 401) {
        router.replace("/login?returnTo=%2Fnotifications");
        return false;
      }
      setMutationError(
        caught instanceof Error
          ? caught.message
          : "알림을 읽음으로 표시하지 못했습니다.",
      );
      return false;
    } finally {
      pendingReadIdsRef.current.delete(id);
      setPendingReadIds(new Set(pendingReadIdsRef.current));
    }
  }

  async function openNotification(item: NotificationItem, href: Route) {
    const marked = await markAsRead(item.id);
    if (marked) router.push(href);
  }

  async function markAllAsRead() {
    if (
      unreadCount === 0 ||
      markingAllRef.current ||
      pendingReadIdsRef.current.size > 0
    ) {
      return;
    }

    markingAllRef.current = true;
    setIsMarkingAll(true);
    setMutationError("");
    try {
      const payload = await requestJson(
        "/api/me/notifications/read-all",
        "모든 알림을 읽음으로 표시하지 못했습니다.",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!isRecord(payload) || payload.success !== true) {
        throw new Error("전체 알림 읽음 처리 결과를 확인하지 못했습니다.");
      }

      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((item) =>
          item.readAt === null ? { ...item, readAt } : item,
        ),
      );
      setUnreadCount(0);
      setAnnouncement("모든 알림을 읽음으로 표시했습니다.");
    } catch (caught) {
      if (caught instanceof NotificationRequestError && caught.status === 401) {
        router.replace("/login?returnTo=%2Fnotifications");
        return;
      }
      setMutationError(
        caught instanceof Error
          ? caught.message
          : "모든 알림을 읽음으로 표시하지 못했습니다.",
      );
    } finally {
      markingAllRef.current = false;
      setIsMarkingAll(false);
    }
  }

  return (
    <section aria-labelledby="notification-list-title">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">
            <BellRing aria-hidden="true" className="size-5" />
            {loadState.status === "ready"
              ? `새 소식 ${unreadCount}개`
              : "새 소식 확인 중"}
          </p>
          <h2 className="section-title" id="notification-list-title">
            놓치지 않아야 할 소식
          </h2>
        </div>
        <button
          aria-busy={isMarkingAll}
          className="button-secondary self-start sm:self-auto"
          disabled={
            loadState.status !== "ready" ||
            unreadCount === 0 ||
            isMarkingAll ||
            pendingReadIds.size > 0
          }
          onClick={() => void markAllAsRead()}
          type="button"
        >
          {isMarkingAll ? (
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
          ) : (
            <CheckCheck aria-hidden="true" className="size-5" />
          )}
          {isMarkingAll ? "처리 중" : "모두 읽음"}
        </button>
      </div>

      <div aria-label="알림 종류" className="mb-5 flex gap-2 overflow-x-auto pb-2">
        {FILTERS.map((filter) => {
          const isActive = activeFilter === filter.id;
          return (
            <button
              aria-pressed={isActive}
              className={`shrink-0 ${isActive ? "button-primary" : "button-quiet"}`}
              disabled={loadState.status !== "ready"}
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              type="button"
            >
              {filter.label}
              {filter.id === "unread" && unreadCount > 0 && (
                <span
                  className={`tag ${isActive ? "bg-white text-[var(--primary-strong)]" : ""}`}
                >
                  {unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {mutationError && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl bg-red-50 p-4 font-bold text-red-800" role="alert">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {mutationError}
        </div>
      )}

      {loadState.status === "loading" && (
        <div className="panel flex min-h-48 items-center justify-center p-8" role="status">
          <span className="flex items-center gap-3 font-extrabold text-[var(--muted)]">
            <LoaderCircle aria-hidden="true" className="size-6 animate-spin" />
            알림을 불러오고 있어요
          </span>
        </div>
      )}

      {loadState.status === "error" && (
        <div className="panel p-8 text-center sm:p-12" role="alert">
          <CircleAlert aria-hidden="true" className="mx-auto size-12 text-red-700" />
          <h3 className="mt-4 text-xl font-black">알림을 불러오지 못했습니다</h3>
          <p className="mt-2 text-[var(--muted)]">{loadState.message}</p>
          <button
            className="button-primary mt-5"
            onClick={() => setLoadAttempt((current) => current + 1)}
            type="button"
          >
            다시 시도
          </button>
        </div>
      )}

      {loadState.status === "ready" && filteredNotifications.length > 0 && (
        <ul className="m-0 grid list-none gap-3 p-0">
          {filteredNotifications.map((item) => {
            const isRead = item.readAt !== null;
            const isPending = pendingReadIds.has(item.id);
            const href = resolveNotificationHref(item.link);

            return (
              <li
                className={`panel relative overflow-hidden p-5 sm:p-6 ${
                  isRead
                    ? "bg-[var(--surface)]"
                    : "border-l-4 border-l-[var(--accent)] bg-[color-mix(in_srgb,var(--accent-soft)_32%,white)]"
                }`}
                key={item.id}
              >
                <article className="flex items-start gap-4">
                  <span
                    aria-hidden="true"
                    className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${
                      isRead
                        ? "bg-[var(--canvas-deep)] text-[var(--muted)]"
                        : "bg-[var(--sky-soft)] text-[var(--primary-strong)]"
                    }`}
                  >
                    <NotificationIcon type={item.type} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div>
                        {!isRead && (
                          <span className="mb-1 inline-flex items-center gap-1 text-sm font-black text-[var(--accent)]">
                            <span
                              aria-hidden="true"
                              className="size-2 rounded-full bg-[var(--accent)]"
                            />
                            새 알림
                          </span>
                        )}
                        <h3 className="m-0 text-lg font-black leading-snug tracking-[-0.02em] sm:text-xl">
                          {item.title}
                        </h3>
                      </div>
                      <time
                        className="shrink-0 text-sm font-bold text-[var(--muted)]"
                        dateTime={item.createdAt}
                      >
                        {formatNotificationTime(item.createdAt)}
                      </time>
                    </div>
                    <p className="my-3 max-w-3xl leading-relaxed text-[var(--muted)]">
                      {item.body}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {href && (
                        <button
                          className="button-primary"
                          disabled={isPending || isMarkingAll}
                          onClick={() => void openNotification(item, href)}
                          type="button"
                        >
                          {isPending
                            ? "확인 중"
                            : notificationActionLabel(href)}
                          {isPending ? (
                            <LoaderCircle
                              aria-hidden="true"
                              className="size-5 animate-spin"
                            />
                          ) : (
                            <ArrowRight aria-hidden="true" className="size-5" />
                          )}
                        </button>
                      )}
                      {!isRead && (
                        <button
                          className="button-quiet"
                          disabled={isPending || isMarkingAll}
                          onClick={() => void markAsRead(item.id)}
                          type="button"
                        >
                          {isPending ? (
                            <LoaderCircle
                              aria-hidden="true"
                              className="size-5 animate-spin"
                            />
                          ) : (
                            <Check aria-hidden="true" className="size-5" />
                          )}
                          {isPending ? "처리 중" : "읽음으로 표시"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {loadState.status === "ready" && filteredNotifications.length === 0 && (
        <div className="panel p-8 text-center sm:p-12">
          <BellOff aria-hidden="true" className="mx-auto size-12 text-[var(--primary)]" />
          <h3 className="mt-4 text-xl font-black">
            {notifications.length === 0
              ? "아직 받은 알림이 없습니다"
              : "해당하는 알림이 없습니다"}
          </h3>
          <p className="mt-2 text-[var(--muted)]">
            {notifications.length === 0
              ? "모임 신청과 활동 소식이 생기면 이곳에서 알려드릴게요."
              : "다른 종류를 선택하면 이전 소식을 다시 볼 수 있습니다."}
          </p>
          {notifications.length > 0 && activeFilter !== "all" && (
            <button
              className="button-secondary mt-5"
              onClick={() => setActiveFilter("all")}
              type="button"
            >
              전체 알림 보기
            </button>
          )}
        </div>
      )}

      {loadState.status === "ready" && page.hasNextPage && (
        <div className="mt-5 text-center">
          {loadMoreError && (
            <p className="mb-3 font-bold text-red-800" role="alert">
              {loadMoreError}
            </p>
          )}
          <button
            aria-busy={isLoadingMore}
            className="button-secondary"
            disabled={isLoadingMore}
            onClick={() => void loadMore()}
            type="button"
          >
            {isLoadingMore && (
              <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
            )}
            {isLoadingMore ? "불러오는 중" : "이전 알림 더 보기"}
          </button>
        </div>
      )}

      <p aria-live="polite" className="screen-reader-only" role="status">
        {announcement}
      </p>
    </section>
  );
}
