/** Synchronous RPG storage; guarded writes protect a saved version and its backup. */
export type RpgGuardedWriteResult = 'written' | 'conflict' | 'backup_failed' | 'write_failed' | 'unavailable';
export interface RpgSaveBackup { key: string; value: string }
export interface RpgKeyValueStorage {
  getString(key: string): string | null;
  setString(key: string, value: string): void;
}
export interface RpgGuardedKeyValueStorage extends RpgKeyValueStorage {
  readonly supportsGuardedWrites: boolean;
  /** Unlike getString, a failed read throws instead of being mistaken for a missing save. */
  readStringStrict(key: string): string | null;
  /** Atomically check the source, verify any backup byte-for-byte, and write the replacement. */
  guardedWrite(key: string, expected: string | null, value: string, backup?: RpgSaveBackup): RpgGuardedWriteResult;
}

/** In-memory adapter for tests and the existing non-persistent last resort. */
export class MemoryRpgStorage implements RpgGuardedKeyValueStorage {
  readonly supportsGuardedWrites = true;
  private readonly values = new Map<string, string>();
  getString(key: string): string | null { return this.values.get(key) ?? null; }
  readStringStrict(key: string): string | null { return this.getString(key); }
  setString(key: string, value: string): void { this.values.set(key, value); }
  guardedWrite(key: string, expected: string | null, value: string, backup?: RpgSaveBackup): RpgGuardedWriteResult {
    if (this.readStringStrict(key) !== expected) return 'conflict';
    if (backup) {
      const existing = this.readStringStrict(backup.key);
      if (existing !== null && existing !== backup.value) return 'backup_failed';
      if (existing === null) this.setString(backup.key, backup.value);
      if (this.readStringStrict(backup.key) !== backup.value) return 'backup_failed';
    }
    if (this.readStringStrict(key) !== expected) return 'conflict';
    this.setString(key, value);
    return this.readStringStrict(key) === value ? 'written' : 'write_failed';
  }
  removeString(key: string): void { this.values.delete(key); }
  clear(): void { this.values.clear(); }
}
