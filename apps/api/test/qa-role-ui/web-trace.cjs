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
const tracePath = (pathname) => {
  // Only fixed route labels enter the log, never arbitrary request/redirect text.
  switch (pathname) {
    case '/clubs': return '/clubs';
    case '/me': return '/me';
    case '/leader': return '/leader';
    case '/admin': return '/admin';
    case '/login': return '/login';
    case '/onboarding': return '/onboarding';
    case '/auth/continue': return '/auth/continue';
    case '/api/auth/kakao': return '/api/auth/kakao';
    case '/api/auth/logout': return '/api/auth/logout';
    case '/api/auth/session': return '/api/auth/session';
    case '/api/auth/continue': return '/api/auth/continue';
    case '/v1/auth/refresh': return '/v1/auth/refresh';
    default: return null;
  }
};
const traceOrigin = (origin) => {
  switch (origin) {
    case 'https://localhost:43131': return 'https://localhost:43131';
    case 'https://localhost:43132': return 'https://localhost:43132';
    default: return 'other-loopback-origin';
  }
};
const traceMethod = (method) => method === 'GET' ? 'GET' : method === 'POST' ? 'POST' : 'OTHER';
const traceStatus = (status) => {
  switch (status) {
    case 200: return 200;
    case 201: return 201;
    case 204: return 204;
    case 301: return 301;
    case 302: return 302;
    case 303: return 303;
    case 304: return 304;
    case 307: return 307;
    case 308: return 308;
    case 400: return 400;
    case 401: return 401;
    case 403: return 403;
    case 404: return 404;
    case 405: return 405;
    case 409: return 409;
    case 410: return 410;
    case 422: return 422;
    case 429: return 429;
    case 500: return 500;
    case 502: return 502;
    case 503: return 503;
    case 504: return 504;
    default: return null;
  }
};
const locationPath = (location) => {
  if (location === undefined || location === null) return null;
  try { return tracePath(new URL(String(location), 'https://localhost:43132').pathname); }
  catch { return null; }
};
exports.installTracing = (tempRoot) => {
  root = tempRoot;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function(input, options) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      appendFileSync(join(root, 'external-network-attempts.log'), 'NON_LOOPBACK_FETCH_BLOCKED\n', { mode: 0o600 });
      throw new Error('Non-loopback fetch forbidden in QA');
    }
    if (url.pathname !== '/v1/auth/refresh') return originalFetch(input, options);
    const id = ++fetchSequence;
    const parent = requestScope.getStore() ?? null;
    write({ event: 'nest-refresh-fetch-start', at: timestamp(), id, parent, origin: traceOrigin(url.origin), path: '/v1/auth/refresh' });
    try {
      const response = await originalFetch(input, options);
      write({ event: 'nest-refresh-fetch-response', at: timestamp(), id, parent, status: traceStatus(response.status) });
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
  const path = tracePath(url.pathname);
  const parent = { id, path };
  const tracked = path !== null;
  if (tracked) {
    const headers = request.headers;
    const headerPresence = Object.fromEntries(['rsc', 'next-router-prefetch', 'next-router-segment-prefetch', 'next-router-state-tree', 'purpose', 'sec-purpose'].map((name) => [name, Object.hasOwn(headers, name)]));
    write({ event: 'web-request', at: timestamp(), ...parent, method: traceMethod(request.method), cookiePresence: cookiePresence(headers.cookie), headerPresence });
    response.once('finish', () => {
      const setCookies = String(response.getHeader('set-cookie') ?? '');
      write({ event: 'web-response', at: timestamp(), ...parent, status: traceStatus(response.statusCode), locationPath: locationPath(response.getHeader('location')), setCookiePresence: { access: setCookies.includes('__Host-senior_club_access='), refresh: setCookies.includes('__Host-senior_club_session=') } });
    });
  }
  return requestScope.run(parent, () => handler(request, response));
};
