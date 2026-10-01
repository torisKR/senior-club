import { measurementPage } from '../../../../shared/analytics/measurement';

export interface AnalyticsSdk {
  consent: (enabled: boolean) => Promise<void>;
  collection: (enabled: boolean) => Promise<void>;
  reset: () => Promise<void>;
  screen: (name: string) => Promise<void>;
}

export class AppAnalytics {
  private enabled = false;
  private version = 0;
  private lastRoute: string | null = null;
  private queue: Promise<void> = Promise.resolve();
  private sdk: Promise<AnalyticsSdk> | null = null;

  constructor(private load: () => Promise<AnalyticsSdk>, private onError: () => void = () => {}) {}

  setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    this.lastRoute = null;
    const version = ++this.version;
    return this.enqueue(async (sdk) => {
      if (version !== this.version) return;
      await sdk.consent(enabled);
      if (version !== this.version) return;
      await sdk.collection(enabled);
      if (!enabled) await sdk.reset();
    });
  }

  view(pathname: string): Promise<void> {
    const page = measurementPage(pathname, 'android');
    const route = pathname.split(/[?#]/, 1)[0];
    if (!this.enabled || !page) { this.lastRoute = null; return this.queue; }
    if (route === this.lastRoute) return this.queue;
    this.lastRoute = route;
    const version = this.version;
    return this.enqueue(async (sdk) => {
      if (this.enabled && version === this.version) await sdk.screen(page.name);
    });
  }

  leaveForeground() { this.lastRoute = null; }

  private enqueue(action: (sdk: AnalyticsSdk) => Promise<void>): Promise<void> {
    this.queue = this.queue.then(async () => {
      this.sdk ??= this.load();
      await action(await this.sdk);
    }).catch(() => {
      // SDK failures must not break auth or navigation. A later opt-in can retry.
      this.sdk = null;
      this.lastRoute = null;
      this.onError();
    });
    return this.queue;
  }
}
