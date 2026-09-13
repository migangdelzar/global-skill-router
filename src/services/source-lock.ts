import { randomUUID } from 'node:crypto';
import type { Clock } from '../ports/clock.js';
import type { FileSystem } from '../ports/filesystem.js';
import type { LockLease, SourceLock } from '../ports/lock.js';

interface LockRecord {
  key: string;
  owner: string;
  pid: number;
  sessionId: string;
  createdAt: string;
  token: string;
}

interface InMemoryWaiter {
  owner: string;
  resolve: (lease: LockLease) => void;
}

export interface FileSystemSourceLockOptions {
  fileSystem: FileSystem;
  clock: Clock;
  lockRoot: string;
  pollIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  processId?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 100;

/**
 * @deprecated Use FileSystemSourceLock in application wiring. This adapter is
 * retained for isolated tests and backwards compatibility only.
 */
export class InMemorySourceLock implements SourceLock {
  private readonly locks = new Map<string, { acquiredAt: number; token: number; waiters: InMemoryWaiter[] }>();
  private nextToken = 1;

  constructor(private readonly clock: Clock) {}

  async acquire(key: string, owner: string, timeoutMs: number): Promise<LockLease> {
    const now = this.clock.now().getTime();
    const current = this.locks.get(key);
    if (current !== undefined && now - current.acquiredAt >= timeoutMs) {
      this.locks.delete(key);
      return this.hold(key, owner, now, current.waiters);
    }
    if (current === undefined) return this.hold(key, owner, now, []);
    return new Promise<LockLease>((resolve) => current.waiters.push({ owner, resolve }));
  }

  private hold(
    key: string,
    owner: string,
    acquiredAt: number,
    waiters: InMemoryWaiter[],
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
        next.resolve(this.hold(key, next.owner, this.clock.now().getTime(), current.waiters));
      },
    };
  }
}

export class FileSystemSourceLock implements SourceLock {
  private tokenSequence = 0;

  constructor(private readonly options: FileSystemSourceLockOptions) {}

  async acquire(
    key: string,
    owner: string,
    timeoutMs: number,
    sessionId = owner,
  ): Promise<LockLease> {
    const lockDirectory = `${this.options.lockRoot}/${encodeURIComponent(key)}.lock`;
    const token = this.newToken();
    const tokenPath = `${lockDirectory}/${token}.lock`;
    const content = JSON.stringify({
      key,
      owner,
      pid: this.options.processId ?? process.pid,
      sessionId,
      createdAt: this.options.clock.now().toISOString(),
      token,
    } satisfies LockRecord);
    await this.options.fileSystem.mkdir(this.options.lockRoot);

    while (true) {
      if (await this.options.fileSystem.createExclusiveDirectory(lockDirectory)) {
        if (!(await this.tryCreate(tokenPath, content))) {
          throw new Error(`Unable to create lock lease for ${key}`);
        }
        return {
          release: async () => {
            await this.options.fileSystem.removeFile(tokenPath);
            await this.options.fileSystem.removeEmptyDirectory(lockDirectory);
          },
        };
      }

      const existing = await this.readLock(lockDirectory);
      const now = this.options.clock.now().getTime();
      if (existing !== null && now - Date.parse(existing.createdAt) >= timeoutMs) {
        const reclaimed = await this.options.fileSystem.removeFile(existing.path);
        await this.options.fileSystem.removeEmptyDirectory(lockDirectory);
        if (reclaimed) continue;
      }

      await this.sleep(this.waitDuration(existing, now, timeoutMs));
    }
  }

  private async tryCreate(path: string, content: string): Promise<boolean> {
    try {
      return await this.options.fileSystem.createExclusive(path, content);
    } catch (error) {
      if ((error as { code?: string }).code === 'EEXIST') return false;
      throw error;
    }
  }

  private async readLock(
    lockDirectory: string,
  ): Promise<{ path: string; createdAt: string } | null> {
    try {
      for (const entry of await this.options.fileSystem.list(lockDirectory)) {
        const path = `${lockDirectory}/${entry}`;
        const value: unknown = JSON.parse(await this.options.fileSystem.readText(path));
        if (isLockRecord(value)) return { path, createdAt: value.createdAt };
      }
      return null;
    } catch {
      return null;
    }
  }

  private waitDuration(
    existing: { createdAt: string } | null,
    now: number,
    timeoutMs: number,
  ): number {
    const pollIntervalMs = this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    if (existing === null) return pollIntervalMs;

    const age = Math.max(0, now - Date.parse(existing.createdAt));
    const remaining = Math.max(1, timeoutMs - age);
    return Math.min(pollIntervalMs, remaining);
  }

  private async sleep(milliseconds: number): Promise<void> {
    if (this.options.sleep !== undefined) {
      await this.options.sleep(milliseconds);
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  }

  private newToken(): string {
    this.tokenSequence += 1;
    return `${this.options.processId ?? process.pid}-${this.tokenSequence}-${randomUUID()}`;
  }
}

function isLockRecord(value: unknown): value is LockRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.key === 'string' &&
    typeof record.owner === 'string' &&
    typeof record.pid === 'number' &&
    Number.isInteger(record.pid) &&
    typeof record.sessionId === 'string' &&
    typeof record.createdAt === 'string' &&
    !Number.isNaN(Date.parse(record.createdAt)) &&
    typeof record.token === 'string' &&
    record.token.length > 0
  );
}
