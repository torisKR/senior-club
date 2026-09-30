// Observes local QA HTTP ordering without recording cookie/header/token values.
const { AsyncLocalStorage } = require('node:async_hooks');
const { appendFileSync } = require('node:fs');
const { join } = require('node:path');
const requestScope = new AsyncLocalStorage();
let root;
let requestSequence = 0;
let fetchSequence = 0;
const timestamp = () => new Date().toISOString();
const write = (event) => appendFileSync(join(root, 'web-auth-trace.jsonl'), JSON.stringify(event) + '\n', { mode: 0o600 });
const cookiePresence = (header = '') => ({
  access: /(?:^|;\s*)__Host-senior_club_access=/.test(header),
  refresh: /(?:^|;\s*)__Host-senior_club_session=/.test(header),
});
const locationPath = (location) => {
  if (location === undefined || location === null) return null;
  try { return new URL(String(location), 'https://localhost:43132').pathname; }
  catch { return null; }
};
exports.installTracing = (tempRoot) => {
  root = tempRoot;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function(input, options) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      appendFileSync(join(root, 'external-network-attempts.log'), url.hostname + '\n', { mode: 0o600 });
      throw new Error('Non-loopback fetch forbidden in QA');
    }
    if (url.pathname !== '/v1/auth/refresh') return originalFetch(input, options);
    const id = ++fetchSequence;
    const parent = requestScope.getStore() ?? null;
    write({ event: 'nest-refresh-fetch-start', at: timestamp(), id, parent, origin: url.origin, path: url.pathname });
    try {
      const response = await originalFetch(input, options);
      write({ event: 'nest-refresh-fetch-response', at: timestamp(), id, parent, status: response.status });
      return response;
    } catch (error) {
      write({ event: 'nest-refresh-fetch-error', at: timestamp(), id, parent });
      throw error;
    }
  };
};
exports.traceHandler = (handler) => (request, response) => {
  const url = new URL(request.url, 'https://localhost:43132');
  const id = ++requestSequence;
  const parent = { id, path: url.pathname };
  const tracked = url.pathname === '/clubs' || /^\/(?:api\/auth|me|leader|admin|onboarding)(?:\/|$)/.test(url.pathname);
  if (tracked) {
    const headers = request.headers;
    const headerPresence = Object.fromEntries(['rsc', 'next-router-prefetch', 'next-router-segment-prefetch', 'next-router-state-tree', 'purpose', 'sec-purpose'].map((name) => [name, Object.hasOwn(headers, name)]));
    write({ event: 'web-request', at: timestamp(), ...parent, method: request.method, cookiePresence: cookiePresence(headers.cookie), headerPresence });
    response.once('finish', () => {
      const setCookies = String(response.getHeader('set-cookie') ?? '');
      write({ event: 'web-response', at: timestamp(), ...parent, status: response.statusCode, locationPath: locationPath(response.getHeader('location')), setCookiePresence: { access: setCookies.includes('__Host-senior_club_access='), refresh: setCookies.includes('__Host-senior_club_session=') } });
    });
  }
  return requestScope.run(parent, () => handler(request, response));
};
