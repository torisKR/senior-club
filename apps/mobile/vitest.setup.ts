// Node 26 exposes an undefined global localStorage without --localstorage-file,
// which masks jsdom's storage. Supply per-test-environment memory storage only
// when the browser-like environment has no usable storage of its own.
if (typeof window !== 'undefined' && typeof globalThis.localStorage === 'undefined') {
  const values = new Map<string, string>();
  const localStorage = {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key: string) { return values.get(String(key)) ?? null; },
    key(index: number) { return Array.from(values.keys())[index] ?? null; },
    removeItem(key: string) { values.delete(String(key)); },
    setItem(key: string, value: string) { values.set(String(key), String(value)); },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: localStorage });
}
