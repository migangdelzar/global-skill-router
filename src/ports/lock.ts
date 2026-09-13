export interface SourceLock {
  acquire(
    key: string,
    owner: string,
    timeoutMs: number,
    sessionId?: string,
  ): Promise<LockLease>;
}

export interface LockLease {
  release(): Promise<void>;
}
