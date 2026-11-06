/**
 * Storage abstraction used by the RPG save system.
 *
 * The interface is intentionally tiny and synchronous so the `RpgProvider`
 * `useState` initializer can keep restoring the save during first render,
 * exactly like the old `@/utils/storage` based implementation.
 */
export interface RpgKeyValueStorage {
  getString(key: string): string | null;
  setString(key: string, value: string): void;
}

/**
 * In-memory implementation, used by unit tests and as a last-resort fallback
 * when the SQLite database cannot be opened (we never want app start to crash).
 */
export class MemoryRpgStorage implements RpgKeyValueStorage {
  private readonly values = new Map<string, string>();

  getString(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setString(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeString(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}
