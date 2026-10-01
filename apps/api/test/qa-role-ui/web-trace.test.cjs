const { strict: assert } = require('node:assert');
const { once } = require('node:events');
const { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } = require('node:fs');
const { createServer } = require('node:http');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');

test('real loopback requests retain ordering and cookie presence without persisting network strings', async () => {
  const root = mkdtempSync(join(tmpdir(), 'senior-role-trace-'));
  chmodSync(root, 0o700);
  const originalFetch = globalThis.fetch;
  const tracing = require('./web-trace.cjs');
  const sentinel = 'PRIVATE_NETWORK_SENTINEL';
  const server = createServer(tracing.traceHandler((request, response) => {
    if (request.url.includes('status=299')) response.statusCode = 299;
    response.setHeader('set-cookie', `__Host-senior_club_access=${sentinel}; Secure; HttpOnly`);
    response.setHeader('location', `/me/${sentinel}?token=${sentinel}`);
    response.end(sentinel);
  }));
  try {
    tracing.installTracing(root);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const cookie of [
      `__Host-senior_club_access=${sentinel}; __Host-senior_club_session=${sentinel}`,
      `__Host-senior_club_session=${sentinel}; __Host-senior_club_access=${sentinel}`,
    ]) {
      const response = await fetch(`${base}/me?token=${sentinel}`, { headers: { cookie } });
      assert.equal(await response.text(), sentinel);
    }
    const refresh = await fetch(`${base}/v1/auth/refresh?token=${sentinel}`, { method: 'POST' });
    assert.equal(await refresh.text(), sentinel);
    const nonstandard = await fetch(`${base}/v1/auth/refresh?status=299`);
    assert.equal(nonstandard.status, 299);
    assert.equal(await nonstandard.text(), sentinel);
    const untracked = await fetch(`${base}/me/${sentinel}`);
    assert.equal(await untracked.text(), sentinel);
    await assert.rejects(fetch(`https://${sentinel}.invalid/v1/auth/refresh`), /Non-loopback fetch forbidden/);

    const tracePath = join(root, 'web-auth-trace.jsonl');
    const raw = readFileSync(tracePath, 'utf8');
    assert.equal(raw.includes(sentinel), false);
    assert.equal(statSync(tracePath).mode & 0o777, 0o600);
    const events = raw.trim().split('\n').map((line) => JSON.parse(line));
    const requests = events.filter((event) => event.event === 'web-request');
    assert.deepEqual(requests.map(({ path, method }) => ({ path, method })), [
      { path: '/me', method: 'GET' }, { path: '/me', method: 'GET' },
      { path: '/v1/auth/refresh', method: 'POST' },
      { path: '/v1/auth/refresh', method: 'GET' },
    ]);
    assert.equal(requests.slice(0, 2).every((event) => event.cookiePresence.access && event.cookiePresence.refresh), true);
    const responses = events.filter((event) => event.event === 'web-response');
    assert.equal(responses.length, 4);
    assert.equal(responses.every((event) => event.locationPath === null && event.setCookiePresence.access), true);
    assert.equal(events.some((event) => event.event === 'nest-refresh-fetch-response' && event.status === 200), true);
    assert.equal(events.some((event) => event.event === 'nest-refresh-fetch-response' && event.status === null), true);
    assert.equal(readFileSync(join(root, 'external-network-attempts.log'), 'utf8'), 'NON_LOOPBACK_FETCH_BLOCKED\n');
  } finally {
    globalThis.fetch = originalFetch;
    if (server.listening) {
      server.close();
      await once(server, 'close');
    }
    rmSync(root, { recursive: true, force: true });
  }
});
