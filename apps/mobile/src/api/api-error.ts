export interface ApiErrorOptions {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  retryAfterMs?: number;
  cause?: unknown;
}

export interface ErrorResponseLike {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Pick<Headers, 'get'>;
  text(): Promise<string>;
}

const MAX_SERVER_MESSAGE_LENGTH = 500;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;
  readonly retryAfterMs?: number;

  constructor(options: ApiErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.requestId = options.requestId;
    this.retryAfterMs = options.retryAfterMs;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function safeServerMessage(value: unknown) {
  const message = nonEmptyString(value);
  return message && message.length <= MAX_SERVER_MESSAGE_LENGTH ? message : undefined;
}

function parseRetryAfter(value: string | null, now: number) {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isRetryableApiError(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500)
  );
}

/** Converts the documented `{ error: { ... } }` envelope into a stable client error. */
export async function apiErrorFromResponse(
  response: ErrorResponseLike,
  now = Date.now(),
): Promise<ApiError> {
  let body: unknown;

  try {
    const text = await response.text();
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  const envelope = asRecord(body);
  const errorBody = asRecord(envelope?.error) ?? envelope;
  const headerRequestId = nonEmptyString(response.headers.get('x-request-id'));
  const requestId = nonEmptyString(errorBody?.requestId) ?? headerRequestId;
  const code = nonEmptyString(errorBody?.code) ?? `HTTP_${response.status}`;
  const message =
    safeServerMessage(errorBody?.message) ??
    safeServerMessage(response.statusText) ??
    '서버 요청을 처리하지 못했습니다.';

  return new ApiError({
    status: response.status,
    code,
    message,
    details: errorBody?.details,
    requestId,
    retryAfterMs: parseRetryAfter(response.headers.get('retry-after'), now),
  });
}
