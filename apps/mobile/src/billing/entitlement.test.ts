import { describe, expect, it } from 'vitest';

import { decideEntitlement, type BillingProbe } from './entitlement';

const OLD = 'apjeidfnak.AO-J1Oy_OLD';
const NEW = 'apjeidfnak.AO-J1Oy_NEW';

const unavailable: BillingProbe = { status: 'unavailable' };
const ok = (...tokens: readonly string[]): BillingProbe => ({ status: 'ok', tokens });

describe('decideEntitlement', () => {
  it('does not grant ownership when Play is unreachable and nothing is stored', () => {
    expect(decideEntitlement(null, unavailable)).toEqual({ owned: false, write: 'none' });
  });

  it('keeps ownership offline when a token is already stored', () => {
    expect(decideEntitlement(OLD, unavailable)).toEqual({ owned: true, write: 'none' });
  });

  it('grants ownership from a store restore', () => {
    expect(decideEntitlement(null, ok(NEW))).toEqual({
      owned: true,
      write: { token: NEW },
    });
  });

  it('clears a stored token when Play reports no purchase', () => {
    expect(decideEntitlement(OLD, ok())).toEqual({ owned: false, write: 'clear' });
  });

  it('treats empty strings as missing tokens', () => {
    expect(decideEntitlement('', ok())).toEqual({ owned: false, write: 'none' });
    expect(decideEntitlement(null, ok(''))).toEqual({ owned: false, write: 'none' });
  });
});
