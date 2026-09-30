import { describe, expect, it } from 'vitest';

import { hasVerifiedPhone, normalizeContactPhone, samePhoneNumber } from './phone-number';

describe('optional contact phone', () => {
  it.each(['', '  ', '() -'])('clears empty contact %j explicitly', (value) => {
    expect(normalizeContactPhone(value)).toBeNull();
  });
  it.each(['01012345678', '010-1234-5678', '010 1234 5678', '(010) 1234-5678', '+82 10-1234-5678'])('normalizes %s for native Firebase and backend', (value) => {
    expect(normalizeContactPhone(value)).toBe('+821012345678');
  });
  it('supports international contact numbers', () => expect(normalizeContactPhone('+1 (212) 555-0123')).toBe('+12125550123'));
  it.each(['---010--', '010-123-45', '010abcdef12345678', '+820101234567890123', '010-1234-5678 ext 2', '+00000000000'])('rejects malformed phone %s', (value) => {
    expect(() => normalizeContactPhone(value)).toThrow();
  });
  it('compares normalized phone identities without counting missing values as verified', () => {
    expect(samePhoneNumber('010-1234-5678', '+821012345678')).toBe(true);
    expect(samePhoneNumber(null, undefined)).toBe(false);
    expect(samePhoneNumber('invalid', 'invalid')).toBe(false);
  });
  it('requires both a saved number and a valid server verification timestamp', () => {
    expect(hasVerifiedPhone({ phoneNumber: '+821012345678' })).toBe(false);
    expect(hasVerifiedPhone({ phoneNumber: '+821012345678', phoneVerifiedAt: null })).toBe(false);
    expect(hasVerifiedPhone({ phoneNumber: '+821012345678', phoneVerifiedAt: 'invalid' })).toBe(false);
    expect(hasVerifiedPhone({ phoneNumber: null, phoneVerifiedAt: '2026-09-30T01:00:00Z' })).toBe(false);
    expect(hasVerifiedPhone({ phoneNumber: '+821012345678', phoneVerifiedAt: '2026-09-30T01:00:00Z' })).toBe(true);
  });
});
