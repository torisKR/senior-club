import { describe, expect, it } from 'vitest';

import { withObjectParticle } from './josa';

describe('withObjectParticle', () => {
  it('picks 을 after a final consonant and 를 otherwise', () => {
    expect(withObjectParticle('솔방울')).toBe('솔방울을');
    expect(withObjectParticle('표고버섯')).toBe('표고버섯을');
    expect(withObjectParticle('민들레')).toBe('민들레를');
    expect(withObjectParticle('ABC')).toBe('ABC을(를)');
  });
});
