/** 받침 유무로 을/를 고르기: '솔방울' → '솔방울을', '상추' → '상추를' */
export function withObjectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}을(를)`;
  return `${word}${code % 28 === 0 ? '를' : '을'}`;
}
