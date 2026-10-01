"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { ANALYTICS_CONSENT_KEY, analyticsChoice, type AnalyticsChoice } from '../../shared/analytics/measurement';
import { BrowserAnalytics } from '@/lib/analytics/browser';

type ConsentContext = { choice: AnalyticsChoice; ready: boolean; available: boolean; error: string; choose: (enabled: boolean) => void };
const AnalyticsContext = createContext<ConsentContext | null>(null);

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [choice, setChoice] = useState<AnalyticsChoice>('unknown');
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState('');
  const client = useRef<BrowserAnalytics | null>(null);
  const currentPath = useRef(pathname);
  useLayoutEffect(() => { currentPath.current = pathname; }, [pathname]);

  useEffect(() => {
    const analytics = client.current ?? new BrowserAnalytics(window, process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '');
    client.current = analytics;
    const load = () => {
      let stored: AnalyticsChoice = 'unknown';
      try { stored = analyticsChoice(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)); } catch { /* Default denied. */ }
      setChoice(stored);
      setAvailable(analytics.available);
      setReady(true);
      analytics.setEnabled(stored === 'granted', currentPath.current);
    };
    // Also synchronize withdrawal made in another tab.
    const sync = (event: StorageEvent) => { if (event.key === ANALYTICS_CONSENT_KEY || event.key === null) load(); };
    load();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  useEffect(() => { client.current?.view(pathname); }, [pathname]);

  const choose = useCallback((enabled: boolean) => {
    if (!enabled) client.current?.setEnabled(false, currentPath.current);
    try {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, enabled ? 'granted' : 'denied');
      setChoice(enabled ? 'granted' : 'denied');
      setError('');
      client.current?.setEnabled(enabled, currentPath.current);
    } catch {
      setChoice('denied');
      client.current?.setEnabled(false, currentPath.current);
      setError('설정을 저장하지 못했습니다. 이용 분석은 꺼져 있습니다.');
    }
  }, []);

  return <AnalyticsContext.Provider value={{ choice, ready, available, error, choose }}>{children}</AnalyticsContext.Provider>;
}

export function AnalyticsSettings({ prompt = false }: { prompt?: boolean }) {
  const consent = useContext(AnalyticsContext);
  if (!consent?.ready || !consent.available || (prompt && consent.choice !== 'unknown')) return null;
  return (
    <section aria-label="서비스 이용 분석 설정" className="panel p-5 sm:p-6">
      <h2 className="text-xl font-extrabold">서비스 이용 분석 (선택)</h2>
      <p className="mt-3 text-[17px] leading-7 text-[var(--muted)]">
        페이지와 화면 조회, 방문 횟수를 Google Analytics로 분석해 서비스를 개선합니다.
        이름·전화번호·채팅 내용은 보내지 않습니다. 동의하지 않아도 모든 기능을 이용할 수 있습니다.
      </p>
      <p className="mt-2 text-[17px] font-bold">현재: {consent.choice === 'granted' ? '켜짐' : '꺼짐'}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button className="button-secondary" type="button" onClick={() => consent.choose(false)}>{prompt ? '동의하지 않음' : '이용 분석 끄기'}</button>
        <button className="button-secondary" type="button" onClick={() => consent.choose(true)}>{prompt ? '동의하고 켜기' : '이용 분석 켜기'}</button>
        {prompt && <Link className="button-quiet" href="/privacy#analytics">자세히 보기</Link>}
      </div>
      <p className="mt-3 text-[16px] text-[var(--muted)]">이 기기의 설정입니다. 개인정보 처리방침에서 언제든 바꿀 수 있습니다.</p>
      {consent.error && <p className="mt-3" role="alert">{consent.error}</p>}
    </section>
  );
}
