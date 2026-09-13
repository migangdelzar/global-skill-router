import { describe, expect, it } from 'vitest';
import type { ResolvedRelease, ReleaseResolver } from '../../src/domain/version.js';
import {
  metadataPathForRepo,
  type MetadataRecord,
} from '../../src/domain/cache.js';
import { MetadataCacheService, MetadataRefreshError } from '../../src/services/metadata-cache.js';
import { FileSystemSourceLock } from '../../src/services/source-lock.js';
import type { Clock } from '../../src/ports/clock.js';
import { FakeFileSystem } from '../fixtures/fakes.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

class ManualClock implements Clock {
  private current = new Date('2026-01-01T00:00:00.000Z');

  constructor(private readonly randomValue = 0.5) {}

  now(): Date {
    return new Date(this.current);
  }

  random(): number {
    return this.randomValue;
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

class StubReleaseResolver implements ReleaseResolver {
  readonly calls: string[] = [];
  error: Error | null = null;
  private readonly release: ResolvedRelease = {
    repo: 'owner/repo',
    tag: 'v2.0.0',
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    resolvedAt: '2026-01-01T00:00:00.000Z',
  };

  async resolveLatestStable(repo: string): Promise<ResolvedRelease> {
    this.calls.push(repo);
    if (this.error !== null) throw this.error;
    return { ...this.release, repo };
  }
}

function createCache(clock: Clock, fileSystem: FakeFileSystem, resolver: StubReleaseResolver) {
  return new MetadataCacheService({
    cacheRoot: '/cache',
    clock,
    fileSystem,
    resolver,
    sourceLock: new FileSystemSourceLock({
      fileSystem,
      clock,
      lockRoot: '/cache/locks',
      pollIntervalMs: 1,
    }),
    lockTimeoutMs: 1_000,
  });
}

function recordFor(repo: string, expiresAt: string): MetadataRecord {
  return {
    repo,
    release: {
      repo,
      tag: 'v1.0.0',
      commitSha: 'fedcba9876543210fedcba9876543210fedcba98',
      resolvedAt: '2025-12-01T00:00:00.000Z',
    },
    checkedAt: '2025-01-01T00:00:00.000Z',
    expiresAt,
  };
}

describe('MetadataCacheService', () => {
  it('reads fresh metadata without requesting GitHub release metadata', async () => {
    const clock = new ManualClock();
    const fileSystem = new FakeFileSystem();
    const resolver = new StubReleaseResolver();
    const record = recordFor('owner/repo', '2026-01-02T00:00:00.000Z');
    await fileSystem.mkdir('/cache/metadata');
    await fileSystem.writeText(
      metadataPathForRepo('/cache', 'owner/repo'),
      JSON.stringify(record),
    );

    const result = await createCache(clock, fileSystem, resolver).getLatest(
      'owner/repo',
      'session-a',
    );

    expect(result).toEqual(record);
    expect(resolver.calls).toEqual([]);
  });

  it('refreshes stale metadata exactly once and publishes it atomically', async () => {
    const clock = new ManualClock();
    const fileSystem = new FakeFileSystem();
    const resolver = new StubReleaseResolver();
    await fileSystem.mkdir('/cache/metadata');
    await fileSystem.writeText(
      metadataPathForRepo('/cache', 'owner/repo'),
      JSON.stringify(recordFor('owner/repo', '2025-12-31T00:00:00.000Z')),
    );

    const result = await createCache(clock, fileSystem, resolver).getLatest(
      'owner/repo',
      'session-a',
    );

    expect(result.release.tag).toBe('v2.0.0');
    expect(resolver.calls).toEqual(['owner/repo']);
    expect(fileSystem.calls.some(([method]) => method === 'rename')).toBe(true);
  });

  it.each([
    ['minimum', 0, DAY_MS - HOUR_MS],
    ['maximum', 1, DAY_MS + HOUR_MS],
  ])('sets a 24-hour TTL with bounded jitter at the %s boundary', async (_, random, expectedTtl) => {
    const clock = new ManualClock(random);
    const fileSystem = new FakeFileSystem();
    const resolver = new StubReleaseResolver();

    const result = await createCache(clock, fileSystem, resolver).getLatest(
      'owner/repo',
      'session-a',
    );

    expect(Date.parse(result.expiresAt) - Date.parse(result.checkedAt)).toBe(expectedTtl);
  });

  it('coalesces concurrent stale requests into one refresh and returns one record', async () => {
    const clock = new ManualClock();
    const fileSystem = new FakeFileSystem();
    const resolver = new StubReleaseResolver();
    await fileSystem.mkdir('/cache/metadata');
    await fileSystem.writeText(
      metadataPathForRepo('/cache', 'owner/repo'),
      JSON.stringify(recordFor('owner/repo', '2025-12-31T00:00:00.000Z')),
    );

    let allowRefresh: () => void = () => undefined;
    const refreshAllowed = new Promise<void>((resolve) => {
      allowRefresh = resolve;
    });
    let refreshStarted: () => void = () => undefined;
    const refreshHasStarted = new Promise<void>((resolve) => {
      refreshStarted = resolve;
    });
    const originalResolve = resolver.resolveLatestStable.bind(resolver);
    resolver.resolveLatestStable = async (repo) => {
      refreshStarted();
      await refreshAllowed;
      return originalResolve(repo);
    };

    const cache = createCache(clock, fileSystem, resolver);
    const first = cache.getLatest('owner/repo', 'session-a');
    await refreshHasStarted;
    const second = cache.getLatest('owner/repo', 'session-b');
    allowRefresh();

    const results = await Promise.all([first, second]);

    expect(resolver.calls).toEqual(['owner/repo']);
    expect(results[0]).toEqual(results[1]);
  });

  it('returns stale verified metadata when refresh fails', async () => {
    const clock = new ManualClock();
    const fileSystem = new FakeFileSystem();
    const resolver = new StubReleaseResolver();
    resolver.error = new Error('GitHub unavailable');
    const record = recordFor('owner/repo', '2025-12-31T00:00:00.000Z');
    await fileSystem.mkdir('/cache/metadata');
    await fileSystem.writeText(metadataPathForRepo('/cache', 'owner/repo'), JSON.stringify(record));

    await expect(createCache(clock, fileSystem, resolver).getLatest('owner/repo', 'session-a'))
      .resolves.toEqual(record);
  });

  it('does not retry a failed refresh for the same session during the negative-cache window', async () => {
    const clock = new ManualClock();
    const fileSystem = new FakeFileSystem();
    const resolver = new StubReleaseResolver();
    resolver.error = new Error('GitHub unavailable');
    const cache = createCache(clock, fileSystem, resolver);

    await expect(cache.getLatest('owner/repo', 'session-a')).rejects.toThrow(MetadataRefreshError);
    await expect(cache.getLatest('owner/repo', 'session-a')).rejects.toThrow(MetadataRefreshError);
    await expect(cache.getLatest('owner/repo', 'session-b')).rejects.toThrow(MetadataRefreshError);

    expect(resolver.calls).toEqual(['owner/repo', 'owner/repo']);
  });

  it('returns stale metadata from the negative cache without retrying GitHub', async () => {
    const clock = new ManualClock();
    const fileSystem = new FakeFileSystem();
    const resolver = new StubReleaseResolver();
    resolver.error = new Error('GitHub unavailable');
    const record = recordFor('owner/repo', '2025-12-31T00:00:00.000Z');
    await fileSystem.mkdir('/cache/metadata');
    await fileSystem.writeText(metadataPathForRepo('/cache', 'owner/repo'), JSON.stringify(record));
    const cache = createCache(clock, fileSystem, resolver);

    await expect(cache.getLatest('owner/repo', 'session-a')).resolves.toEqual(record);
    await expect(cache.getLatest('owner/repo', 'session-a')).resolves.toEqual(record);

    expect(resolver.calls).toEqual(['owner/repo']);
  });

  it('rejects metadata stored at the requested path when its repo does not match', async () => {
    const clock = new ManualClock();
    const fileSystem = new FakeFileSystem();
    const resolver = new StubReleaseResolver();
    const wrongRepoRecord = recordFor('other/repo', '2026-01-02T00:00:00.000Z');
    await fileSystem.mkdir('/cache/metadata');
    await fileSystem.writeText(
      metadataPathForRepo('/cache', 'owner/repo'),
      JSON.stringify(wrongRepoRecord),
    );

    const result = await createCache(clock, fileSystem, resolver).getLatest(
      'owner/repo',
      'session-a',
    );

    expect(result.repo).toBe('owner/repo');
    expect(resolver.calls).toEqual(['owner/repo']);
  });

  it('throws an actionable error when the first refresh fails', async () => {
    const clock = new ManualClock();
    const fileSystem = new FakeFileSystem();
    const resolver = new StubReleaseResolver();
    resolver.error = new Error('GitHub unavailable');

    await expect(createCache(clock, fileSystem, resolver).getLatest('owner/repo', 'session-a'))
      .rejects.toThrow(/Unable to refresh metadata for owner\/repo.*try again/i);
  });
});
