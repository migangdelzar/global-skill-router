import type { Clock } from '../ports/clock.js';
import type { FileSystem } from '../ports/filesystem.js';
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

export interface FileSystemSourceLockOptions {
  fileSystem: FileSystem;
  clock: Clock;
  lockRoot: string;
  pollIntervalMs: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class FileSystemSourceLock implements SourceLock {
  constructor(private readonly options: FileSystemSourceLockOptions) {}

  async acquire(
    key: string,
    owner: string,
    timeoutMs: number,
    sessionId = 'unknown',
  ): Promise<LockLease> {
    const path = `${this.options.lockRoot}/${encodeURIComponent(key)}.lock`;
    const token = `${process.pid}:${this.options.clock.now().getTime()}:${Math.random()}`;
    const content = JSON.stringify({ owner, pid: process.pid, sessionId, createdAt: this.options.clock.now().toISOString(), token });
    const sleep = this.options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
    await this.options.fileSystem.mkdir(this.options.lockRoot);

    while (true) {
      try {
        await this.options.fileSystem.createExclusive(path, content);
        return {
          release: async () => {
            try {
              const current = JSON.parse(await this.options.fileSystem.readText(path)) as { token?: string };
              if (current.token === token) await this.options.fileSystem.remove(path);
            } catch {
              // The lock was already reclaimed or removed.
            }
          },
        };
      } catch (error) {
        if ((error as { code?: string }).code !== 'EEXIST') throw error;
        const current = await this.readLock(path);
        if (current !== null && this.options.clock.now().getTime() - Date.parse(current.createdAt) >= timeoutMs) {
          await this.options.fileSystem.remove(path);
          continue;
        }
        await sleep(this.options.pollIntervalMs);
      }
    }
  }

  private async readLock(path: string): Promise<{ createdAt: string } | null> {
    try {
      const value = JSON.parse(await this.options.fileSystem.readText(path)) as { createdAt?: unknown };
      return typeof value.createdAt === 'string' ? { createdAt: value.createdAt } : null;
    } catch {
      return null;
    }
  }
}
