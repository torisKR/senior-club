import 'reflect-metadata';
import { describe, expect, it } from 'vitest';

import { parseApiEnv } from '../config/env';
import { TokenService } from './token.service';

const service = () => new TokenService(parseApiEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:5432/fixture',
}));

describe('OTP crypto compatibility', () => {
  it('generates a six-digit code accepted by challenge verification and encrypted storage', () => {
    const tokens = service();
    const code = tokens.createOtpCode();
    expect(code).toMatch(/^\d{6}$/);
    const hash = tokens.hashOtp('challenge-a', 'member@example.invalid', code);
    expect(tokens.otpMatches(hash, 'challenge-a', 'member@example.invalid', code)).toBe(true);
    expect(tokens.otpMatches(hash, 'challenge-b', 'member@example.invalid', code)).toBe(false);
    expect(tokens.otpMatches(hash, 'challenge-a', 'other@example.invalid', code)).toBe(false);
    expect(tokens.openOtp(tokens.sealOtp(code))).toBe(code);
  });

  it.each(['000000', '999999'])('preserves the full six-digit value %s in encrypted storage', (code) => {
    const tokens = service();
    expect(tokens.openOtp(tokens.sealOtp(code))).toBe(code);
  });

  it('rejects a modified authentication tag instead of returning an OTP', () => {
    const tokens = service();
    const parts = tokens.sealOtp('000001').split('.');
    const tag = parts[1]!;
    parts[1] = (tag[0] === 'A' ? 'B' : 'A') + tag.slice(1);
    expect(() => tokens.openOtp(parts.join('.'))).toThrow();
  });
});
