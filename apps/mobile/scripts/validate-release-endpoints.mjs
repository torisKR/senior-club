import { Buffer } from 'node:buffer';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import releaseApiUrl from '../src/config/release-api-url.js';

const { getReleaseApiUrlViolation } = releaseApiUrl;

export const DEFAULT_ENDPOINT_TIMEOUT_MS = 10_000;
export const ENDPOINT_BODY_LIMIT_BYTES = Object.freeze({
  readiness: 64 * 1024,
  policy: 2 * 1024 * 1024,
});

const POLICY_PATHS = ['/terms', '/privacy', '/account-deletion'];
const RELEASE_BLOCKERS = [
  { label: '초안', pattern: /초안/u },
  { label: '임시', pattern: /임시/u },
  { label: '미확정', pattern: /미확정/u },
  { label: '출시 전', pattern: /(?:정식\s*)?출시\s*전(?:에|\s*확인)?/u },
  { label: '시행 예정일', pattern: /시행\s*예정일/u },
  { label: '확정 필요', pattern: /확정해야\s*합니다/u },
  { label: '교체 필요', pattern: /교체해야\s*합니다/u },
];

function requireReleaseUrl(rawValue, variableName, { originOnly = false } = {}) {
  if (typeof rawValue !== 'string' || rawValue.length === 0) {
    throw new Error(`${variableName}이(가) 필요합니다.`);
  }
  if (rawValue !== rawValue.trim()) {
    throw new Error(`${variableName} 앞뒤에 공백을 사용할 수 없습니다.`);
  }

  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`${variableName}이(가) 유효한 절대 URL이 아닙니다.`);
  }

  const violation = getReleaseApiUrlViolation(parsed);
  if (violation) {
    throw new Error(`${variableName}은(는) 공개 HTTPS URL이어야 합니다: ${violation}.`);
  }
  if (originOnly && parsed.pathname !== '/') {
    throw new Error(`${variableName}에는 origin만 입력해야 합니다 (경로 사용 불가).`);
  }

  return parsed;
}

/**
 * Converts explicit environment-like input into deterministic release endpoint checks.
 * This helper is pure: it never reads process.env or performs network I/O.
 */
export function buildReleaseEndpointChecks(environment) {
  const apiUrl = requireReleaseUrl(environment?.EXPO_PUBLIC_API_URL, 'EXPO_PUBLIC_API_URL');
  const webUrl = requireReleaseUrl(environment?.EXPO_PUBLIC_WEB_URL, 'EXPO_PUBLIC_WEB_URL', {
    originOnly: true,
  });

  return [
    {
      kind: 'readiness',
      label: 'API readiness',
      url: new URL('/readyz', apiUrl.origin).href,
      accept: 'application/json',
    },
    ...POLICY_PATHS.map((pathname) => ({
      kind: 'policy',
      label: `공개 정책 ${pathname}`,
      url: new URL(pathname, webUrl.origin).href,
      accept: 'text/html',
      expectedOrigin: webUrl.origin,
    })),
  ];
}

function normalizeMediaType(contentType) {
  return contentType.split(';', 1)[0].trim().toLowerCase();
}

/** Returns a failure reason for response metadata, or null when it is acceptable. */
export function getResponseMetadataViolation(check, response) {
  if (!response || typeof response !== 'object') return '응답 객체가 없습니다.';
  if (response.status !== 200) return `HTTP ${String(response.status)} (200 필요)`;
  if (response.redirected !== false || response.type === 'opaqueredirect') {
    return 'redirect 응답은 허용되지 않습니다.';
  }
  if (response.url !== check.url) {
    return `최종 URL이 요청 URL과 다릅니다: ${String(response.url || '(없음)')}`;
  }

  if (check.expectedOrigin) {
    let responseOrigin;
    try {
      responseOrigin = new URL(response.url).origin;
    } catch {
      return '최종 응답 URL을 해석할 수 없습니다.';
    }
    if (responseOrigin !== check.expectedOrigin) {
      return `정책 페이지 origin이 다릅니다: ${responseOrigin}`;
    }
  }

  return null;
}

/** Returns a failure reason for a decoded endpoint body, or null when it is valid. */
export function getResponseBodyViolation(check, contentType, body) {
  const mediaType = normalizeMediaType(contentType ?? '');

  if (check.kind === 'readiness') {
    if (mediaType !== 'application/json' && !mediaType.endsWith('+json')) {
      return `Content-Type이 JSON이 아닙니다: ${contentType || '(없음)'}`;
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return '응답 본문이 유효한 JSON이 아닙니다.';
    }
    if (!payload || typeof payload !== 'object' || payload.status !== 'ready') {
      return 'JSON status가 정확히 "ready"가 아닙니다.';
    }
    return null;
  }

  if (check.kind === 'policy') {
    if (mediaType !== 'text/html') {
      return `Content-Type이 HTML이 아닙니다: ${contentType || '(없음)'}`;
    }
    if (typeof body !== 'string' || body.trim().length === 0) {
      return 'HTML 본문이 비어 있습니다.';
    }
    if (!/<(?:!doctype\s+html|html)(?:\s|>)/iu.test(body)) {
      return '완전한 HTML 문서가 아닙니다.';
    }
    const normalizedBody = body.normalize('NFKC').replace(/\s+/gu, ' ');
    const blocker = RELEASE_BLOCKERS.find(({ pattern }) => pattern.test(normalizedBody));
    if (blocker) return `출시 차단 문구 "${blocker.label}"이(가) 포함되어 있습니다.`;
    return null;
  }

  return `알 수 없는 endpoint 종류입니다: ${String(check.kind)}`;
}

function getDeclaredBodySizeViolation(check, response) {
  const limit = ENDPOINT_BODY_LIMIT_BYTES[check.kind];
  if (!limit) return `알 수 없는 endpoint 종류입니다: ${String(check.kind)}`;

  const contentLength = response.headers?.get?.('content-length');
  if (contentLength !== null && contentLength !== undefined && contentLength !== '') {
    if (!/^\d+$/.test(contentLength)) return 'Content-Length가 유효한 정수가 아닙니다.';
    if (Number(contentLength) > limit) {
      return `Content-Length가 ${limit} byte 제한을 초과합니다.`;
    }
  }

  return null;
}

function getActualBodySizeViolation(check, body) {
  const limit = ENDPOINT_BODY_LIMIT_BYTES[check.kind];
  if (!limit) return `알 수 없는 endpoint 종류입니다: ${String(check.kind)}`;

  if (typeof body !== 'string') return '응답 본문이 문자열이 아닙니다.';
  if (Buffer.byteLength(body, 'utf8') > limit) {
    return `실제 본문이 ${limit} byte 제한을 초과합니다.`;
  }
  return null;
}

async function validateEndpointWithinSignal(check, fetchImpl, signal) {
  const response = await fetchImpl(check.url, {
    method: 'GET',
    redirect: 'manual',
    signal,
    headers: {
      Accept: check.accept,
      'Cache-Control': 'no-cache',
    },
  });

  const metadataViolation = getResponseMetadataViolation(check, response);
  if (metadataViolation) throw new Error(`검증 실패: ${metadataViolation}`);

  const contentType = response.headers?.get?.('content-type') ?? '';
  const declaredBodySizeViolation = getDeclaredBodySizeViolation(check, response);
  if (declaredBodySizeViolation) {
    throw new Error(`검증 실패: ${declaredBodySizeViolation}`);
  }

  const body = await response.text();
  const actualBodySizeViolation = getActualBodySizeViolation(check, body);
  if (actualBodySizeViolation) throw new Error(`검증 실패: ${actualBodySizeViolation}`);

  const bodyViolation = getResponseBodyViolation(check, contentType, body);
  if (bodyViolation) throw new Error(`검증 실패: ${bodyViolation}`);

  return { label: check.label, url: check.url };
}

async function validateEndpoint(check, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${timeoutMs}ms timeout`));
      controller.abort();
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      validateEndpointWithinSignal(check, fetchImpl, controller.signal),
      timeoutPromise,
    ]);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.startsWith('검증 실패:')) throw new Error(`${check.label} ${detail}`);
    throw new Error(`${check.label} 요청 실패: ${detail}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function validateReleaseEndpoints({
  environment,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_ENDPOINT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch 구현이 필요합니다.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('timeoutMs는 0보다 큰 유한한 숫자여야 합니다.');
  }

  const checks = buildReleaseEndpointChecks(environment);
  return Promise.all(checks.map((check) => validateEndpoint(check, fetchImpl, timeoutMs)));
}

export async function main(environment = process.env) {
  try {
    const results = await validateReleaseEndpoints({ environment });
    for (const result of results) console.log(`PASS ${result.label}: ${result.url}`);
    console.log('PASS production API와 공개 정책 endpoint 검증 완료.');
  } catch (error) {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) await main();
