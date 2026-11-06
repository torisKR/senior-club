// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalyticsSettingsEntry } from '@/analytics/consent-card';
import { PRIVACY_POLICY_URL } from '@/config/public-web-links';
import { PlusCard } from './plus-card';

const fixture = vi.hoisted(() => ({
  restore: vi.fn(), buy: vi.fn(), choose: vi.fn(), openURL: vi.fn(),
}));
vi.mock('@/billing/BillingProvider', () => ({
  useBilling: () => ({
    restore: fixture.restore, buy: fixture.buy, owned: false, ready: true,
    price: '₩1,000', priceLoaded: true, retryPrice: vi.fn(),
  }),
}));
vi.mock('@/analytics/analytics-provider', () => ({
  useAnalyticsConsent: () => ({ available: true, choice: 'granted', error: '', choose: fixture.choose }),
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  View: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  Switch: ({ value, onValueChange }: { value: boolean; onValueChange: (value: boolean) => void }) =>
    createElement('button', { onClick: () => onValueChange(!value) }, '이용 분석 변경'),
  Linking: { openURL: fixture.openURL },
  Alert: { alert: vi.fn() },
}));
vi.mock('@/components/ui', () => ({
  Card: ({ children }: { children: ReactNode }) => createElement('section', null, children),
  AppText: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  SeniorButton: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) =>
    createElement('button', { onClick: onPress, disabled }, label),
}));
vi.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ border: '#ddd', primary: '#123', surface: '#fff' }) }));
vi.mock('@/constants/theme', () => ({ Spacing: { xs: 4, sm: 8, md: 16, lg: 24 }, TouchTarget: { minimum: 56 } }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  fixture.restore.mockResolvedValue({ status: 'owned' });
  fixture.openURL.mockResolvedValue(undefined);
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

async function press(label: string) {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent === label);
  expect(button).toBeDefined();
  await act(async () => { button!.click(); });
}

describe('game privacy and purchase controls', () => {
  it('opens analytics settings, changes consent and links to the published policy', async () => {
    await act(async () => root.render(createElement(AnalyticsSettingsEntry)));
    await press('이용 분석 설정');
    await press('이용 분석 변경');
    expect(fixture.choose).toHaveBeenCalledWith(false);
    await press('개인정보 처리방침 보기');
    expect(fixture.openURL).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
  });

  it('lets a player restore a previous purchase without starting a new one', async () => {
    await act(async () => root.render(createElement(PlusCard)));
    await press('이전에 구매했다면 복원하기');
    expect(fixture.restore).toHaveBeenCalledOnce();
    expect(fixture.buy).not.toHaveBeenCalled();
    expect(container.textContent).toContain('구매를 되찾았어요');
  });
});
