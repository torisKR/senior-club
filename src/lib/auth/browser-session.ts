type SessionOptions = {
  fetchImplementation?: typeof fetch;
  signal?: AbortSignal;
};

type SessionRequests = {
  revision: number;
  session?: Promise<Response>;
  logout?: Promise<Response>;
};

const requests = new WeakMap<typeof fetch, SessionRequests>();
const responseFreshness = new WeakMap<Response, () => boolean>();
const lockName = "senior-club-browser-session";

function requestState(fetchImplementation: typeof fetch) {
  let state = requests.get(fetchImplementation);
  if (!state) {
    state = { revision: 0 };
    requests.set(fetchImplementation, state);
  }
  return state;
}

function cancelled() {
  return new DOMException("Session reader is no longer active", "AbortError");
}

async function withBrowserSessionLock(operation: () => Promise<Response>) {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(lockName, { mode: "exclusive" }, operation);
  }
  return operation();
}

async function timedFetch(fetchImplementation: typeof fetch, url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImplementation(url, { ...init, signal: controller.signal });
    // Keep the shared request, lock and timeout through receipt of the body.
    await response.clone().arrayBuffer();
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function observe(
  request: Promise<Response>,
  signal: AbortSignal | undefined,
  isCurrent: () => boolean,
) {
  if (signal?.aborted) return Promise.reject(cancelled());
  return new Promise<Response>((resolve, reject) => {
    const abort = () => {
      signal?.removeEventListener("abort", abort);
      reject(cancelled());
    };
    signal?.addEventListener("abort", abort, { once: true });
    request.then((response) => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted || !isCurrent()) reject(cancelled());
      else {
        const clone = response.clone();
        responseFreshness.set(clone, () => !signal?.aborted && isCurrent());
        resolve(clone);
      }
    }, (error) => {
      signal?.removeEventListener("abort", abort);
      reject(error);
    });
  });
}

/** Recheck after parsing a body, before writing a profile or authenticated UI. */
export function browserSessionStillCurrent(response: Response) {
  return responseFreshness.get(response)?.() === true;
}

/** All mounted readers share one request; unmounting never cancels token rotation. */
export function readBrowserSession({ fetchImplementation = fetch, signal }: SessionOptions = {}) {
  if (signal?.aborted) return Promise.reject(cancelled());
  const state = requestState(fetchImplementation);
  if (state.logout) return observe(state.logout, signal, () => false);
  const revision = state.revision;
  if (!state.session) {
    const current = withBrowserSessionLock(() => timedFetch(fetchImplementation, "/api/auth/session", {
      credentials: "same-origin",
      cache: "no-store",
    }));
    state.session = current;
    const clear = () => { if (state.session === current) state.session = undefined; };
    void current.then(clear, clear);
  }
  return observe(state.session, signal, () => state.revision === revision);
}

/** Wait for rotating cookies, then revoke them; late readers cannot restore the profile cache. */
export function logoutBrowserSession(fetchImplementation: typeof fetch = fetch) {
  const state = requestState(fetchImplementation);
  if (!state.logout) {
    state.revision++;
    const pending = state.session;
    const current = (async () => {
      await pending?.catch(() => undefined);
      return withBrowserSessionLock(() => timedFetch(fetchImplementation, "/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }));
    })();
    state.logout = current;
    const clear = () => { if (state.logout === current) state.logout = undefined; };
    void current.then(clear, clear);
  }
  return observe(state.logout, undefined, () => true);
}
