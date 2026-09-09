import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import mobileAds, {
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
} from 'react-native-google-mobile-ads';

import { useAdsAllowed } from '@/billing/BillingProvider';

type AdsContextValue = {
  readonly canRequestAds: boolean;
  readonly privacyOptionsRequired: boolean;
  readonly showPrivacyOptions: () => Promise<void>;
};

const AdsContext = createContext<AdsContextValue>({
  canRequestAds: false,
  privacyOptionsRequired: false,
  showPrivacyOptions: async () => undefined,
});

export function AdsProvider({ children }: React.PropsWithChildren): React.ReactElement {
  const adsAllowed = useAdsAllowed();
  const [consentCanRequest, setConsentCanRequest] = useState(false);
  const [privacyOptionsRequired, setPrivacyOptionsRequired] = useState(false);
  const canRequestAds = adsAllowed && consentCanRequest;

  const applyConsent = useCallback(
    (info: Awaited<ReturnType<typeof AdsConsent.getConsentInfo>>) => {
      setConsentCanRequest(info.canRequestAds);
      setPrivacyOptionsRequired(
        info.privacyOptionsRequirementStatus ===
          AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
      );
      return info.canRequestAds;
    },
    [],
  );

  useEffect(() => {
    if (!adsAllowed) {
      return;
    }

    let live = true;

    const initialize = async () => {
      try {
        const consent = await AdsConsent.gatherConsent();
        if (!live || !applyConsent(consent)) return;
        await mobileAds().initialize();
      } catch {
        try {
          const previous = await AdsConsent.getConsentInfo();
          if (!live || !applyConsent(previous)) return;
          await mobileAds().initialize();
        } catch {
          if (live) setConsentCanRequest(false);
        }
      }
    };

    void initialize();
    return () => {
      live = false;
    };
  }, [adsAllowed, applyConsent]);

  const showPrivacyOptions = useCallback(async () => {
    const consent = await AdsConsent.showPrivacyOptionsForm();
    applyConsent(consent);
  }, [applyConsent]);

  const value = useMemo(
    () => ({ canRequestAds, privacyOptionsRequired, showPrivacyOptions }),
    [canRequestAds, privacyOptionsRequired, showPrivacyOptions],
  );

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}

export function useAds(): AdsContextValue {
  return useContext(AdsContext);
}
