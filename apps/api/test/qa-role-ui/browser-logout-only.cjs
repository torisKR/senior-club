module.exports = async (page) => {
  const config = __ROLE_UI_CONFIG__;
  const checks = [];
  const failures = [];
  const externalRequests = [];
  const pageErrors = [];
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
    assert((await page.context().cookies()).filter((c) => c.name.startsWith('__Host-senior_club_')).length === 2, 'Initial BFF auth cookies missing');
    const logoutResponse = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/auth/logout' && r.request().method() === 'POST');
    await page.getByRole('complementary', { name: '나의 활동 요약' }).getByRole('button', { name: '로그아웃', exact: true }).click();
    assert((await logoutResponse).status() === 200, 'Actual UI logout BFF failed');
    await page.waitForURL(`${config.base}/login`);
    assert(!(await page.context().cookies()).some((c) => c.name.startsWith('__Host-senior_club_')), 'Logout left auth cookies');
    const response = await page.context().request.get(`${config.api}/__qa/state`, { headers: { 'x-qa-control': config.control } });
    assert(response.status() === 200, 'Owned DB state read failed');
    const state = await response.json();
    const memberSessions = state.sessions.filter((s) => s.userId === config.roleIds.member);
    assert(memberSessions.length > 0 && memberSessions.every((s) => s.revokedAt), 'Logout did not revoke actual DB session');
    await page.goto(`${config.base}/me`, { waitUntil: 'networkidle' });
    assert(new URL(page.url()).pathname === '/login', 'Logged-out member rendered protected UI');
    checks.push({ name: 'member-ui-logout-cookie-clear-session-revoke-and-denial', passed: true, backendSessionsRevoked: true, browserAuthCookiesAbsent: true, protectedDestination: '/login' });
    assert(state.externalFetchAttempts === 0 && externalRequests.length === 0 && state.migrations[0].count === 10, 'Provider isolation or real migration invariant failed');
    checks.push({ name: 'real-migrations-provider-disabled-and-no-external-requests', passed: true, migrations: 10, externalFetchAttempts: 0, externalBrowserRequests: 0 });
  } catch (error) {
    failures.push({ message: error.message, currentPath: new URL(page.url()).pathname });
  }
  return { startedAt, finishedAt: new Date().toISOString(), phase: 'logout-only', scope: 'isolated-local-production-Next-Nest-Prisma-real-UI', checks, failures, findings: [], pageErrors, externalRequests, passed: failures.length === 0 && externalRequests.length === 0 && pageErrors.length === 0 };
}
