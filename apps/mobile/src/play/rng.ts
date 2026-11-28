/** 시드 난수 한 걸음(mulberry32). 상태를 받아 [0,1) 값과 다음 시드를 돌려주는 순수 함수입니다. */
export function nextRandom(seed: number): { value: number; seed: number } {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let mixed = next;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return { value: ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296, seed: next };
}
