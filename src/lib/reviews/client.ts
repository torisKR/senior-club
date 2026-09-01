export type CreateReviewInput = {
  rating: number;
  content: string;
};

export type CreatedReview = {
  id: string;
  eventId: string;
  rating: number;
  content: string;
  author: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
};

type SubmitReviewOptions = {
  fetchImplementation?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
};

const DEFAULT_REVIEW_TIMEOUT_MS = 12_000;

export class ReviewRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ReviewRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorDetails(value: unknown) {
  if (!isRecord(value) || !isRecord(value.error)) return {};
  return {
    code:
      typeof value.error.code === "string" ? value.error.code : undefined,
    message:
      typeof value.error.message === "string" && value.error.message.trim()
        ? value.error.message
        : undefined,
  };
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function parseCreatedReview(value: unknown): CreatedReview {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.eventId !== "string" ||
    !Number.isInteger(value.rating) ||
    (value.rating as number) < 1 ||
    (value.rating as number) > 5 ||
    typeof value.content !== "string" ||
    !isRecord(value.author) ||
    typeof value.author.id !== "string" ||
    typeof value.author.name !== "string" ||
    !isIsoDate(value.createdAt) ||
    !isIsoDate(value.updatedAt)
  ) {
    throw new Error("후기 서버 응답을 확인하지 못했습니다.");
  }

  return value as CreatedReview;
}

function normalizedInput(input: CreateReviewInput): CreateReviewInput {
  const content = input.content.trim();
  if (
    !Number.isInteger(input.rating) ||
    input.rating < 1 ||
    input.rating > 5 ||
    content.length < 10 ||
    content.length > 800
  ) {
    throw new Error("별점과 10~800자의 후기 내용을 확인해 주세요.");
  }
  return { rating: input.rating, content };
}

function requestAbortError(
  callerSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal,
) {
  if (callerSignal?.aborted) {
    return new ReviewRequestError(
      0,
      "후기 등록 요청이 취소되었습니다.",
      "REQUEST_ABORTED",
    );
  }
  if (timeoutSignal.aborted) {
    return new ReviewRequestError(
      408,
      "서버 응답이 늦어지고 있습니다. 잠시 후 다시 시도해 주세요.",
      "REQUEST_TIMEOUT",
    );
  }
  return null;
}

export async function submitEventReview(
  eventId: string,
  input: CreateReviewInput,
  options: SubmitReviewOptions = {},
) {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const safeInput = normalizedInput(input);
  const timeoutMs = options.timeoutMs ?? DEFAULT_REVIEW_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new Error("후기 요청 제한 시간은 1~60000ms의 정수여야 합니다.");
  }
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const requestSignal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;

  let response: Response;
  try {
    response = await fetchImplementation(
      `/api/events/${encodeURIComponent(eventId)}/reviews`,
      {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(safeInput),
        signal: requestSignal,
      },
    );
  } catch (error) {
    const abortError = requestAbortError(options.signal, timeoutSignal);
    if (abortError) throw abortError;
    throw error;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    const abortError = requestAbortError(options.signal, timeoutSignal);
    if (abortError) throw abortError;
    throw new ReviewRequestError(
      response.status,
      "서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }

  if (!response.ok) {
    const details = errorDetails(body);
    throw new ReviewRequestError(
      response.status,
      details.message ?? "후기를 등록하지 못했습니다.",
      details.code,
    );
  }

  const review = parseCreatedReview(body);
  if (review.eventId !== eventId) {
    throw new Error("등록된 후기의 모임 정보를 확인하지 못했습니다.");
  }
  return review;
}
