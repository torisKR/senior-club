import type { AnalyticsSdk } from './controller';

export async function loadAnalyticsSdk(): Promise<AnalyticsSdk> {
  const api = await import('@react-native-firebase/analytics');
  const analytics = api.getAnalytics();
  return {
    consent: (enabled) => api.setConsent(analytics, {
      analytics_storage: enabled, ad_storage: false, ad_user_data: false, ad_personalization: false,
    }),
    collection: (enabled) => api.setAnalyticsCollectionEnabled(analytics, enabled),
    reset: () => api.resetAnalyticsData(analytics),
    screen: (name) => api.logScreenView(analytics, { screen_name: name, screen_class: 'SeniorClub' }),
  };
}
