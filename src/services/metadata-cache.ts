import {
  isMetadataRecord,
  metadataPathForRepo,
  type MetadataCache,
  type MetadataRecord,
} from '../domain/cache.js';
import type { ReleaseResolver } from '../domain/version.js';
import type { Clock } from '../ports/clock.js';
import type { FileSystem } from '../ports/filesystem.js';
import type { SourceLock } from '../ports/lock.js';

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_JITTER_MS = 60 * 60 * 1_000;
const NEGATIVE_CACHE_MS = 60 * 1_000;

export interface MetadataCacheOptions {
  cacheRoot: string;
  clock: Clock;
  fileSystem: FileSystem;
  resolver: ReleaseResolver;
  sourceLock: SourceLock;
  lockTimeoutMs: number;
}

export class MetadataRefreshError extends Error {
  constructor(repo: string, cause: unknown) {
    super(
      `Unable to refresh metadata for ${repo}; no verified metadata is available. ` +
        'Check network access and try again.',
      { cause },
    );
    this.name = 'MetadataRefreshError';
  }
}

export class MetadataCacheService implements MetadataCache {
  private temporaryFileSequence = 0;
  private readonly negativeCache = new Map<string, number>();

  constructor(private readonly options: MetadataCacheOptions) {}

  async getLatest(repo: string, sessionId: string): Promise<MetadataRecord> {
    const current = await this.read(repo);
    if (current !== null && this.isFresh(current)) return current;
    const negativeCacheKey = `${repo}:${sessionId}`;
    const failedAt = this.negativeCache.get(negativeCacheKey);
    if (failedAt !== undefined && this.options.clock.now().getTime() - failedAt < NEGATIVE_CACHE_MS) {
      if (current !== null) return current;
      throw new MetadataRefreshError(repo, new Error('negative cache window is active'));
    }

    const lease = await this.options.sourceLock.acquire(
      `metadata:${repo}`,
      sessionId,
      this.options.lockTimeoutMs,
      sessionId,
    );

    try {
      const rechecked = await this.read(repo);
      if (rechecked !== null && this.isFresh(rechecked)) return rechecked;

      try {
        const release = await this.options.resolver.resolveLatestStable(repo);
        const checkedAt = this.options.clock.now();
        const expiresAt = new Date(
          checkedAt.getTime() + DAY_MS + this.jitterMs(),
        );
        const record: MetadataRecord = {
          repo,
          release,
          checkedAt: checkedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
        };
        await this.write(repo, record, sessionId);
        return record;
      } catch (error) {
        this.negativeCache.set(negativeCacheKey, this.options.clock.now().getTime());
        if (rechecked !== null) return rechecked;
        throw new MetadataRefreshError(repo, error);
      }
    } finally {
      await lease.release();
    }
  }

  private async read(repo: string): Promise<MetadataRecord | null> {
    const path = metadataPathForRepo(this.options.cacheRoot, repo);
    if (!(await this.options.fileSystem.exists(path))) return null;

    try {
      const value: unknown = JSON.parse(await this.options.fileSystem.readText(path));
      return isMetadataRecord(value) && value.repo === repo ? value : null;
    } catch {
      return null;
    }
  }

  private async write(
    repo: string,
    record: MetadataRecord,
    sessionId: string,
  ): Promise<void> {
    const metadataDirectory = `${this.options.cacheRoot}/metadata`;
    const path = metadataPathForRepo(this.options.cacheRoot, repo);
    const temporaryPath = `${path}.${sessionId}.${this.temporaryFileSequence++}.tmp`;
    await this.options.fileSystem.mkdir(metadataDirectory);
    await this.options.fileSystem.writeText(temporaryPath, JSON.stringify(record));
    await this.options.fileSystem.rename(temporaryPath, path);
  }

  private isFresh(record: MetadataRecord): boolean {
    return Date.parse(record.expiresAt) > this.options.clock.now().getTime();
  }

  private jitterMs(): number {
    const sampled = this.options.clock.random();
    const random = Number.isFinite(sampled)
      ? Math.min(1, Math.max(0, sampled))
      : 0.5;
    return Math.round((random * 2 - 1) * MAX_JITTER_MS);
  }
}
