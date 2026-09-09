import { GOOGLE_ANDROID_TEST_BANNER_ID, PRODUCTION_ADMOB_ANDROID_BANNER_ID } from './ids';

const ADMOB_AD_UNIT_ID = /^ca-app-pub-\d{16}\/\d{10}$/;

export type BannerIdOptions = {
  readonly configuredId: string | undefined;
  readonly isDevelopment: boolean;
};

/**
 * Development always uses Google's test inventory, even when a production ID
 * exists in the shell. That prevents a developer tap from becoming invalid
 * traffic. Release builds fail closed when the unit ID is absent or malformed.
 */
export function resolveAndroidBannerId({
  configuredId,
  isDevelopment,
}: BannerIdOptions): string | null {
  if (isDevelopment) return GOOGLE_ANDROID_TEST_BANNER_ID;

  const candidate = configuredId?.trim() || PRODUCTION_ADMOB_ANDROID_BANNER_ID;
  if (!ADMOB_AD_UNIT_ID.test(candidate)) {
    return null;
  }
  return candidate;
}
