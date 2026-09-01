import {
  getServerApiBaseUrl,
  parseServerApiBaseUrl,
} from "@/lib/api/config";

type FetchImplementation = typeof fetch;

export type JsonRequestOptions<TBody = never> = Omit<
  RequestInit,
  "body" | "method" | "redirect"
> & {
  body?: TBody;
  method?: string;
};

export type JsonMethodOptions<TBody = never> = Omit<
  JsonRequestOptions<TBody>,
  "method"
>;

export type JsonApiClientOptions = {
  baseUrl?: string | URL;
  fetchImplementation?: FetchImplementation;
  allowInsecureLocalhost?: boolean;
  requestTimeoutMs?: number;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;

export class ApiClientRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiClientRequestError";
  }
}

export class ApiClientProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiClientProtocolError";
  }
}

export class ApiClientTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`API 응답 시간이 ${timeoutMs}ms를 초과했습니다.`);
    this.name = "ApiClientTimeoutError";
  }
}

export class ApiHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiHttpError";
  }
}

type ApiErrorEnvelope = {
  error?: {
    code?: unknown;
    message?: unknown;
    requestId?: unknown;
    details?: unknown;
  };
};

function normalizeBaseUrl(
  baseUrl: string | URL | undefined,
  allowInsecureLocalhost: boolean | undefined,
) {
  if (baseUrl === undefined) {
    return getServerApiBaseUrl(process.env, { allowInsecureLocalhost });
  }

  return parseServerApiBaseUrl(baseUrl.toString(), {
    allowInsecureLocalhost,
  });
}

function hasUnsafePathSegment(endpoint: string) {
  const pathname = endpoint.split(/[?#]/, 1)[0];
  try {
    return pathname
      .split("/")
      .some((segment) => {
        let decoded = segment;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const next = decodeURIComponent(decoded);
          if (
            next === "." ||
            next === ".." ||
            /[\u0000-\u001f\u007f\\/]/.test(next)
          ) {
            return true;
          }
          if (next === decoded) break;
          decoded = next;
        }
        return false;
      });
  } catch {
    return true;
  }
}

export function resolveApiEndpoint(baseUrl: URL, endpoint: string) {
  if (
    !endpoint ||
    endpoint !== endpoint.trim() ||
    /[\u0000-\u001f\u007f\\]/.test(endpoint) ||
    endpoint.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/i.test(endpoint) ||
    endpoint.startsWith("#") ||
    hasUnsafePathSegment(endpoint)
  ) {
    throw new ApiClientRequestError("API endpoint는 안전한 상대 경로여야 합니다.");
  }

  const resolutionBase = new URL(baseUrl);
  if (!resolutionBase.pathname.endsWith("/")) {
    resolutionBase.pathname = `${resolutionBase.pathname}/`;
  }

  const relativeEndpoint = endpoint.startsWith("/")
    ? endpoint.slice(1)
    : endpoint;
  const resolved = new URL(relativeEndpoint, resolutionBase);

  if (
    resolved.origin !== resolutionBase.origin ||
    !resolved.pathname.startsWith(resolutionBase.pathname) ||
    resolved.hash
  ) {
    throw new ApiClientRequestError(
      "API endpoint가 설정된 서버 base URL을 벗어났습니다.",
    );
  }

  return resolved;
}

function isJsonContentType(contentType: string | null) {
  if (!contentType) return false;
  return /^application\/(?:json|[a-z\d!#$&^_.+-]+\+json)(?:\s*;|$)/i.test(
    contentType,
  );
}

async function readJsonResponse(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined;

  const contentType = response.headers.get("content-type");
  if (!isJsonContentType(contentType)) {
    throw new ApiClientProtocolError(
      `API가 JSON이 아닌 응답을 반환했습니다. (${response.status})`,
    );
  }

  const body = await response.text();
  if (!body) return undefined;

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ApiClientProtocolError(
      `API가 올바르지 않은 JSON을 반환했습니다. (${response.status})`,
    );
  }
}

function toHttpError(response: Response, payload: unknown) {
  const envelope = payload as ApiErrorEnvelope | null;
  const error = envelope?.error;
  const code = typeof error?.code === "string" ? error.code : undefined;
  const requestId =
    typeof error?.requestId === "string" ? error.requestId : undefined;
  const message =
    typeof error?.message === "string" && error.message.trim()
      ? error.message
      : `API 요청이 실패했습니다. (${response.status})`;

  return new ApiHttpError(
    response.status,
    message,
    code,
    requestId,
    error?.details,
  );
}

export function createJsonApiClient({
  baseUrl,
  fetchImplementation = fetch,
  allowInsecureLocalhost,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
}: JsonApiClientOptions = {}) {
  const trustedBaseUrl = normalizeBaseUrl(baseUrl, allowInsecureLocalhost);
  if (
    !Number.isSafeInteger(requestTimeoutMs) ||
    requestTimeoutMs < 1 ||
    requestTimeoutMs > 60_000
  ) {
    throw new ApiClientRequestError(
      "API 요청 제한 시간은 1~60000ms의 정수여야 합니다.",
    );
  }

  async function request<TResponse, TBody = never>(
    endpoint: string,
    options: JsonRequestOptions<TBody> = {},
  ): Promise<TResponse> {
    const method = (options.method ?? "GET").toUpperCase();
    const hasBody = options.body !== undefined;

    if (hasBody && (method === "GET" || method === "HEAD")) {
      throw new ApiClientRequestError(
        `${method} 요청에는 JSON body를 사용할 수 없습니다.`,
      );
    }

    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");

    let serializedBody: string | undefined;
    if (hasBody) {
      headers.set("Content-Type", "application/json");
      try {
        serializedBody = JSON.stringify(options.body);
        if (serializedBody === undefined) {
          throw new TypeError("JSON body is undefined");
        }
      } catch {
        throw new ApiClientRequestError("API 요청 body를 JSON으로 만들 수 없습니다.");
      }
    }

    const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;

    try {
      const response = await fetchImplementation(
        resolveApiEndpoint(trustedBaseUrl, endpoint),
        {
          ...options,
          body: serializedBody,
          cache: options.cache ?? "no-store",
          headers,
          method,
          redirect: "error",
          signal,
        },
      );
      const payload = await readJsonResponse(response);

      if (!response.ok) {
        throw toHttpError(response, payload);
      }

      return payload as TResponse;
    } catch (error) {
      if (timeoutSignal.aborted && !options.signal?.aborted) {
        throw new ApiClientTimeoutError(requestTimeoutMs);
      }
      throw error;
    }
  }

  return {
    request,
    get<TResponse>(endpoint: string, options: JsonMethodOptions = {}) {
      return request<TResponse>(endpoint, { ...options, method: "GET" });
    },
    post<TResponse, TBody>(
      endpoint: string,
      body: TBody,
      options: JsonMethodOptions = {},
    ) {
      return request<TResponse, TBody>(endpoint, {
        ...options,
        body,
        method: "POST",
      });
    },
    put<TResponse, TBody>(
      endpoint: string,
      body: TBody,
      options: JsonMethodOptions = {},
    ) {
      return request<TResponse, TBody>(endpoint, {
        ...options,
        body,
        method: "PUT",
      });
    },
    patch<TResponse, TBody>(
      endpoint: string,
      body: TBody,
      options: JsonMethodOptions = {},
    ) {
      return request<TResponse, TBody>(endpoint, {
        ...options,
        body,
        method: "PATCH",
      });
    },
    delete<TResponse>(endpoint: string, options: JsonMethodOptions = {}) {
      return request<TResponse>(endpoint, { ...options, method: "DELETE" });
    },
  };
}
