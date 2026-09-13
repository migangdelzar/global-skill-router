import { describe, expect, it } from 'vitest';
import { artifactPath, type CachedArtifact } from '../../src/services/artifact-cache.js';
import { SessionManagerService } from '../../src/services/session-manager.js';
import { FakeClock, FakeFileSystem } from '../fixtures/fakes.js';

const artifact: CachedArtifact = {
  repo: 'owner/repo',
  skillPath: 'skills/demo',
  tag: 'v1.0.0',
  commitSha: '0123456789abcdef0123456789abcdef01234567',
  sha256: 'a'.repeat(64),
  objectPath: artifactPath('/cache', {
    repo: 'owner/repo',
    tag: 'v1.0.0',
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    resolvedAt: '2026-01-01T00:00:00.000Z',
  }, 'skills/demo'),
};

describe('SessionManagerService', () => {
  it('creates a session active directory and activates a verified shared artifact', async () => {
    const fileSystem = new FakeFileSystem();
    await fileSystem.mkdir(artifact.objectPath);
    await fileSystem.writeText(`${artifact.objectPath}.json`, JSON.stringify(artifact));
    const manager = new SessionManagerService({
      root: '/cache',
      fileSystem,
      clock: new FakeClock(),
      abandonedTtlMs: 60_000,
    });

    const active = await manager.start('session-a');
    const destination = await manager.activate('session-a', artifact);

    expect(active).toBe('/cache/sessions/session-a/active');
    expect(destination).toContain('/cache/sessions/session-a/active/');
    expect(fileSystem.calls.some(([method, from]) => method === 'copyTree' && from === `${artifact.objectPath}/${artifact.skillPath}`)).toBe(true);
    expect(fileSystem.calls.some(([method, from]) => method === 'copyTree' && from === artifact.objectPath)).toBe(false);
    expect(fileSystem.calls.filter(([method, path]) => method === 'mkdir' && typeof path === 'string' && path.includes('/sessions/')).every(([, , mode]) => Number(mode) === 0o700)).toBe(true);
  });

  it('rejects artifact metadata mismatches and preserves the shared artifact on cleanup', async () => {
    const fileSystem = new FakeFileSystem();
    await fileSystem.mkdir(artifact.objectPath);
    await fileSystem.writeText(
      `${artifact.objectPath}.json`,
      JSON.stringify({ ...artifact, commitSha: 'f'.repeat(40) }),
    );
    const manager = new SessionManagerService({
      root: '/cache',
      fileSystem,
      clock: new FakeClock(),
      abandonedTtlMs: 60_000,
    });

    await expect(manager.activate('session-a', artifact)).rejects.toThrow(/does not match/);
    await manager.cleanup('session-a');
    await expect(fileSystem.exists(artifact.objectPath)).resolves.toBe(true);
  });

  it.each([
    ['repo', { repo: 'other/repo' }],
    ['skill path', { skillPath: 'skills/other' }],
    ['tag', { tag: 'v2.0.0' }],
    ['SHA', { commitSha: 'f'.repeat(40) }],
  ])('rejects a metadata %s mismatch before activation', async (_, mismatch) => {
    const fileSystem = new FakeFileSystem();
    await fileSystem.mkdir(artifact.objectPath);
    await fileSystem.writeText(`${artifact.objectPath}.json`, JSON.stringify({ ...artifact, ...mismatch }));
    const manager = new SessionManagerService({
      root: '/cache', fileSystem, clock: new FakeClock(), abandonedTtlMs: 60_000,
    });

    await expect(manager.activate('session-a', artifact)).rejects.toThrow(/does not match/);
  });

  it.each(['../secret', '/absolute', 'C:\\secret', 'skills\\demo', 'skills/../secret'])
    ('rejects unsafe skill path %s before resolving it', async (skillPath) => {
      const fileSystem = new FakeFileSystem();
      const unsafeArtifact = { ...artifact, skillPath };
      await fileSystem.mkdir(unsafeArtifact.objectPath);
      await fileSystem.writeText(`${unsafeArtifact.objectPath}.json`, JSON.stringify(unsafeArtifact));
      const manager = new SessionManagerService({
        root: '/cache', fileSystem, clock: new FakeClock(), abandonedTtlMs: 60_000,
      });

      await expect(manager.activate('session-a', unsafeArtifact)).rejects.toThrow(/unsafe skill path/);
    });

  it('rejects a valid-looking artifact whose object path is outside the cache root', async () => {
    const fileSystem = new FakeFileSystem();
    const forgedArtifact = { ...artifact, objectPath: '/outside/secret' };
    await fileSystem.mkdir(forgedArtifact.objectPath);
    await fileSystem.writeText(
      `${forgedArtifact.objectPath}.json`,
      JSON.stringify(forgedArtifact),
    );
    const manager = new SessionManagerService({
      root: '/cache',
      fileSystem,
      clock: new FakeClock(),
      abandonedTtlMs: 60_000,
    });

    await expect(manager.activate('session-a', forgedArtifact)).rejects.toThrow(
      /does not match the canonical cache object/,
    );
    expect(fileSystem.calls.some(([method]) => method === 'copyTree')).toBe(false);
  });

  it('collects sessions older than the configured TTL', async () => {
    const fileSystem = new FakeFileSystem();
    const clock = new FakeClock();
    const manager = new SessionManagerService({
      root: '/cache',
      fileSystem,
      clock,
      abandonedTtlMs: 60_000,
    });
    await manager.start('old-session');

    const removed = await manager.collectAbandoned(new Date('2026-01-01T00:01:01.000Z'));

    expect(removed).toBe(1);
    await expect(fileSystem.exists('/cache/sessions/old-session')).resolves.toBe(false);
  });
});
