import type { BillingPort, BillingPurchase } from './billing-port';
import { COSMETIC_PRODUCTS } from './cosmetic-products';
import { REMOVE_ADS_PRODUCT_ID } from './product';

export const RETRY_INITIAL_DELAY_MS = 5_000;
const RETRY_MAX_DELAY_MS = 5 * 60_000;
const RECONCILABLE_PRODUCTS = [REMOVE_ADS_PRODUCT_ID, ...COSMETIC_PRODUCTS.map(({ id }) => id)];

type RetryJob = {
  productId: string;
  tokens: Set<string>;
  probeVersion: number;
  needsProbe: boolean;
  pendingVersion: number;
  waitingForPurchase: boolean;
  attempts: number;
  running: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

/** Play's owned purchases are the durable source of unfinished transactions. */
export function createAcknowledgementRetryBilling(delegate: BillingPort) {
  const jobs = new Map<string, RetryJob>();
  const inFlight = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();
  let active = true;

  function getJob(productId: string): RetryJob {
    let job = jobs.get(productId);
    if (!job) {
      job = {
        productId, tokens: new Set(), probeVersion: 0, needsProbe: false,
        pendingVersion: 0, waitingForPurchase: false, attempts: 0, running: false,
      };
      jobs.set(productId, job);
    }
    return job;
  }

  function clearIfDone(job: RetryJob) {
    if (job.running || job.needsProbe || job.waitingForPurchase || job.tokens.size) return;
    if (job.timer !== undefined) clearTimeout(job.timer);
    if (jobs.get(job.productId) === job) jobs.delete(job.productId);
  }

  function schedule(job: RetryJob, delay?: number) {
    if (!active || job.running || job.timer !== undefined) return;
    const backoff = Math.min(RETRY_INITIAL_DELAY_MS * 2 ** Math.min(job.attempts, 6), RETRY_MAX_DELAY_MS);
    job.timer = setTimeout(() => {
      job.timer = undefined;
      void run(job);
    }, delay ?? backoff);
  }

  function retryProbe(productId: string) {
    const job = getJob(productId);
    job.needsProbe = true;
    job.probeVersion += 1;
    schedule(job);
  }

  function finishOnce(purchase: BillingPurchase): Promise<void> {
    const key = `${purchase.productId}\0${purchase.purchaseToken}`;
    const existing = inFlight.get(key);
    if (existing) return existing;
    const pending = Promise.resolve().then(() => delegate.finish(purchase)).finally(() => {
      if (inFlight.get(key) === pending) inFlight.delete(key);
    });
    inFlight.set(key, pending);
    return pending;
  }

  async function finish(purchase: BillingPurchase): Promise<void> {
    try {
      await finishOnce(purchase);
      const job = jobs.get(purchase.productId);
      if (job) {
        job.tokens.delete(purchase.purchaseToken);
        clearIfDone(job);
      }
    } catch (error) {
      if (!purchase.isPending && purchase.productId && purchase.purchaseToken.trim()) {
        const job = getJob(purchase.productId);
        job.tokens.add(purchase.purchaseToken);
        schedule(job);
      }
      throw error;
    }
  }

  async function run(job: RetryJob) {
    if (!active || job.running || jobs.get(job.productId) !== job) return;
    job.running = true;
    const pendingAtStart = [...job.tokens];
    const recoverProbe = job.needsProbe;
    const probeVersion = job.probeVersion;
    const wasPending = job.waitingForPurchase;
    const pendingVersion = job.pendingVersion;
    try {
      await delegate.connect();
      const probe = await delegate.ownedTokens(job.productId);
      if (probe.status === 'unavailable') return;
      if (recoverProbe && job.probeVersion === probeVersion) job.needsProbe = false;
      if (probe.pending) job.waitingForPurchase = true;
      else if (job.pendingVersion === pendingVersion) job.waitingForPurchase = false;

      const owned = new Set(probe.tokens.filter((token) => token.trim()));
      for (const token of pendingAtStart) {
        if (!owned.has(token)) job.tokens.delete(token);
      }
      const toFinish = recoverProbe || wasPending
        ? owned
        : new Set(pendingAtStart.filter((token) => owned.has(token)));
      for (const purchaseToken of toFinish) {
        await finish({ productId: job.productId, purchaseToken, isPending: false }).catch(() => undefined);
      }
      if (active) listeners.forEach((listener) => listener());
    } catch {
      // Treat a thrown probe as unavailable and retry it with backoff.
    } finally {
      job.running = false;
      if (job.needsProbe || job.waitingForPurchase || job.tokens.size) {
        job.attempts += 1;
        schedule(job);
      } else {
        clearIfDone(job);
      }
    }
  }

  const billing: BillingPort = {
    ...delegate,
    async connect() {
      try {
        await delegate.connect();
      } catch (error) {
        // The connection is shared by every product, including purchases whose
        // tokens could not be read locally at startup.
        RECONCILABLE_PRODUCTS.forEach(retryProbe);
        throw error;
      }
    },
    async buy(productId) {
      const purchase = await delegate.buy(productId);
      if (purchase.isPending && purchase.productId === productId) {
        const job = getJob(productId);
        job.waitingForPurchase = true;
        job.pendingVersion += 1;
        schedule(job);
      }
      return purchase;
    },
    async ownedTokens(productId = REMOVE_ADS_PRODUCT_ID) {
      let probe;
      try {
        probe = await delegate.ownedTokens(productId);
      } catch {
        probe = { status: 'unavailable' } as const;
      }
      if (probe.status === 'unavailable') {
        retryProbe(productId);
      } else if (probe.pending) {
        const job = getJob(productId);
        job.waitingForPurchase = true;
        job.pendingVersion += 1;
        schedule(job);
      }
      return probe;
    },
    finish,
    subscribeReconciliation(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };

  return {
    billing,
    start() {
      active = true;
      jobs.forEach((job) => schedule(job));
    },
    stop() {
      active = false;
      jobs.forEach((job) => {
        if (job.timer !== undefined) clearTimeout(job.timer);
        job.timer = undefined;
      });
    },
    retryNow() {
      if (!active) return;
      jobs.forEach((job) => {
        if (job.timer !== undefined) clearTimeout(job.timer);
        job.timer = undefined;
        schedule(job, 0);
      });
    },
  };
}
