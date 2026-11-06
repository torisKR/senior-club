// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LoginRoute from '@/app/(auth)/login';
import OnboardingRoute from '@/app/(auth)/onboarding';
import ClubDetailRoute from '@/app/club/[slug]/index';
import ClubPostDetailRoute from '@/app/club/[slug]/post/[id]';
import ClubPostsRoute from '@/app/club/[slug]/posts';
import EventDetailRoute from '@/app/event/[id]';
import NotificationsRoute from '@/app/notifications';
import NewReviewRoute from '@/app/reviews/new';

const actions = vi.hoisted(() => ({ replace: vi.fn(), openURL: vi.fn(), alert: vi.fn() }));
vi.mock('expo-router', () => ({ useRouter: () => ({ replace: actions.replace }) }));
vi.mock('react-native', () => ({ Linking: { openURL: actions.openURL }, Alert: { alert: actions.alert } }));
vi.mock('@/constants/theme', () => ({ Spacing: { lg: 24, md: 16 } }));
vi.mock('@/components/ui', () => ({
  Screen: ({ children }: { children: ReactNode }) => createElement('main', null, children),
  Card: ({ children }: { children: ReactNode }) => createElement('section', null, children),
  AppText: ({ children }: { children: ReactNode }) => createElement('p', null, children),
  SeniorButton: ({ label, onPress }: { label: string; onPress: () => void }) =>
    createElement('button', { onClick: onPress }, label),
}));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('retired community links', () => {
  it('shows a way back to the game instead of contacting the retired service', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const container = document.createElement('div');
    const root = createRoot(container);
    const routes = [LoginRoute, OnboardingRoute, ClubDetailRoute, ClubPostDetailRoute,
      ClubPostsRoute, EventDetailRoute, NotificationsRoute, NewReviewRoute];

    for (const Route of routes) {
      await act(async () => root.render(createElement(Route)));
      expect(container.textContent).toContain('시니어클럽이 게임으로 바뀌었어요');
    }
    expect(fetch).not.toHaveBeenCalled();
    const back = [...container.querySelectorAll('button')].find((button) => button.textContent === '청솔마을로 가기');
    await act(async () => back?.click());
    expect(actions.replace).toHaveBeenCalledWith('/home');
    await act(async () => root.unmount());
  });
});
