async (page) => {
  const config = __ROLE_UI_CONFIG__;
  const context = page.context();
  const checks = [];
  const failures = [];
  const pageErrors = [];
  const externalRequests = [];
  const sessionResponses = [];
  const requestTrace = [];
  const tasks = [];
  const requestPhases = new WeakMap();
  const startedAt = new Date().toISOString();
  let phase = 'setup';
  let second;
  let finalState;
  let restoredCookieAttributes;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const path = (url) => new URL(url).pathname;
  const state = async () => {
    const response = await context.request.get(`${config.api}/__qa/state`, { headers: { 'x-qa-control': config.control } });
    assert(response.status() === 200, 'Owned DB state read failed');
    return response.json();
  };
  await context.route('**/*', async (route) => {
    if (!['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)) {
      externalRequests.push(new URL(route.request().url()).hostname);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  const observe = (tab, tabNumber) => {
    tab.setDefaultTimeout(15_000);
    tab.on('pageerror', (error) => pageErrors.push({ tab: tabNumber, message: error.message.slice(0, 160) }));
    tab.on('request', (request) => {
      if (phase === 'setup' || !['/api/auth/session', '/api/auth/logout', '/me', '/auth/continue', '/clubs', '/login'].includes(path(request.url()))) return;
      const capturedPhase = phase;
      requestPhases.set(request, capturedPhase);
      const at = new Date().toISOString();
      tasks.push((async () => {
        const headers = await request.allHeaders();
        requestTrace.push({ tab: tabNumber, phase: capturedPhase, at, path: path(request.url()), cookiePresence: { access: /(?:^|;\s*)__Host-senior_club_access=/.test(headers.cookie ?? ''), refresh: /(?:^|;\s*)__Host-senior_club_session=/.test(headers.cookie ?? '') }, headerPresence: Object.fromEntries(['rsc', 'next-router-prefetch', 'next-router-segment-prefetch'].map((key) => [key, Object.hasOwn(headers, key)])) });
      })());
    });
    tab.on('response', (response) => {
      const capturedPhase = requestPhases.get(response.request());
      if (!capturedPhase || path(response.url()) !== '/api/auth/session') return;
      tasks.push((async () => {
        const body = await response.json().catch(() => null);
        sessionResponses.push({ tab: tabNumber, phase: capturedPhase, at: new Date().toISOString(), status: response.status(), authenticated: body?.authenticated === true, userIdValid: typeof body?.user?.id === 'string' && body.user.id.length > 0, memberIdMatched: body?.user?.id === config.roleIds.member, errorCode: body?.error?.code ?? null });
      })());
    });
  };
  observe(page, 1);
  try {
    await page.goto(`${config.base}/login`, { waitUntil: 'networkidle' });
    const login = await page.evaluate(async () => {
      const response = await fetch('/api/auth/kakao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: 'role-ui-member-token', termsAccepted: true, privacyAccepted: true }) });
      const body = await response.json();
      return { status: response.status, role: body.user?.role };
    });
    assert(login.status === 201 && login.role === 'MEMBER', 'Real member BFF login failed');
    await page.goto(`${config.base}/me`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '마이페이지', exact: true }).waitFor();
    second = await context.newPage();
    observe(second, 2);
    assert(second.context() === context, 'Two tabs do not share one browser context');

    // The non-business origin diagnostic GET is an empty HTML preparation
    // document. Both tabs clear optional storage without a mounted
    // reader restoring cookies before the simultaneous real /clubs visits.
    await Promise.all([page, second].map((tab) => tab.goto(`${config.base}/api/qa-role-origin`, { waitUntil: 'networkidle' })));
    const environments = await Promise.all([page, second].map((tab) => tab.evaluate(() => ({ origin: location.origin, secure: isSecureContext, webLocks: typeof navigator.locks?.request === 'function' }))));
    assert(environments.every((e) => e.origin === config.base && e.secure && e.webLocks), 'Same-origin secure contexts with actual Web Locks are required');
    checks.push({ name: 'two-tabs-one-secure-context-with-Web-Locks', passed: true, tabCount: 2, sameContext: true, environments });
    await Promise.all([page, second].map((tab) => tab.evaluate(() => { localStorage.clear(); sessionStorage.clear(); })));
    await context.clearCookies({ name: '__Host-senior_club_access' });
    const initialCookies = await context.cookies();
    assert(!initialCookies.some((c) => c.name === '__Host-senior_club_access') && initialCookies.some((c) => c.name === '__Host-senior_club_session'), 'Refresh-only cookie precondition failed');
    const emptyCaches = await Promise.all([page, second].map((tab) => tab.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0)));
    assert(emptyCaches.every(Boolean), 'Optional caches are not empty before actual mounted restore');
    const before = await state();
    assert(before.sessions.some((s) => s.userId === config.roleIds.member && s.revokedAt === null), 'No live member session before two-tab restore');

    phase = 'restore';
    await Promise.all([page, second].map((tab) => tab.goto(`${config.base}/clubs`, { waitUntil: 'networkidle' })));
    await Promise.all(tasks);
    const restored = await state();
    const refreshStatuses = restored.authRefreshStatuses.slice(before.authRefreshStatuses.length);
    const reads = sessionResponses.filter((r) => r.phase === 'restore');
    assert([1, 2].every((n) => reads.some((r) => r.tab === n)), 'Each actual mounted tab must query the real BFF session');
    assert(reads.every((r) => r.status === 200 && r.authenticated && r.userIdValid && r.memberIdMatched), 'Actual two-tab BFF session responses did not all restore the member');
    assert(refreshStatuses.length === 1 && refreshStatuses[0] === 201, 'Two-tab restoration must perform one successful Nest rotation');
    const restoredCookies = (await context.cookies()).filter((c) => c.name.startsWith('__Host-senior_club_'));
    assert(restoredCookies.length === 2 && restoredCookies.every((c) => c.secure && c.httpOnly && c.sameSite === 'Lax' && c.path === '/'), 'Two-tab restore did not preserve secure host cookies');
    restoredCookieAttributes = restoredCookies.map(({ secure, httpOnly, sameSite, path }) => ({ secure, httpOnly, sameSite, path }));
    checks.push({ name: 'actual-two-tab-mounted-restore-with-one-Nest-refresh', passed: true, actualBffSessionResponses: reads.length, allAuthenticatedMember: true, backendRefreshStatuses: refreshStatuses, authCookieCount: restoredCookies.length, cachesInitiallyEmpty: true });

    await Promise.all([page, second].map(async (tab) => {
      await tab.goto(`${config.base}/me`, { waitUntil: 'networkidle' });
      await tab.getByRole('heading', { name: '마이페이지', exact: true }).waitFor();
      assert(path(tab.url()) === '/me', 'Restored tab did not render protected member UI');
    }));
    await Promise.all(tasks);
    assert(sessionResponses.filter((r) => r.phase === 'restore').every((r) => r.status === 200 && r.authenticated && r.memberIdMatched), 'A protected restored tab lost authentication');
    checks.push({ name: 'both-restored-tabs-render-real-protected-member-UI', passed: true, destinations: ['/me', '/me'] });

    phase = 'logout';
    const logoutResponse = page.waitForResponse((r) => path(r.url()) === '/api/auth/logout' && r.request().method() === 'POST');
    await page.getByRole('complementary', { name: '나의 활동 요약' }).getByRole('button', { name: '로그아웃', exact: true }).click();
    assert((await logoutResponse).status() === 200, 'Actual first-tab profile logout BFF failed');
    await page.waitForURL(`${config.base}/login`);
    await page.waitForLoadState('networkidle');
    assert(!(await context.cookies()).some((c) => c.name.startsWith('__Host-senior_club_')), 'Shared-context logout left auth cookies');
    finalState = await state();
    const memberSessions = finalState.sessions.filter((s) => s.userId === config.roleIds.member);
    assert(memberSessions.length > 0 && memberSessions.every((s) => s.revokedAt), 'Shared-context logout did not revoke the actual member session');
    await Promise.all([page, second].map((tab) => tab.goto(`${config.base}/me`, { waitUntil: 'networkidle' })));
    await Promise.all(tasks);
    assert([page, second].every((tab) => path(tab.url()) === '/login'), 'A logged-out tab can render protected member UI');
    const mirrorAbsent = await Promise.all([page, second].map((tab) => tab.evaluate(() => localStorage.getItem('club-senior-profile') === null)));
    assert(mirrorAbsent.every(Boolean), 'Shared profile mirror survived actual logout');
    const loggedOutReads = sessionResponses.filter((r) => r.phase === 'logout');
    assert([1, 2].every((n) => loggedOutReads.some((r) => r.tab === n)) && loggedOutReads.every((r) => r.status === 200 && !r.authenticated), 'Both logged-out mounted tabs must return unauthenticated real BFF sessions');
    checks.push({ name: 'actual-profile-logout-revokes-shared-session-and-denies-both-tabs', passed: true, logoutStatus: 200, backendSessionsRevoked: true, browserAuthCookiesAbsent: true, mirrorAbsentInBothTabs: true, destinations: ['/login', '/login'], actualUnauthenticatedBffResponses: loggedOutReads.length });
    finalState = await state();
    assert(finalState.authRefreshStatuses.length === before.authRefreshStatuses.length + 1 && finalState.externalFetchAttempts === 0 && finalState.migrations[0].count === 10 && finalState.outboxCount === 0 && externalRequests.length === 0 && pageErrors.length === 0, 'Final two-tab provider/session/migration isolation failed');
    checks.push({ name: 'two-tab-provider-isolation-and-final-single-rotation', passed: true, backendRefreshStatuses: finalState.authRefreshStatuses, migrations: 10, externalFetchAttempts: 0, externalBrowserRequests: 0 });
  } catch (error) {
    failures.push({ message: error.message, currentPaths: [path(page.url()), ...(second ? [path(second.url())] : [])], completedChecks: checks.length });
  } finally {
    await Promise.all(tasks);
    if (second) await second.close();
  }
  return { startedAt, finishedAt: new Date().toISOString(), phase: 'two-tabs', scope: 'isolated-local-real-mounted-UI-one-secure-browser-context-two-tabs', checks, failures, findings: [], sessionResponses, requestTrace, restoredCookieAttributes, backendRefreshStatuses: finalState?.authRefreshStatuses, pageErrors, externalRequests, passed: failures.length === 0 && pageErrors.length === 0 && externalRequests.length === 0 };
}
