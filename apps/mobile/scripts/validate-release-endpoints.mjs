import { Buffer } from 'node:buffer';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import releaseApiUrl from '../src/config/release-api-url.js';
import publicPolicy from '../src/config/public-policy-url.js';

const { getReleaseApiUrlViolation } = releaseApiUrl;
const { PRIVACY_POLICY_URL, APP_ADS_URL, ADMOB_PUBLISHER_ID } = publicPolicy;

export const DEFAULT_ENDPOINT_TIMEOUT_MS = 10_000;
export const ENDPOINT_BODY_LIMIT_BYTES = Object.freeze({
  policy: 2 * 1024 * 1024,
  notionPolicy: 2 * 1024 * 1024,
  appAds: 64 * 1024,
});
export const NOTION_PUBLIC_PAGE_ENDPOINT = 'https://www.notion.so/api/v3/loadPageChunk';

const RELEASE_BLOCKERS = [
  { label: '초안', pattern: /초안/u },
  { label: '임시', pattern: /임시/u },
  { label: '미확정', pattern: /미확정/u },
  { label: '출시 전', pattern: /(?:정식\s*)?출시\s*전(?:에|\s*확인)?/u },
  { label: '시행 예정일', pattern: /시행\s*예정일/u },
  { label: '확정 필요', pattern: /확정해야\s*합니다/u },
  { label: '교체 필요', pattern: /교체해야\s*합니다/u },
  {
    label: '공급자 처리정보 미확정',
    pattern: /(?:수탁자|위탁처리자)[^<>]{0,160}공급자\s*계약을\s*확정한\s*뒤/u,
  },
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
export function buildReleaseEndpointChecks() {
  const policyUrl = requireReleaseUrl(PRIVACY_POLICY_URL, '개인정보처리방침 URL');
  const appAdsUrl = requireReleaseUrl(APP_ADS_URL, 'app-ads.txt URL');
  const policyPage = policyUrl.pathname.match(/^\/([0-9a-f]{32})$/u)?.[1];
  if (policyUrl.hostname !== 'plume-mine-90a.notion.site' || !policyPage || policyUrl.search || policyUrl.hash) {
    throw new Error('게시된 Notion 정책 페이지 주소가 아닙니다.');
  }
  const policyPageId = policyPage.replace(/^(........)(....)(....)(....)(............)$/u, '$1-$2-$3-$4-$5');

  return [
    {
      kind: 'policy',
      label: '공개 개인정보처리방침',
      url: policyUrl.href,
      accept: 'text/html',
      expectedOrigin: policyUrl.origin,
    },
    {
      kind: 'notionPolicy',
      label: '비로그인 정책 본문',
      url: NOTION_PUBLIC_PAGE_ENDPOINT,
      accept: 'application/json',
      pageId: policyPageId,
    },
    {
      kind: 'appAds',
      label: '광고 판매자 파일',
      url: appAdsUrl.href,
      accept: 'text/plain',
      expectedOrigin: appAdsUrl.origin,
    },
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

  if (check.kind === 'notionPolicy') {
    if (mediaType !== 'application/json') return 'Notion 공개 본문이 JSON이 아닙니다.';
    let data;
    try { data = JSON.parse(body); } catch { return 'Notion 공개 본문을 해석할 수 없습니다.'; }
    const blocks = data?.recordMap?.block;
    const page = blocks?.[check.pageId]?.value;
    const pageValue = page?.value;
    if (page?.role !== 'reader' || pageValue?.id !== check.pageId || !Array.isArray(pageValue?.content)) {
      return '로그인 없이 읽을 수 있는 정확한 정책 페이지가 아닙니다.';
    }
    const title = pageValue?.properties?.title?.map((part) => part?.[0] ?? '').join('') ?? '';
    const visibleText = pageValue.content.map((id) => blocks?.[id]?.value?.value?.properties?.title?.map((part) => part?.[0] ?? '').join('') ?? '').join(' ');
    if (!title.includes('시니어클럽') || !visibleText.includes('RevenueCat') || !visibleText.includes('광고')) {
      return '시니어클럽 정책 제목 또는 광고·구매 안내가 공개 본문에 없습니다.';
    }
    const blocker = RELEASE_BLOCKERS.find(({ pattern }) => pattern.test(visibleText.normalize('NFKC')));
    return blocker ? `출시 차단 문구 "${blocker.label}"이(가) 포함되어 있습니다.` : null;
  }

  if (check.kind === 'appAds') {
    if (mediaType !== 'text/plain') return `Content-Type이 텍스트가 아닙니다: ${contentType || '(없음)'}`;
    const found = typeof body === 'string' && body.split(/\r?\n/u).some((line) => {
      const fields = line.split('#', 1)[0].split(',').map((field) => field.trim());
      return fields.length === 4 && fields[0].toLowerCase() === 'google.com' &&
        fields[1] === ADMOB_PUBLISHER_ID && fields[2].toUpperCase() === 'DIRECT' &&
        fields[3].toLowerCase() === 'f08c47fec0942fa0';
    });
    return found ? null : 'Google AdMob 판매자 항목이 없거나 일치하지 않습니다.';
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
    method: check.kind === 'notionPolicy' ? 'POST' : 'GET',
    redirect: 'manual',
    signal,
    headers: {
      Accept: check.accept,
      'Cache-Control': 'no-cache',
      ...(check.kind === 'notionPolicy' ? {
        'Content-Type': 'application/json',
        'User-Agent': 'seniorclub-android-release-check/1.0',
      } : {}),
    },
    ...(check.kind === 'notionPolicy' ? { body: JSON.stringify({
      pageId: check.pageId, limit: 100, cursor: { stack: [] }, chunkNumber: 0, verticalColumns: false,
    }) } : {}),
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
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_ENDPOINT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch 구현이 필요합니다.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('timeoutMs는 0보다 큰 유한한 숫자여야 합니다.');
  }

  const checks = buildReleaseEndpointChecks();
  return Promise.all(checks.map((check) => validateEndpoint(check, fetchImpl, timeoutMs)));
}

export async function main() {
  try {
    const results = await validateReleaseEndpoints();
    for (const result of results) console.log(`PASS ${result.label}: ${result.url}`);
    console.log('PASS 공개 정책 페이지와 비로그인 본문, 광고 판매자 파일 응답 확인.');
    console.log('NOTE Notion 사이트의 브라우저 렌더링은 별도 확인이 필요합니다.');
  } catch (error) {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) await main();
