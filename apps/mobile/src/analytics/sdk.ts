import type { AnalyticsSdk } from './controller';

// The Next.js site owns web measurement; Expo web never initializes a second SDK.
export async function loadAnalyticsSdk(): Promise<AnalyticsSdk> {
  return { consent: async () => {}, collection: async () => {}, reset: async () => {}, screen: async () => {} };
}
