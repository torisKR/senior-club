async (page) => {
  const config = __ROLE_UI_CONFIG__;
  const checks = [];
  const failures = [];
  const findings = [];
  const externalRequests = [];
  const pageErrors = [];
  const contexts = [];
  const startedAt = new Date().toISOString();
  const browser = page.context().browser();
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const record = (name, detail) => checks.push({ name, passed: true, ...detail });
  const path = (url) => new URL(url).pathname;
  async function guard(context) {
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
        externalRequests.push({ host: url.hostname, path: url.pathname });
        return route.abort('blockedbyclient');
      }
      await route.continue();
    });
    context.on('page', (p) => p.on('pageerror', (error) => pageErrors.push({ path: path(p.url()), message: error.message.slice(0, 160) })));
  }
  await guard(page.context());
  page.on('pageerror', (error) => pageErrors.push({ path: path(page.url()), message: error.message.slice(0, 160) }));
  const state = async () => {
    const response = await page.context().request.get(`${config.api}/__qa/state`, { headers: { 'x-qa-control': config.control } });
    assert(response.status() === 200, 'Owned fixture DB state read failed');
    return response.json();
  };
  const post = (p, apiPath, body) => p.evaluate(async ({ apiPath, body }) => {
    const response = await fetch(apiPath, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }, { apiPath, body });
  async function login(p, role) {
    await p.goto(`${config.base}/login`, { waitUntil: 'domcontentloaded' });
    const response = await post(p, '/api/auth/kakao', { accessToken: `role-ui-${role}-token`, termsAccepted: true, privacyAccepted: true });
    assert(response.status === 201 && response.body.user.id === config.roleIds[role], `${role} actual BFF login failed`);
    return response.body.user;
  }
  async function rolePage(role, width = 1440) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width, height: 1000 } });
    contexts.push(context);
    await guard(context);
    const p = await context.newPage();
    p.setDefaultTimeout(30_000);
    await login(p, role);
    return p;
  }
  async function layout(p, name) {
    const result = await p.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert(result.document <= result.width + 1 && result.body <= result.width + 1, `${name} horizontal overflow`);
    record(name, result);
  }
  let memberName = '격리 QA 프로필 회원';
  try {
    page.setDefaultTimeout(30_000);
    await page.goto(`${config.base}/login`, { waitUntil: 'domcontentloaded' });
    const originProbe = await post(page, '/api/qa-role-origin', {});
    assert(originProbe.body.requestOrigin === originProbe.body.browserOrigin, 'Temporary Next server and browser origins differ');
    record('temporary-local-origin-diagnostic', originProbe.body);
    const invalid = await post(page, '/api/auth/kakao', { accessToken: 'invalid-local-qa-token', termsAccepted: true, privacyAccepted: true });
    assert(invalid.status === 401 && invalid.body.error.code === 'KAKAO_TOKEN_INVALID', `Invalid identity BFF expected 401/KAKAO_TOKEN_INVALID; observed ${invalid.status}/${invalid.body.error?.code}`);
    assert((await page.context().cookies()).filter((c) => c.name.startsWith('__Host-senior_club_')).length === 0, 'Invalid identity minted browser cookies');
    record('invalid-provider-identity-rejected', { status: 401 });

    await login(page, 'member');
    const cookies = (await page.context().cookies()).filter((c) => c.name.startsWith('__Host-senior_club_'));
    assert(cookies.length === 2 && cookies.every((c) => c.httpOnly && c.secure && c.sameSite === 'Lax' && c.path === '/' && c.domain === new URL(config.base).hostname), 'Actual BFF cookies do not match host security policy');
    record('member-real-session-and-bff-cookies', { role: 'MEMBER', cookieAttributes: cookies.map(({ name, httpOnly, secure, sameSite, path }) => ({ name, httpOnly, secure, sameSite, path })) });
    await page.goto(`${config.base}/me`);
    await page.getByRole('heading', { name: '마이페이지', exact: true }).waitFor();
    await page.getByRole('link', { name: '프로필 수정하기', exact: true }).click();
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await page.locator('#display-name').fill(memberName);
    await page.locator('#profile-phone').fill('010-1234-5678');
    const regions = await page.locator('#region option').evaluateAll((options) => options.map((o) => o.value).filter(Boolean));
    await page.locator('#region').selectOption(regions.find((r) => r.includes('마포')) ?? regions[0]);
    await page.locator('#birth-year').fill('1962');
    const profileResponse = page.waitForResponse((r) => path(r.url()) === '/api/me/profile' && r.request().method() === 'PATCH');
    await page.getByRole('button', { name: '설정 완료하고 둘러보기', exact: true }).click();
    assert((await profileResponse).status() === 200, 'Actual profile PATCH failed');
    await page.waitForURL(`${config.base}/me`);
    await page.getByRole('heading', { name: '마이페이지', exact: true }).waitFor();
    const stored = (await state()).users.find((u) => u.id === config.roleIds.member);
    assert(stored.name === memberName && stored.phoneNumber === '+821012345678' && stored.onboardingCompletedAt, 'UI profile fields were not stored in real Prisma DB');
    record('member-profile-ui-save-real-db', { namePersisted: true, phoneNormalizedAndPersisted: true, onboardingCompleted: true });
    await layout(page, 'member-profile-desktop-layout');

    const denied = await page.goto(`${config.base}/admin`);
    await page.getByRole('heading', { name: '요청하신 화면을 찾지 못했어요.', exact: true }).waitFor();
    assert(!(await page.getByRole('heading', { name: '시니어클럽 운영 센터', exact: true }).count()), 'Member can render administrator UI');
    const memberAdmin = await page.evaluate(async () => { const r = await fetch('/api/admin/reports'); return { status: r.status, code: (await r.json()).error?.code }; });
    assert(memberAdmin.status === 403, 'Member BFF admin report authorization failed');
    record('member-admin-server-ui-and-api-denial', { serverUiStatus: denied.status(), streamedNotFoundUi: true, protectedAdminUiAbsent: true, apiStatus: 403, code: memberAdmin.code });

    await page.goto(`${config.base}/me`, { waitUntil: 'networkidle' });
    const beforeRefresh = (await page.context().cookies()).find((c) => c.name === '__Host-senior_club_session').value;
    const refreshBefore = (await state()).authRefreshStatuses.length;
    const mountedSessions = [];
    const mountedSessionTasks = [];
    const captureMountedSession = (response) => {
      if (path(response.url()) !== '/api/auth/session') return;
      mountedSessionTasks.push((async () => {
        const body = await response.json().catch(() => null);
        mountedSessions.push({ status: response.status(), authenticated: body?.authenticated === true, memberIdMatched: body?.user?.id === config.roleIds.member });
      })());
    };
    page.on('response', captureMountedSession);
    await page.context().clearCookies({ name: '__Host-senior_club_access' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForURL(`${config.base}/me`, { timeout: 10_000 }).catch(() => undefined);
    await page.waitForLoadState('networkidle');
    await Promise.all(mountedSessionTasks);
    page.off('response', captureMountedSession);
    assert(path(page.url()) === '/me', 'Real mounted continuation did not restore protected member UI');
    assert(mountedSessions.length > 0 && mountedSessions.every((r) => r.status === 200 && r.authenticated && r.memberIdMatched), 'Actual mounted BFF session reader did not restore member');
    const refreshState = await state();
    const refreshStatuses = refreshState.authRefreshStatuses.slice(refreshBefore);
    assert(refreshStatuses.length === 1 && refreshStatuses[0] === 201, 'Mounted protected continuation did not perform exactly one successful refresh');
    assert(refreshState.sessions.some((s) => s.userId === config.roleIds.member && s.revokedAt === null), 'Restored backend member session is not live');
    const afterRefresh = (await page.context().cookies()).find((c) => c.name === '__Host-senior_club_session')?.value;
    assert(afterRefresh, 'Restored refresh cookie is absent');
    assert(beforeRefresh !== afterRefresh, 'Real refresh token did not rotate');
    await page.getByRole('heading', { name: '마이페이지', exact: true }).waitFor();
    record('member-bff-session-refresh-and-protected-ui-restore', { refreshTokenRotated: true, authenticated: true, providerReloginRequired: false, actualMountedSessionRequests: mountedSessions.length, backendRefreshStatuses: refreshStatuses, backendSessionLive: true });

    await page.goto(`${config.base}/clubs/${config.clubSlug}/posts`);
    await page.getByRole('button', { name: '새 글 쓰기', exact: true }).click();
    await page.locator('#community-post-title').fill('격리 QA 회원 이야기');
    await page.locator('#community-post-content').fill('실제 웹 UI와 BFF 및 Nest Prisma를 통해 저장한 격리 로컬 QA 게시글입니다.');
    const postResponse = page.waitForResponse((r) => path(r.url()) === `/api/clubs/${config.clubSlug}/posts` && r.request().method() === 'POST');
    await page.getByRole('button', { name: '게시글 등록하기', exact: true }).click();
    const postResult = await postResponse;
    assert(postResult.status() === 201, 'UI community post creation failed');
    const createdPost = await postResult.json();
    await page.waitForURL(`${config.base}/clubs/${config.clubSlug}/posts/${createdPost.id}`);
    await page.getByRole('heading', { name: '격리 QA 회원 이야기', exact: true }).waitFor();
    const storedPost = (await state()).posts.find((p) => p.id === createdPost.id);
    assert(storedPost?.userId === config.roleIds.member && storedPost.status === 'PUBLISHED', 'UGC UI was not backed by stored Prisma post');
    record('member-ugc-ui-create-and-real-db-detail', { status: 201, actualDatabaseStored: true, syntheticFixture: true });

    await page.goto(`${config.base}/events/${config.eventId}`);
    await page.getByRole('heading', { name: '리더가 신청을 확인하고 있어요', exact: true }).waitFor();
    record('member-existing-pending-application-ui', { databaseStatus: (await state()).application.status });

    const leader = await rolePage('leader', 390);
    await leader.goto(`${config.base}/leader`);
    await leader.locator('#upcoming-event').selectOption(config.eventId);
    const row = leader.locator('article').filter({ has: leader.getByRole('heading', { name: memberName, exact: true }) });
    await row.getByRole('button', { name: '승인', exact: true }).waitFor();
    const appId = (await state()).application.id;
    const approvedResponse = leader.waitForResponse((r) => path(r.url()) === `/api/leader/applications/${appId}` && r.request().method() === 'PATCH');
    await row.getByRole('button', { name: '승인', exact: true }).click();
    assert((await approvedResponse).status() === 200, 'Actual leader UI approval failed');
    const approved = (await state()).application;
    assert(approved.status === 'APPROVED' && approved.reviewedById === config.roleIds.leader, 'Leader UI approval not committed by Prisma');
    await layout(leader, 'leader-phone-width-layout');
    record('leader-application-ui-approval-real-db', { status: 'APPROVED', ownerLeaderRecorded: true });
    await page.reload();
    await page.getByRole('heading', { name: '함께할 자리가 확정됐어요', exact: true }).waitFor();
    record('member-ui-sees-leader-approval-after-reload', { approved: true });
    await page.getByRole('button', { name: '신청 취소', exact: true }).click();
    const cancelResponse = page.waitForResponse((r) => path(r.url()) === `/api/events/${config.eventId}/applications` && r.request().method() === 'DELETE');
    await page.getByRole('button', { name: '신청 취소하기', exact: true }).click();
    assert((await cancelResponse).status() === 200, 'Actual member UI cancellation failed');
    await page.getByText('모임 신청을 취소했습니다.', { exact: true }).waitFor();
    assert((await state()).application.status === 'CANCELED', 'Canceled application not stored');
    await leader.reload();
    await leader.locator('#upcoming-event').selectOption(config.eventId);
    await leader.locator('[aria-label="신청 상태"]').getByRole('button', { name: /신청 취소/ }).click();
    await leader.getByRole('heading', { name: memberName, exact: true }).waitFor();
    record('member-ui-cancel-and-leader-ui-canceled-filter', { databaseStatus: 'CANCELED', crossRoleUi: true });

    const outsider = await rolePage('outsider');
    const unauthorizedResponse = outsider.waitForResponse((r) => path(r.url()) === `/api/leader/events/${config.eventId}`);
    await outsider.goto(`${config.base}/leader/events/${config.eventId}/edit`);
    const deniedDetail = await unauthorizedResponse;
    const deniedBody = await deniedDetail.json();
    assert(deniedDetail.status() === 404 && deniedBody.error?.code === 'MANAGED_EVENT_NOT_FOUND', `Other leader detail expected concealed 404/MANAGED_EVENT_NOT_FOUND; observed ${deniedDetail.status()}/${deniedBody.error?.code}`);
    await outsider.getByRole('heading', { name: '작성 화면을 열지 못했습니다', exact: true }).waitFor();
    assert(!(await outsider.locator('#event-title').count()), 'Unowned event form became editable');
    const unchanged = (await state()).application;
    const outsiderWrite = await outsider.evaluate(async (id) => { const r = await fetch(`/api/leader/applications/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'APPROVED' }) }); return { status: r.status, code: (await r.json()).error?.code }; }, appId);
    assert(outsiderWrite.status === 403 && (await state()).application.status === unchanged.status, 'Other leader authorization did not block mutation');
    record('other-leader-ui-and-mutation-ownership-denial', { readStatus: 404, readCode: 'MANAGED_EVENT_NOT_FOUND', writeStatus: 403, mutationAbsent: true, code: outsiderWrite.code });

    const admin = await rolePage('admin', 390);
    await admin.goto(`${config.base}/admin`);
    await admin.getByRole('heading', { name: '시니어클럽 운영 센터', exact: true }).waitFor();
    const reportRow = admin.locator('li').filter({ hasText: '격리 QA 신고 목록과 상태 변경 확인' });
    await reportRow.getByRole('button', { name: '검토 시작', exact: true }).waitFor();
    await layout(admin, 'admin-phone-width-layout');
    const reviewResponse = admin.waitForResponse((r) => path(r.url()) === '/api/admin/reports/role-ui-report' && r.request().method() === 'PATCH');
    await reportRow.getByRole('button', { name: '검토 시작', exact: true }).click();
    assert((await reviewResponse).status() === 200, 'Admin actual report state update failed');
    assert((await state()).reports[0].status === 'IN_REVIEW', 'Admin report UI change not persisted');
    await admin.locator('[aria-label="신고 상태"]').getByRole('button', { name: /검토 중/ }).click();
    await reportRow.getByText('검토 중', { exact: true }).waitFor();
    record('admin-report-ui-read-and-review-real-db', { databaseStatus: 'IN_REVIEW', reportFixtureIsSynthetic: true });
    await admin.goto(`${config.base}/clubs/${config.clubSlug}/posts/role-ui-reported-post`);
    await admin.getByRole('heading', { name: '격리 QA 검토 대상', exact: true }).waitFor();
    record('admin-ugc-target-real-ui-detail', { publicDetailViewedWithAdminSession: true, dedicatedAdminUgcDashboardTested: false });

    await page.goto(`${config.base}/me`);
    const logoutResponse = page.waitForResponse((r) => path(r.url()) === '/api/auth/logout' && r.request().method() === 'POST');
    await page.getByRole('complementary', { name: '나의 활동 요약' }).getByRole('button', { name: '로그아웃', exact: true }).click();
    assert((await logoutResponse).status() === 200, 'Member UI logout BFF failed');
    await page.waitForURL(`${config.base}/login`);
    assert(!(await page.context().cookies()).some((c) => c.name.startsWith('__Host-senior_club_')), 'UI logout left auth cookies');
    const final = await state();
    assert(final.sessions.filter((s) => s.userId === config.roleIds.member).every((s) => s.revokedAt), 'Logout did not revoke real member session');
    await page.goto(`${config.base}/me`);
    assert(path(page.url()) === '/login', 'Logged out member can render protected UI');
    record('member-ui-logout-cookie-clear-session-revoke-and-denial', { backendSessionsRevoked: true, browserCookiesAbsent: true });
    assert(final.externalFetchAttempts === 0 && externalRequests.length === 0, 'External provider/network attempt occurred');
    assert(final.migrations[0].count === 10, 'Expected ten real migrations were not installed');
    record('real-migrations-provider-disabled-and-no-external-requests', { migrations: 10, externalFetchAttempts: 0, externalBrowserRequests: 0, kakaoVerifierCalls: final.providerChecks });
  } catch (error) {
    failures.push({ message: error.message, currentPath: path(page.url()), completedChecks: checks.length });
  } finally {
    for (const context of contexts) await context.close();
  }
  return { startedAt, finishedAt: new Date().toISOString(), scope: 'isolated-local-real-Nest-Prisma-Next-BFF-HTTPS', externalIdentityStub: 'KakaoTokenVerifier only', checks, failures, findings, pageErrors, externalRequests, passed: failures.length === 0 && pageErrors.length === 0 && externalRequests.length === 0 && findings.length === 0 };
}
