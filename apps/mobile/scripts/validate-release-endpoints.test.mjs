import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReleaseEndpointChecks,
  ENDPOINT_BODY_LIMIT_BYTES,
  getResponseBodyViolation,
  getResponseMetadataViolation,
  NOTION_PUBLIC_PAGE_ENDPOINT,
  validateReleaseEndpoints,
} from './validate-release-endpoints.mjs';
import policyConfig from '../src/config/public-policy-url.js';

function response({ url, status = 200, contentType, contentLength, body = '', redirected = false, type = 'basic', textImpl }) {
  return {
    url, status, redirected, type,
    headers: { get(name) {
      if (name.toLowerCase() === 'content-type') return contentType;
      if (name.toLowerCase() === 'content-length') return contentLength ?? null;
      return null;
    } },
    async text() { return textImpl ? textImpl() : body; },
  };
}

function successResponse(url) {
  if (url === NOTION_PUBLIC_PAGE_ENDPOINT) {
    const pageId = buildReleaseEndpointChecks()[1].pageId;
    return response({ url, contentType: 'application/json', body: JSON.stringify({ recordMap: { block: {
      [pageId]: { value: { role: 'reader', value: { id: pageId, content: ['body'], properties: { title: [['시니어클럽 개인정보처리방침']] } } } },
      body: { value: { value: { properties: { title: [['광고와 RevenueCat 구매 안내']] } } } },
    } } }) });
  }
  return url === policyConfig.APP_ADS_URL
    ? response({ url, contentType: 'text/plain; charset=utf-8', body: `google.com, ${policyConfig.ADMOB_PUBLISHER_ID}, DIRECT, f08c47fec0942fa0\n` })
    : response({ url, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><body>시니어클럽 개인정보처리방침</body></html>' });
}

test('game release checks the exact public policy and app-ads file without a community server', () => {
  const checks = buildReleaseEndpointChecks();
  assert.deepEqual(checks.map(({ kind, url }) => ({ kind, url })), [
    { kind: 'policy', url: policyConfig.PRIVACY_POLICY_URL },
    { kind: 'notionPolicy', url: NOTION_PUBLIC_PAGE_ENDPOINT },
    { kind: 'appAds', url: policyConfig.APP_ADS_URL },
  ]);
  for (const check of checks) assert.equal(new URL(check.url).protocol, 'https:');
});

test('live validator reads both destinations and the anonymous policy body without redirects', async () => {
  const calls = [];
  const results = await validateReleaseEndpoints({
    fetchImpl: async (url, options) => { calls.push({ url, options }); return successResponse(url); },
    timeoutMs: 100,
  });
  assert.equal(results.length, 3);
  for (const call of calls) {
    assert.equal(call.options.method, call.url === NOTION_PUBLIC_PAGE_ENDPOINT ? 'POST' : 'GET');
    assert.equal(call.options.redirect, 'manual');
    assert.ok(call.options.signal instanceof AbortSignal);
  }
  const anonymousCall = calls.find(({ url }) => url === NOTION_PUBLIC_PAGE_ENDPOINT);
  assert.equal(JSON.parse(anonymousCall.options.body).pageId, buildReleaseEndpointChecks()[1].pageId);
  assert.equal(anonymousCall.options.headers.Authorization, undefined);
});

test('metadata rejects redirects, failures, and changed destinations', () => {
  const [check] = buildReleaseEndpointChecks();
  assert.match(getResponseMetadataViolation(check, response({ url: check.url, status: 302 })), /HTTP 302/);
  assert.match(getResponseMetadataViolation(check, response({ url: check.url, redirected: true })), /redirect/);
  assert.match(getResponseMetadataViolation(check, response({ url: 'https://toris.kr/', redirected: false })), /최종 URL/);
});

test('policy requires a nonempty HTML document without draft wording', () => {
  const [check] = buildReleaseEndpointChecks();
  assert.match(getResponseBodyViolation(check, 'application/json', '{}'), /HTML이 아닙니다/);
  assert.match(getResponseBodyViolation(check, 'text/html', ' '), /비어 있습니다/);
  assert.match(getResponseBodyViolation(check, 'text/html', '<html>운영 초안</html>'), /출시 차단 문구/);
  assert.equal(getResponseBodyViolation(check, 'text/html; charset=utf-8', '<html>정책</html>'), null);
});

test('app-ads requires the correct Google seller, DIRECT relationship and certificate', () => {
  const [, , check] = buildReleaseEndpointChecks();
  assert.equal(getResponseBodyViolation(check, 'text/plain', `# seller\ngoogle.com, ${policyConfig.ADMOB_PUBLISHER_ID}, DIRECT, f08c47fec0942fa0 # comment`), null);
  for (const body of [
    `google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0`,
    `google.com, ${policyConfig.ADMOB_PUBLISHER_ID}, RESELLER, f08c47fec0942fa0`,
    `google.com, ${policyConfig.ADMOB_PUBLISHER_ID}, DIRECT, wrong`,
  ]) assert.match(getResponseBodyViolation(check, 'text/plain', body), /판매자 항목/);
  assert.match(getResponseBodyViolation(check, 'text/html', '<html></html>'), /텍스트가 아닙니다/);
});

test('anonymous Notion content must be readable, belong to the policy, and include purchase and ad terms', () => {
  const [, check] = buildReleaseEndpointChecks();
  const valid = successResponse(NOTION_PUBLIC_PAGE_ENDPOINT);
  return valid.text().then((body) => {
    assert.equal(getResponseBodyViolation(check, 'application/json', body), null);
    for (const changed of [
      body.replace('"reader"', '"none"'),
      body.replace('RevenueCat', 'missing'),
      body.replace('시니어클럽', '다른 앱'),
      body.replace('광고와', '출시 전 광고와'),
    ]) assert.notEqual(getResponseBodyViolation(check, 'application/json', changed), null);
    assert.match(getResponseBodyViolation(check, 'text/html', '<html></html>'), /JSON/);
  });
});

test('validator fails closed for an unavailable policy or invalid ads file', async () => {
  await assert.rejects(validateReleaseEndpoints({
    fetchImpl: async (url) => url === policyConfig.PRIVACY_POLICY_URL
      ? response({ url, status: 403 }) : successResponse(url), timeoutMs: 100,
  }), /공개 개인정보처리방침 검증 실패: HTTP 403/);
  await assert.rejects(validateReleaseEndpoints({
    fetchImpl: async (url) => url === policyConfig.APP_ADS_URL
      ? response({ url, contentType: 'text/plain', body: 'wrong' }) : successResponse(url), timeoutMs: 100,
  }), /판매자 항목/);
});

test('timeout covers stalled fetch and response body reads', async () => {
  const signals = [];
  await assert.rejects(validateReleaseEndpoints({
    timeoutMs: 10,
    fetchImpl: async (_url, options) => { signals.push(options.signal); return new Promise(() => {}); },
  }), /10ms timeout/);
  assert.equal(signals.length, 3);
  assert.ok(signals.some((signal) => signal.aborted));

  let policySignal;
  await assert.rejects(validateReleaseEndpoints({
    timeoutMs: 10,
    fetchImpl: async (url, options) => {
      if (url !== policyConfig.PRIVACY_POLICY_URL) return successResponse(url);
      policySignal = options.signal;
      return response({ url, contentType: 'text/html', textImpl: () => new Promise(() => {}) });
    },
  }), /공개 개인정보처리방침 요청 실패: 10ms timeout/);
  assert.equal(policySignal?.aborted, true);
});

test('oversized declared and actual responses are rejected', async () => {
  await assert.rejects(validateReleaseEndpoints({
    timeoutMs: 100,
    fetchImpl: async (url) => url === policyConfig.PRIVACY_POLICY_URL
      ? response({ url, contentType: 'text/html', contentLength: String(ENDPOINT_BODY_LIMIT_BYTES.policy + 1), textImpl: () => { throw new Error('should not read'); } })
      : successResponse(url),
  }), /Content-Length.*2097152 byte 제한/);
  await assert.rejects(validateReleaseEndpoints({
    timeoutMs: 100,
    fetchImpl: async (url) => url === policyConfig.APP_ADS_URL
      ? response({ url, contentType: 'text/plain', body: 'x'.repeat(ENDPOINT_BODY_LIMIT_BYTES.appAds + 1) })
      : successResponse(url),
  }), /실제 본문.*65536 byte 제한/);
});
