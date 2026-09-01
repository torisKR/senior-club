import { getMobileEnvironment } from './env';

export type PublicWebPage = 'terms' | 'privacy' | 'account-deletion';

/** Builds policy links lazily so changing one verified origin updates every screen. */
export function getPublicWebPageUrl(page: PublicWebPage): string {
  const { webUrl } = getMobileEnvironment();
  return new URL(`/${page}`, webUrl).toString();
}
