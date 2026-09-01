export type EventApplicationStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELED";

export type EventApplicationRecord = {
  id: string;
  eventId: string;
  userId: string;
  status: EventApplicationStatus;
  appliedAt: string;
  decidedAt: string | null;
  canceledAt: string | null;
  updatedAt: string;
};

export type AccountDeletionRecord = {
  id: string;
  status: "REQUESTED" | "PROCESSING" | "FAILED" | "CANCELED" | "COMPLETED";
  requestedAt: string;
  scheduledFor: string;
  completedAt: string | null;
};

type ProtectedResourceResult<T> =
  | { authenticated: false }
  | { authenticated: true; data: T };

type ProtectedResourceOptions = {
  signal?: AbortSignal;
  fetchImplementation?: typeof fetch;
};

function errorMessage(value: unknown, fallback: string) {
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

async function loadProtectedResource<T>(
  path: string,
  fallbackMessage: string,
  options: ProtectedResourceOptions = {},
): Promise<ProtectedResourceResult<T>> {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const response = await fetchImplementation(path, {
    cache: "no-store",
    credentials: "same-origin",
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (response.status === 401) return { authenticated: false };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  if (!response.ok) throw new Error(errorMessage(body, fallbackMessage));
  return { authenticated: true, data: body as T };
}

export async function loadEventApplication(
  eventId: string,
  options?: ProtectedResourceOptions,
): Promise<
  | { authenticated: false }
  | { authenticated: true; application: EventApplicationRecord | null }
> {
  const result = await loadProtectedResource<{
    application?: EventApplicationRecord | null;
  }>(
    `/api/events/${encodeURIComponent(eventId)}/applications`,
    "신청 상태를 확인하지 못했습니다.",
    options,
  );

  if (!result.authenticated) return result;
  return {
    authenticated: true,
    application: result.data.application ?? null,
  };
}

export async function loadAccountDeletionRequest(
  options?: ProtectedResourceOptions,
): Promise<
  | { authenticated: false }
  | { authenticated: true; deletionRequest: AccountDeletionRecord | null }
> {
  const result = await loadProtectedResource<{
    deletionRequest?: AccountDeletionRecord | null;
  }>(
    "/api/me/deletion-request",
    "삭제 요청 상태를 확인하지 못했습니다.",
    options,
  );

  if (!result.authenticated) return result;
  return {
    authenticated: true,
    deletionRequest: result.data.deletionRequest ?? null,
  };
}
