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
    const claimsDirectory = `${this.options.lockRoot}/${encodeURIComponent(key)}.claims`;
    await this.options.fileSystem.mkdir(claimsDirectory);
    let claim = await this.createClaim(claimsDirectory, key, owner, sessionId);

    while (true) {
      const claims = await this.readClaims(claimsDirectory);
      const now = this.options.clock.now().getTime();
      let removedStaleClaim = false;

      for (const candidate of claims) {
        if (now - Date.parse(candidate.createdAt) >= timeoutMs) {
          await this.options.fileSystem.removeFile(candidate.path);
          removedStaleClaim = true;
        }
      }

      if (removedStaleClaim) {
        if (!claims.some((candidate) => candidate.path === claim.path)) {
          claim = await this.createClaim(claimsDirectory, key, owner, sessionId);
        }
        continue;
      }

      const ownClaim = claims.find((candidate) => candidate.path === claim.path);
      if (ownClaim === undefined) {
        claim = await this.createClaim(claimsDirectory, key, owner, sessionId);
        continue;
      }

      const winner = [...claims].sort((left, right) => left.path.localeCompare(right.path))[0];
      if (winner?.path === claim.path) {
        return {
          release: async () => {
            await this.options.fileSystem.removeFile(claim.path);
          },
        };
      }

      await this.sleep(this.waitDuration(winner, now, timeoutMs));
    }
  }

  private async createClaim(
    claimsDirectory: string,
    key: string,
    owner: string,
    sessionId: string,
  ): Promise<ClaimRecord> {
    const token = this.newToken(owner);
    const path = `${claimsDirectory}/${token}.claim`;
    const createdAt = this.options.clock.now().toISOString();
    const content = JSON.stringify({
      key,
      owner,
      pid: this.options.processId ?? process.pid,
      sessionId,
      createdAt,
      token,
    } satisfies LockRecord);

    if (!(await this.options.fileSystem.createExclusive(path, content))) {
      return this.createClaim(claimsDirectory, key, owner, sessionId);
    }
    return { path, createdAt };
  }

  private async readClaims(claimsDirectory: string): Promise<ClaimRecord[]> {
    try {
      const claims: ClaimRecord[] = [];
      for (const entry of await this.options.fileSystem.list(claimsDirectory)) {
        const path = `${claimsDirectory}/${entry}`;
        try {
          const value: unknown = JSON.parse(await this.options.fileSystem.readText(path));
          if (isLockRecord(value)) claims.push({ path, createdAt: value.createdAt });
        } catch {
          // A concurrent stale cleanup may remove a claim after list().
        }
      }
      return claims;
    } catch {
      return [];
    }
  }

  private waitDuration(
    existing: ClaimRecord | undefined,
    now: number,
    timeoutMs: number,
  ): number {
    const pollIntervalMs = this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    if (existing === undefined) return pollIntervalMs;

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

  private newToken(owner: string): string {
    this.tokenSequence += 1;
    return `${encodeURIComponent(owner)}-${this.options.processId ?? process.pid}-${this.tokenSequence}-${randomUUID()}`;
  }
}

interface ClaimRecord {
  path: string;
  createdAt: string;
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
