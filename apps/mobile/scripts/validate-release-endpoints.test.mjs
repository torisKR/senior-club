import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReleaseEndpointChecks,
  ENDPOINT_BODY_LIMIT_BYTES,
  getResponseBodyViolation,
  getResponseMetadataViolation,
  validateReleaseEndpoints,
} from './validate-release-endpoints.mjs';

const VALID_ENVIRONMENT = {
  EXPO_PUBLIC_API_URL: 'https://api.senior-club.kr/v1',
  EXPO_PUBLIC_WEB_URL: 'https://senior-club.kr',
};

function response({
  url,
  status = 200,
  contentType,
  contentLength,
  body,
  redirected = false,
  type = 'basic',
  textImpl,
}) {
  return {
    url,
    status,
    redirected,
    type,
    headers: {
      get(name) {
        if (name.toLowerCase() === 'content-type') return contentType;
        if (name.toLowerCase() === 'content-length') return contentLength ?? null;
        return null;
      },
    },
    async text() {
      return textImpl ? textImpl() : body;
    },
  };
}

function successResponse(url) {
  if (url.endsWith('/readyz')) {
    return response({
      url,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ status: 'ready' }),
    });
  }
  return response({
    url,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><html lang="ko"><body>시니어클럽 정책</body></html>',
  });
}

test('pure endpoint builder requires public HTTPS URLs and fixes release paths', () => {
  const checks = buildReleaseEndpointChecks(VALID_ENVIRONMENT);

  assert.deepEqual(
    checks.map(({ kind, url }) => ({ kind, url })),
    [
      { kind: 'readiness', url: 'https://api.senior-club.kr/readyz' },
      { kind: 'policy', url: 'https://senior-club.kr/terms' },
      { kind: 'policy', url: 'https://senior-club.kr/privacy' },
      { kind: 'policy', url: 'https://senior-club.kr/account-deletion' },
    ],
  );

  assert.throws(
    () => buildReleaseEndpointChecks({ ...VALID_ENVIRONMENT, EXPO_PUBLIC_API_URL: '' }),
    /EXPO_PUBLIC_API_URL.*필요/,
  );
  assert.throws(
    () => buildReleaseEndpointChecks({ EXPO_PUBLIC_API_URL: VALID_ENVIRONMENT.EXPO_PUBLIC_API_URL }),
    /EXPO_PUBLIC_WEB_URL.*필요/,
  );
  assert.throws(
    () =>
      buildReleaseEndpointChecks({
        ...VALID_ENVIRONMENT,
        EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3000',
      }),
    /공개 HTTPS URL/,
  );
  assert.throws(
    () =>
      buildReleaseEndpointChecks({
        ...VALID_ENVIRONMENT,
        EXPO_PUBLIC_WEB_URL: 'https://example.com',
      }),
    /문서 예시용/,
  );
  assert.throws(
    () =>
      buildReleaseEndpointChecks({
        ...VALID_ENVIRONMENT,
        EXPO_PUBLIC_WEB_URL: 'https://senior-club.kr/app',
      }),
    /origin만 입력/,
  );

  for (const invalidApiUrl of [
    'not-a-url',
    'https://user:secret@api.senior-club.kr',
    'https://api.senior-club.kr?stage=prod',
    'https://api.senior-club.kr#readyz',
  ]) {
    assert.throws(
      () =>
        buildReleaseEndpointChecks({
          ...VALID_ENVIRONMENT,
          EXPO_PUBLIC_API_URL: invalidApiUrl,
        }),
      /EXPO_PUBLIC_API_URL/,
    );
  }
});

test('live validator requests all endpoints without following redirects', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return successResponse(url);
  };

  const results = await validateReleaseEndpoints({
    environment: VALID_ENVIRONMENT,
    fetchImpl,
    timeoutMs: 100,
  });

  assert.equal(results.length, 4);
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.redirect, 'manual');
    assert.ok(call.options.signal instanceof AbortSignal);
  }
  assert.deepEqual(
    calls.slice(1).map(({ url }) => new URL(url).origin),
    Array(3).fill('https://senior-club.kr'),
  );
});

test('response metadata rejects redirects, non-200 status, and final URL changes', () => {
  const check = buildReleaseEndpointChecks(VALID_ENVIRONMENT)[1];

  assert.match(
    getResponseMetadataViolation(check, response({
      url: check.url,
      status: 302,
      contentType: 'text/html',
      body: '',
    })),
    /HTTP 302/,
  );
  assert.match(
    getResponseMetadataViolation(check, response({
      url: 'https://senior-club.kr/privacy',
      contentType: 'text/html',
      body: '',
      redirected: true,
    })),
    /redirect/,
  );
  assert.match(
    getResponseMetadataViolation(check, response({
      url: 'https://policy.senior-club.kr/terms',
      contentType: 'text/html',
      body: '',
    })),
    /최종 URL/,
  );
});

test('readiness endpoint requires JSON with status ready', () => {
  const check = buildReleaseEndpointChecks(VALID_ENVIRONMENT)[0];

  assert.match(getResponseBodyViolation(check, 'text/html', '{}'), /JSON이 아닙니다/);
  assert.match(getResponseBodyViolation(check, 'application/json', '{'), /유효한 JSON/);
  assert.match(
    getResponseBodyViolation(check, 'application/json', '{"status":"not_ready"}'),
    /"ready"/,
  );
  assert.equal(
    getResponseBodyViolation(check, 'application/health+json', '{"status":"ready"}'),
    null,
  );
});

test('policy endpoints require non-empty HTML without release blocker wording', () => {
  const check = buildReleaseEndpointChecks(VALID_ENVIRONMENT)[1];

  assert.match(getResponseBodyViolation(check, 'application/json', '{}'), /HTML이 아닙니다/);
  assert.match(getResponseBodyViolation(check, 'text/html', '   '), /비어 있습니다/);
  for (const blocker of ['MVP 운영 초안', '임시 문의처', '법인 정보 미확정']) {
    assert.match(
      getResponseBodyViolation(check, 'text/html', `<html>${blocker}</html>`),
      /출시 차단 문구/,
    );
  }
  assert.match(
    getResponseBodyViolation(check, 'text/html', '<html>출시\n 전 확인 안내</html>'),
    /출시 차단 문구/,
  );
  assert.equal(
    getResponseBodyViolation(check, 'text/html; charset=utf-8', '<html>확정 정책</html>'),
    null,
  );
});

test('live validator fails closed on redirect responses and invalid content', async () => {
  await assert.rejects(
    validateReleaseEndpoints({
      environment: VALID_ENVIRONMENT,
      timeoutMs: 100,
      fetchImpl: async (url) =>
        url.endsWith('/terms')
          ? response({
              url,
              status: 301,
              contentType: 'text/html',
              body: '',
            })
          : successResponse(url),
    }),
    /공개 정책 \/terms 검증 실패: HTTP 301/,
  );

  await assert.rejects(
    validateReleaseEndpoints({
      environment: VALID_ENVIRONMENT,
      timeoutMs: 100,
      fetchImpl: async (url) =>
        url.endsWith('/privacy')
          ? response({
              url,
              contentType: 'text/html',
              body: '<html>MVP 운영 초안</html>',
            })
          : successResponse(url),
    }),
    /출시 차단 문구 "초안"/,
  );
});

test('live validator rejects followed redirects and silent final URL changes', async () => {
  await assert.rejects(
    validateReleaseEndpoints({
      environment: VALID_ENVIRONMENT,
      timeoutMs: 100,
      fetchImpl: async (url) =>
        url.endsWith('/terms')
          ? response({
              url: 'https://senior-club.kr/privacy',
              contentType: 'text/html',
              body: '<html>정책</html>',
              redirected: true,
            })
          : successResponse(url),
    }),
    /redirect 응답은 허용되지 않습니다/,
  );

  await assert.rejects(
    validateReleaseEndpoints({
      environment: VALID_ENVIRONMENT,
      timeoutMs: 100,
      fetchImpl: async (url) =>
        url.endsWith('/terms')
          ? response({
              url: 'https://policy.senior-club.kr/terms',
              contentType: 'text/html',
              body: '<html>정책</html>',
            })
          : successResponse(url),
    }),
    /최종 URL이 요청 URL과 다릅니다/,
  );
});

test('live validator times out even when fetch does not settle', async () => {
  const signals = [];
  const startedAt = Date.now();

  await assert.rejects(
    validateReleaseEndpoints({
      environment: VALID_ENVIRONMENT,
      timeoutMs: 10,
      fetchImpl: async (_url, options) => {
        signals.push(options.signal);
        return new Promise(() => {});
      },
    }),
    /10ms timeout/,
  );

  assert.ok(Date.now() - startedAt < 500);
  assert.equal(signals.length, 4);
  assert.ok(signals.some((signal) => signal.aborted));
});

test('live validator timeout covers stalled response body reads', async () => {
  let readinessSignal;

  await assert.rejects(
    validateReleaseEndpoints({
      environment: VALID_ENVIRONMENT,
      timeoutMs: 10,
      fetchImpl: async (url, options) => {
        if (!url.endsWith('/readyz')) return successResponse(url);
        readinessSignal = options.signal;
        return response({
          url,
          contentType: 'application/json',
          textImpl: () => new Promise(() => {}),
        });
      },
    }),
    /API readiness 요청 실패: 10ms timeout/,
  );

  assert.equal(readinessSignal?.aborted, true);
});

test('live validator rejects declared and actual oversized bodies', async () => {
  await assert.rejects(
    validateReleaseEndpoints({
      environment: VALID_ENVIRONMENT,
      timeoutMs: 100,
      fetchImpl: async (url) =>
        url.endsWith('/terms')
          ? response({
              url,
              contentType: 'text/html',
              contentLength: String(ENDPOINT_BODY_LIMIT_BYTES.policy + 1),
              textImpl: () => {
                throw new Error('oversized declared bodies must not be read');
              },
            })
          : successResponse(url),
    }),
    /Content-Length.*2097152 byte 제한/,
  );

  const oversizedReadiness = JSON.stringify({
    status: 'ready',
    padding: 'x'.repeat(ENDPOINT_BODY_LIMIT_BYTES.readiness),
  });
  await assert.rejects(
    validateReleaseEndpoints({
      environment: VALID_ENVIRONMENT,
      timeoutMs: 100,
      fetchImpl: async (url) =>
        url.endsWith('/readyz')
          ? response({
              url,
              contentType: 'application/json',
              body: oversizedReadiness,
            })
          : successResponse(url),
    }),
    /실제 본문.*65536 byte 제한/,
  );
});
