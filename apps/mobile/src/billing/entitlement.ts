export type BillingProbe =
  | { readonly status: 'unavailable' }
  | { readonly status: 'ok'; readonly tokens: readonly string[] };

export type EntitlementDecision =
  | { readonly owned: false; readonly write: 'clear' | 'none' }
  | { readonly owned: true; readonly write: 'none' | { readonly token: string } };

function presentToken(value: string | null): string | null {
  return value === null || value === '' ? null : value;
}

/**
 * Offline store probes must never revoke a saved purchase. Revocation happens
 * only when Play answers and the product is absent (refund, cancel, account change).
 */
export function decideEntitlement(
  storedToken: string | null,
  probe: BillingProbe,
): EntitlementDecision {
  const stored = presentToken(storedToken);

  switch (probe.status) {
    case 'unavailable':
      return stored === null
        ? { owned: false, write: 'none' }
        : { owned: true, write: 'none' };

    case 'ok': {
      const reported = probe.tokens.find((token) => presentToken(token) !== null) ?? null;

      if (reported === null) {
        return stored === null
          ? { owned: false, write: 'none' }
          : { owned: false, write: 'clear' };
      }

      return stored === reported
        ? { owned: true, write: 'none' }
        : { owned: true, write: { token: reported } };
    }

    default: {
      const exhaustive: never = probe;
      throw new Error(`판정할 수 없는 BillingProbe: ${JSON.stringify(exhaustive)}`);
    }
  }
}
