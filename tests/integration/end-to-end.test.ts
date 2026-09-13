import { describe, expect, it } from 'vitest';
import { ArtifactCacheService } from '../../src/services/artifact-cache.js';
import { SessionManagerService } from '../../src/services/session-manager.js';
import { FileSystemSourceLock } from '../../src/services/source-lock.js';
import type { ResolvedRelease } from '../../src/domain/version.js';
import { FakeClock, FakeFileSystem } from '../fixtures/fakes.js';
import type { ArchiveExtractor } from '../../src/ports/archive.js';

class Extractor implements ArchiveExtractor {
  async extract(): Promise<void> { return undefined; }
}

describe('global router lifecycle', () => {
  it('shares an artifact across sessions and cleans only one session', async () => {
    const fileSystem = new FakeFileSystem();
    const clock = new FakeClock();
    const release: ResolvedRelease = { repo: 'owner/repo', tag: 'v1.0.0', commitSha: '0'.repeat(40), resolvedAt: clock.now().toISOString() };
    const artifact = await new ArtifactCacheService({ cacheRoot: '/cache', fileSystem, archiveExtractor: new Extractor(), sourceLock: new FileSystemSourceLock({ fileSystem, clock, lockRoot: '/cache/locks', pollIntervalMs: 1 }), download: async () => new Uint8Array([1]), skillExists: () => true }).ensure(release, 'skills/demo');
    const sessions = new SessionManagerService({ root: '/cache', fileSystem, clock, abandonedTtlMs: 60_000 });
    await sessions.activate('session-a', artifact);
    await sessions.activate('session-b', artifact);
    await sessions.cleanup('session-a');
    await expect(fileSystem.exists(artifact.objectPath)).resolves.toBe(true);
    await expect(fileSystem.exists('/cache/sessions/session-b')).resolves.toBe(true);
  });
});
