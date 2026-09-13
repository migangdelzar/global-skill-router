import type { Clock } from '../ports/clock.js';
import type { LockLease, SourceLock } from '../ports/lock.js';

interface Waiter {
  owner: string;
  resolve: (lease: LockLease) => void;
}

interface HeldLock {
  acquiredAt: number;
  token: number;
  waiters: Waiter[];
}

export class InMemorySourceLock implements SourceLock {
  private readonly locks = new Map<string, HeldLock>();
  private nextToken = 1;

  constructor(private readonly clock: Clock) {}

  async acquire(key: string, owner: string, timeoutMs: number): Promise<LockLease> {
    const now = this.clock.now().getTime();
    const current = this.locks.get(key);

    if (current !== undefined && now - current.acquiredAt >= timeoutMs) {
      this.locks.delete(key);
      return this.hold(key, owner, now, current.waiters);
    }

    if (current === undefined) {
      return this.hold(key, owner, now, []);
    }

    return new Promise<LockLease>((resolve) => {
      current.waiters.push({ owner, resolve });
    });
  }

  private hold(
    key: string,
    owner: string,
    acquiredAt: number,
    waiters: Waiter[],
  ): LockLease {
    const token = this.nextToken++;
    this.locks.set(key, { acquiredAt, token, waiters });

    return {
      release: async () => {
        const current = this.locks.get(key);
        if (current?.token !== token) return;

        const next = current.waiters.shift();
        if (next === undefined) {
          this.locks.delete(key);
          return;
        }

        const nextLease = this.hold(
          key,
          next.owner,
          this.clock.now().getTime(),
          current.waiters,
        );
        next.resolve(nextLease);
      },
    };
  }
}
