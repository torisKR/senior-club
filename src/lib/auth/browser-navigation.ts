import { continuationDestination } from "./continue-destination";

/** Cookie changes must reach fresh SSR, without a previously prefetched redirect. */
export function navigateAfterSessionRestore(destination: string) {
  window.location.replace(continuationDestination(destination));
}
