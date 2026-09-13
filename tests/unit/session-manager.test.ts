import { describe, expect, it } from 'vitest';
import type { CachedArtifact } from '../../src/services/artifact-cache.js';
import { SessionManagerService } from '../../src/services/session-manager.js';
import { FakeClock, FakeFileSystem } from '../fixtures/fakes.js';

const artifact: CachedArtifact = {
  repo: 'owner/repo',
  skillPath: 'skills/demo',
  tag: 'v1.0.0',
  commitSha: '0123456789abcdef0123456789abcdef01234567',
  sha256: 'a'.repeat(64),
  objectPath: '/cache/objects/demo',
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
