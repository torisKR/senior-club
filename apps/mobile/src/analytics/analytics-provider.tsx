import { usePathname } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';

import { ANALYTICS_CONSENT_KEY, analyticsChoice, type AnalyticsChoice } from '../../../../shared/analytics/measurement';
import { storage } from '@/utils/storage';
import { AppAnalytics } from './controller';
import { loadAnalyticsSdk } from './sdk';

type Consent = { choice: AnalyticsChoice; error: string; choose: (enabled: boolean) => void; available: boolean };
const Context = createContext<Consent>({ choice: 'unknown', error: '', choose: () => {}, available: false });

function storedChoice(): AnalyticsChoice {
  try { return analyticsChoice(storage.getRaw(ANALYTICS_CONSENT_KEY)); } catch { return 'unknown'; }
}

export function AnalyticsProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const [choice, setChoice] = useState(storedChoice);
  const [error, setError] = useState('');
  const [controller] = useState(() => new AppAnalytics(loadAnalyticsSdk, () => setError('이용 분석을 시작하지 못했어요. 잠시 후 다시 켜 주세요.')));
  const currentPath = useRef(pathname);
  useLayoutEffect(() => { currentPath.current = pathname; }, [pathname]);
  const available = Platform.OS === 'android';

  useEffect(() => {
    if (!available) return;
    void controller.setEnabled(storedChoice() === 'granted').then(() => {
      if (AppState.currentState === 'active') void controller.view(currentPath.current);
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void controller.view(currentPath.current);
      else controller.leaveForeground();
    });
    return () => subscription.remove();
  }, [controller, available]);

  useEffect(() => {
    if (available && AppState.currentState === 'active') void controller.view(pathname);
  }, [controller, pathname, available]);

  const choose = useCallback((enabled: boolean) => {
    if (!enabled) void controller.setEnabled(false);
    try {
      // Store only this device's explicit choice, independently of account data.
      globalThis.localStorage.setItem(ANALYTICS_CONSENT_KEY, enabled ? 'granted' : 'denied');
      setChoice(enabled ? 'granted' : 'denied');
      setError('');
      void controller.setEnabled(enabled).then(() => {
        if (AppState.currentState === 'active') void controller.view(currentPath.current);
      });
    } catch {
      setChoice('denied');
      void controller.setEnabled(false);
      setError('설정을 저장하지 못했어요. 이용 분석은 꺼져 있습니다.');
    }
  }, [controller]);

  return <Context.Provider value={{ choice, error, choose, available }}>{children}</Context.Provider>;
}

export function useAnalyticsConsent() { return useContext(Context); }
