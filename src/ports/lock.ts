export interface SourceLock {
  acquire(key: string, owner: string, timeoutMs: number): Promise<LockLease>;
}

export interface LockLease {
  release(): Promise<void>;
}
