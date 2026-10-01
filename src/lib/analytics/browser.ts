import { measurementPage } from '../../../shared/analytics/measurement';

export const ANALYTICS_ORIGIN = 'https://senior.toris.kr';
type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

export class BrowserAnalytics {
  private enabled = false;
  private initialized = false;
  private previousPath: string | null = null;

  constructor(private browser: AnalyticsWindow, private measurementId: string) {}

  get available() {
    return /^G-[A-Z0-9]+$/.test(this.measurementId) && this.browser.location.origin === ANALYTICS_ORIGIN;
  }

  setEnabled(enabled: boolean, pathname: string) {
    this.enabled = enabled && this.available;
    (this.browser as unknown as Record<string, unknown>)[`ga-disable-${this.measurementId}`] = !this.enabled;
    if (!this.enabled) {
      this.previousPath = null;
      if (this.initialized) this.browser.gtag?.('consent', 'update', this.consent(false));
      this.clearCookies();
      return;
    }
    const page = measurementPage(pathname, 'web');
    if (!this.initialized) {
      this.initialized = true;
      this.browser.dataLayer = [];
      const queue = this.browser.dataLayer;
      // eslint-disable-next-line prefer-rest-params -- Preserve Google's documented gtag command queue format.
      this.browser.gtag = function () { queue.push(arguments); };
      this.browser.gtag('consent', 'default', this.consent(false));
      this.browser.gtag('consent', 'update', this.consent(true));
      this.browser.gtag('js', new Date());
      this.browser.gtag('config', this.measurementId, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        page_location: ANALYTICS_ORIGIN + (page?.path ?? '/'),
        page_title: page?.title ?? '시니어클럽',
        page_referrer: '',
      });
      const script = this.browser.document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${this.measurementId}`;
      script.referrerPolicy = 'no-referrer';
      script.id = 'senior-club-analytics';
      this.browser.document.head.appendChild(script);
    } else {
      this.browser.gtag?.('consent', 'update', this.consent(true));
    }
    this.view(pathname);
  }

  view(pathname: string) {
    if (!this.enabled) return;
    const page = measurementPage(pathname, 'web');
    // Deduplicate a render of the same URL, but count different detail pages
    // without exposing their identifiers in Google Analytics.
    const route = pathname.split(/[?#]/, 1)[0];
    if (!page) { this.previousPath = null; return; }
    if (route === this.previousPath) return;
    this.previousPath = route;
    const fields = { page_location: ANALYTICS_ORIGIN + page.path, page_title: page.title, page_referrer: '' };
    this.browser.gtag?.('set', fields); // Automatic engagement also uses safe dimensions.
    this.browser.gtag?.('event', 'page_view', { ...fields, screen_name: page.name, send_to: this.measurementId });
  }

  private consent(enabled: boolean) {
    return { analytics_storage: enabled ? 'granted' : 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
  }

  private clearCookies() {
    const doc = this.browser.document;
    const host = this.browser.location.hostname;
    const domains = ['', host, ...host.split('.').map((_, i, parts) => '.' + parts.slice(i).join('.'))];
    for (const cookie of doc.cookie.split(';')) {
      const name = cookie.split('=')[0].trim();
      if (!/^_ga(?:_|$)/.test(name)) continue;
      for (const domain of domains) {
        doc.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax${domain ? `; domain=${domain}` : ''}`;
      }
    }
  }
}
