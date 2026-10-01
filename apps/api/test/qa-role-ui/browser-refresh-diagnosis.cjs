module.exports = async (page) => {
  const config = __ROLE_UI_CONFIG__;
  const checks = [];
  const failures = [];
  const findings = [];
  const sessionResponses = [];
  const responseTasks = [];
  const externalRequests = [];
  const pageErrors = [];
  const browserTrace = [];
  const traceTasks = [];
  const requestIds = new WeakMap();
  let requestSequence = 0;
  let traceEnabled = false;
  const startedAt = new Date().toISOString();
  const assert = (c, message) => { if (!c) throw new Error(message); };
  await page.context().route('**/*', async (route) => {
    if (!['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)) {
      externalRequests.push(new URL(route.request().url()).hostname);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  page.on('pageerror', (error) => pageErrors.push(error.message.slice(0, 160)));
  page.on('request', (request) => {
    if (!traceEnabled || !/^\/(?:api\/auth|clubs|me|leader|admin|onboarding)(?:\/|$)/.test(new URL(request.url()).pathname)) return;
    const id = ++requestSequence;
    requestIds.set(request, id);
    const at = new Date().toISOString();
    traceTasks.push((async () => {
      const headers = await request.allHeaders();
      browserTrace.push({ event: 'browser-request', id, at, path: new URL(request.url()).pathname, cookiePresence: { access: /(?:^|;\s*)__Host-senior_club_access=/.test(headers.cookie ?? ''), refresh: /(?:^|;\s*)__Host-senior_club_session=/.test(headers.cookie ?? '') }, headerPresence: Object.fromEntries(['rsc', 'next-router-prefetch', 'next-router-segment-prefetch', 'next-router-state-tree', 'purpose', 'sec-purpose'].map((name) => [name, Object.hasOwn(headers, name)])) });
    })());
  });
  page.on('response', (response) => {
    const requestId = requestIds.get(response.request());
    if (requestId) browserTrace.push({ event: 'browser-response', id: requestId, at: new Date().toISOString(), path: new URL(response.url()).pathname, status: response.status() });
    if (!traceEnabled || new URL(response.url()).pathname !== '/api/auth/session') return;
    const task = (async () => {
      const body = await response.json().catch(() => null);
      sessionResponses.push({ at: new Date().toISOString(), requestId, status: response.status(), authenticated: body?.authenticated === true, memberIdMatched: body?.user?.id === config.roleIds.member, errorCode: body?.error?.code ?? null });
    })();
    responseTasks.push(task);
  });
  const state = async () => {
    const response = await page.context().request.get(`${config.api}/__qa/state`, { headers: { 'x-qa-control': config.control } });
    assert(response.status() === 200, 'Owned DB state read failed');
    return response.json();
  };
  let before;
  let after;
  let cookiesAfter;
  let destination;
  let origin;
  try {
    await page.goto(`${config.base}/login`, { waitUntil: 'networkidle' });
    const login = await page.evaluate(async () => {
      const r = await fetch('/api/auth/kakao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: 'role-ui-member-token', termsAccepted: true, privacyAccepted: true }) });
      const body = await r.json();
      return { status: r.status, role: body.user?.role };
    });
    assert(login.status === 201 && login.role === 'MEMBER', 'Real BFF member login failed');
    await page.goto(`${config.base}/me`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '마이페이지', exact: true }).waitFor();
    before = await state();
    assert(before.sessions.filter((s) => s.userId === config.roleIds.member).some((s) => s.revokedAt === null), 'No live initial backend session');
    checks.push({ name: 'initial-real-member-session-and-ui', passed: true });
    origin = await page.evaluate(async () => (await fetch('/api/qa-role-origin', { method: 'POST' })).json());
    assert(origin.browserOrigin === config.base && origin.requestOrigin === config.base && origin.forwardedProtocol === 'https', 'Actual browser and BFF origins differ');

    // A returning tab with empty optional profile caches and an expired access
    // cookie retains its valid refresh cookie. The actual mounted app components
    // make session requests; the fixture does not manufacture their responses.
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.context().clearCookies({ name: '__Host-senior_club_access' });
    browserTrace.push({ event: 'access-cookie-removed-cache-empty', at: new Date().toISOString() });
    assert((await page.context().cookies()).some((c) => c.name === '__Host-senior_club_session'), 'Valid refresh cookie was not preserved');
    traceEnabled = true;
    await page.goto(`${config.base}/clubs`, { waitUntil: 'networkidle' });
    await Promise.all(responseTasks);
    after = await state();
    cookiesAfter = (await page.context().cookies()).filter((c) => c.name.startsWith('__Host-senior_club_')).map(({ name, secure, httpOnly }) => ({ name, secure, httpOnly }));
    await page.goto(`${config.base}/me`, { waitUntil: 'networkidle' });
    destination = new URL(page.url()).pathname;
    await Promise.all(responseTasks);
    const backendSessionRemainsLive = after.sessions.filter((s) => s.userId === config.roleIds.member).some((s) => s.revokedAt === null);
    const failedInvariants = [];
    if (sessionResponses.length === 0 || sessionResponses.some((r) => r.status !== 200 || !r.authenticated || !r.memberIdMatched)) failedInvariants.push('all-session-readers-authenticated-member');
    if (cookiesAfter.length !== 2) failedInvariants.push('both-auth-cookies-restored');
    if (destination !== '/me') failedInvariants.push('protected-member-ui-restored');
    if (!backendSessionRemainsLive) failedInvariants.push('backend-session-live');
    if (after.authRefreshStatuses.length !== 1 || after.authRefreshStatuses[0] !== 201) failedInvariants.push('single-successful-backend-refresh');
    if (failedInvariants.length > 0) {
      findings.push({ name: 'mounted-ui-refresh-invariant-failure', expected: 'valid refresh cookie restores all session readers and member UI with one successful rotation', failedInvariants, actual: { sessionResponses, backendRefreshStatuses: after.authRefreshStatuses, authCookiesAfter: cookiesAfter, protectedDestination: destination, backendSessionRemainsLive }, sourcePaths: ['src/components/site-shell.tsx', 'src/proxy.ts', 'src/lib/auth/browser-session.ts', 'src/components/auth-nav.tsx', 'src/components/profile-session-sync.tsx', 'src/app/api/auth/continue/route.ts', 'src/app/api/auth/session/route.ts', 'src/lib/auth/bff.ts', 'apps/api/src/auth/auth.service.ts'] });
      throw new Error('Actual mounted UI refresh invariants failed: ' + failedInvariants.join(', '));
    }
    checks.push({ name: 'real-ui-concurrent-refresh-preserves-cookie-and-member', passed: true, actualSessionRequestCount: sessionResponses.length, allActualBffResponsesAuthenticated: true, backendRefreshCount: after.authRefreshStatuses.length, backendRefreshStatuses: after.authRefreshStatuses, authCookieCount: cookiesAfter.length, destination });
  } catch (error) {
    failures.push({ message: error.message, currentPath: new URL(page.url()).pathname });
  }
  await Promise.all(traceTasks);
  return { startedAt, finishedAt: new Date().toISOString(), phase: 'refresh-diagnosis', scope: 'isolated-local-production-Next-Nest-Prisma-real-UI', origin, checks, failures, findings, sessionResponses, browserTrace, backendRefreshTrace: after?.authRefreshTrace, backendRefreshStatuses: after?.authRefreshStatuses, cookiesAfter, destination, pageErrors, externalRequests, passed: failures.length === 0 && externalRequests.length === 0 && pageErrors.length === 0 };
}
