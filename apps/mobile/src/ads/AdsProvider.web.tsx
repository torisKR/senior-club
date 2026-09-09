import React, { createContext, useContext } from 'react';

type AdsContextValue = {
  readonly canRequestAds: boolean;
  readonly privacyOptionsRequired: boolean;
  readonly showPrivacyOptions: () => Promise<void>;
};

const WEB_ADS: AdsContextValue = {
  canRequestAds: false,
  privacyOptionsRequired: false,
  showPrivacyOptions: async () => undefined,
};

const AdsContext = createContext(WEB_ADS);

export function AdsProvider({ children }: React.PropsWithChildren): React.ReactElement {
  return <AdsContext.Provider value={WEB_ADS}>{children}</AdsContext.Provider>;
}

export function useAds(): AdsContextValue {
  return useContext(AdsContext);
}
