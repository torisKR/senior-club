export const ANALYTICS_CONSENT_KEY = 'senior-club:analytics-consent:v1';
export type AnalyticsChoice = 'granted' | 'denied' | 'unknown';
export type MeasurementPage = { name: string; title: string; path: string };

const pages: Record<string, [string, string]> = {
  '/': ['home', '홈'], '/home': ['home', '홈'], '/index': ['home', '홈'],
  '/events': ['events', '모임'], '/clubs': ['clubs', '커뮤니티'],
  '/chat': ['chat', '채팅'], '/me': ['profile', '내 정보'],
  '/login': ['login', '로그인'], '/onboarding': ['profile_setup', '프로필 설정'],
  '/notifications': ['notifications', '알림'], '/reviews/new': ['review_create', '후기 쓰기'],
  '/privacy': ['privacy', '개인정보 처리방침'], '/terms': ['terms', '이용약관'],
  '/about': ['about', '서비스 소개'], '/account-deletion': ['account_deletion', '계정 삭제 안내'],
  '/leader': ['leader', '모임 관리'], '/leader/events/new': ['event_create', '모임 만들기'],
};

// Only fixed route templates leave the device. IDs, slugs, search text and OAuth
// parameters never become dimensions or page locations.
export function measurementPage(rawPath: string, platform: 'web' | 'android'): MeasurementPage | null {
  const path = rawPath.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/';
  if (platform === 'android' && path === '/') return null; // Redirect-only entry.
  const fixed = pages[path];
  if (fixed) return { name: fixed[0], title: fixed[1], path: fixed[0] === 'home' ? '/' : path };
  const patterns: [RegExp, string, string, string][] = [
    [/^\/(?:events|event)\/[^/]+$/, 'event_detail', '모임 자세히', '/events/[id]'],
    [/^\/(?:clubs|club)\/[^/]+$/, 'club_detail', '커뮤니티 자세히', '/clubs/[slug]'],
    [/^\/(?:clubs|club)\/[^/]+\/posts$/, 'club_posts', '커뮤니티 게시글', '/clubs/[slug]/posts'],
    [/^\/(?:clubs|club)\/[^/]+\/(?:posts|post)\/[^/]+$/, 'club_post', '게시글 자세히', '/clubs/[slug]/posts/[id]'],
    [/^\/leader\/events\/[^/]+\/edit$/, 'event_edit', '모임 수정', '/leader/events/[id]/edit'],
  ];
  for (const [pattern, name, title, template] of patterns) {
    if (pattern.test(path)) return { name, title, path: template };
  }
  return null;
}

export function analyticsChoice(value: string | null): AnalyticsChoice {
  return value === 'granted' || value === 'denied' ? value : 'unknown';
}
