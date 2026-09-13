import { describe, expect, it } from 'vitest';
import type { ResolvedRelease } from '../../src/domain/version.js';
import { ArtifactCacheService } from '../../src/services/artifact-cache.js';
import { FakeFileSystem } from '../fixtures/fakes.js';
import type { ArchiveExtractor } from '../../src/ports/archive.js';
import type { SourceLock } from '../../src/ports/lock.js';

const release: ResolvedRelease = {
  repo: 'owner/repo',
  tag: 'v1.2.3',
  commitSha: '0123456789abcdef0123456789abcdef01234567',
  resolvedAt: '2026-01-01T00:00:00.000Z',
};

class FakeArchiveExtractor implements ArchiveExtractor {
  readonly calls: Array<readonly [Uint8Array, string]> = [];
  skillExists = true;

  async extract(archive: Uint8Array, destination: string): Promise<void> {
    this.calls.push([archive, destination]);
  }
}

class FakeLock implements SourceLock {
  calls: string[] = [];

  async acquire(key: string): Promise<{ release(): Promise<void> }> {
    this.calls.push(key);
    return { release: async () => undefined };
  }
}

describe('ArtifactCacheService', () => {
  it('accepts a root skill path and validates the repository root SKILL.md', async () => {
    const fileSystem = new FakeFileSystem();
    const extractor = new FakeArchiveExtractor();
    let checkedPath: string | undefined;

    const result = await new ArtifactCacheService({
      cacheRoot: '/cache',
      fileSystem,
      archiveExtractor: extractor,
      sourceLock: new FakeLock(),
      download: async () => new Uint8Array([1, 2, 3]),
      skillExists: (root, skillPath) => {
        checkedPath = `${root}/${skillPath}/SKILL.md`;
        return true;
      },
    }).ensure(release, '.');

    expect(result.skillPath).toBe('.');
    expect(checkedPath).toBe(`${result.objectPath}.tmp-0/./SKILL.md`);
  });

  it('downloads the exact tag and publishes an artifact after skill validation', async () => {
    const fileSystem = new FakeFileSystem();
    const extractor = new FakeArchiveExtractor();
    const lock = new FakeLock();
    const result = await new ArtifactCacheService({
      cacheRoot: '/cache',
      fileSystem,
      archiveExtractor: extractor,
      sourceLock: lock,
      download: async (repo, tag) => {
        expect(repo).toBe('owner/repo');
        expect(tag).toBe('v1.2.3');
        return new Uint8Array([1, 2, 3]);
      },
      skillExists: () => extractor.skillExists,
    }).ensure(release, 'skills/demo');

    expect(result.repo).toBe('owner/repo');
    expect(result.skillPath).toBe('skills/demo');
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(extractor.calls).toHaveLength(1);
    expect(lock.calls).toEqual(['artifact:owner/repo:0123456789abcdef0123456789abcdef01234567']);
    expect(fileSystem.calls.some(([method]) => method === 'rename')).toBe(true);
    expect(fileSystem.calls.some(([method, path, mode]) => method === 'mkdir' && path === `${result.objectPath}.tmp-0` && Number(mode) === 0o700)).toBe(true);
  });

  it('reuses an existing immutable artifact without downloading', async () => {
    const fileSystem = new FakeFileSystem();
    const extractor = new FakeArchiveExtractor();
    let downloadCalls = 0;
    const cache = new ArtifactCacheService({
      cacheRoot: '/cache',
      fileSystem,
      archiveExtractor: extractor,
      sourceLock: new FakeLock(),
      download: async () => {
        downloadCalls += 1;
        return new Uint8Array([1]);
      },
      skillExists: () => true,
    });

    await cache.ensure(release, 'skills/demo');
    const second = await cache.ensure(release, 'skills/demo');

    expect(downloadCalls).toBe(1);
    expect(second.objectPath).toBeTruthy();
  });

  it('rejects an archive without the requested SKILL.md', async () => {
    const extractor = new FakeArchiveExtractor();
    extractor.skillExists = false;

    await expect(
      new ArtifactCacheService({
        cacheRoot: '/cache',
        fileSystem: new FakeFileSystem(),
        archiveExtractor: extractor,
        sourceLock: new FakeLock(),
        download: async () => new Uint8Array([1]),
        skillExists: () => extractor.skillExists,
      }).ensure(release, 'skills/demo'),
    ).rejects.toThrow(/SKILL\.md/);
  });

  it('does not reuse metadata for another repository or redirecting object', async () => {
    const fileSystem = new FakeFileSystem();
    let downloads = 0;
    const cache = new ArtifactCacheService({
      cacheRoot: '/cache',
      fileSystem,
      archiveExtractor: new FakeArchiveExtractor(),
      sourceLock: new FakeLock(),
      download: async () => {
        downloads += 1;
        return new Uint8Array([1]);
      },
      skillExists: () => true,
    });

    const first = await cache.ensure(release, 'skills/demo');
    await fileSystem.writeText(`${first.objectPath}.json`, JSON.stringify({ ...first, repo: 'other/repo', objectPath: '/cache/objects/redirect' }));
    await fileSystem.mkdir('/cache/objects/redirect');

    const second = await cache.ensure(release, 'skills/demo');

    expect(downloads).toBe(2);
    expect(second.repo).toBe(release.repo);
    expect(second.objectPath).toBe(first.objectPath);
  });

  it('rejects a release with an unsafe commit SHA before touching the cache', async () => {
    const fileSystem = new FakeFileSystem();
    const unsafeRelease = { ...release, commitSha: 'main' };

    await expect(new ArtifactCacheService({
      cacheRoot: '/cache',
      fileSystem,
      archiveExtractor: new FakeArchiveExtractor(),
      sourceLock: new FakeLock(),
      download: async () => new Uint8Array([1]),
      skillExists: () => true,
    }).ensure(unsafeRelease, 'skills/demo')).rejects.toThrow(/commit SHA/i);
  });
});
