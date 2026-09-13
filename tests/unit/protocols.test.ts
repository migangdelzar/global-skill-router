import { describe, expect, it } from 'vitest';
import type { Clock } from '../../src/ports/clock.js';
import type { FileSystem } from '../../src/ports/filesystem.js';
import type { GitHubClient } from '../../src/ports/github.js';
import type { LockLease, SourceLock } from '../../src/ports/lock.js';
import {
  FakeClock,
  FakeFileSystem,
  FakeGitHubClient,
  FakeSourceLock,
} from '../fixtures/fakes.js';

describe('protocol fakes', () => {
  it('records clock calls while satisfying the Clock protocol', () => {
    const clock: Clock = new FakeClock();

    expect(clock.now()).toBeInstanceOf(Date);
    expect(clock.random()).toBe(0.5);
    expect((clock as FakeClock).calls).toEqual(['now', 'random']);
  });

  it('records filesystem calls while satisfying the FileSystem protocol', async () => {
    const fileSystem: FileSystem = new FakeFileSystem();

    await fileSystem.mkdir('/cache');
    await fileSystem.writeText('/cache/state.json', '{}');
    expect(await fileSystem.exists('/cache/state.json')).toBe(true);
    expect(await fileSystem.readText('/cache/state.json')).toBe('{}');
    await fileSystem.copyTree('/cache', '/backup');
    await fileSystem.rename('/backup/state.json', '/backup/renamed.json');
    await fileSystem.remove('/backup/renamed.json');

    expect((fileSystem as FakeFileSystem).calls).toEqual([
      ['mkdir', '/cache'],
      ['writeText', '/cache/state.json', '{}'],
      ['exists', '/cache/state.json'],
      ['readText', '/cache/state.json'],
      ['copyTree', '/cache', '/backup'],
      ['rename', '/backup/state.json', '/backup/renamed.json'],
      ['remove', '/backup/renamed.json'],
    ]);
  });

  it('records GitHub calls while satisfying the GitHubClient protocol', async () => {
    const github: GitHubClient = new FakeGitHubClient();

    expect(await github.listReleases('owner/repo')).toEqual([]);
    expect(await github.resolveTag('owner/repo', 'v1.0.0')).toEqual({
      commitSha: 'fake-commit-sha',
    });
    expect(await github.downloadTagArchive('owner/repo', 'v1.0.0')).toEqual(
      new Uint8Array(),
    );
    expect((github as FakeGitHubClient).calls).toEqual([
      ['listReleases', 'owner/repo'],
      ['resolveTag', 'owner/repo', 'v1.0.0'],
      ['downloadTagArchive', 'owner/repo', 'v1.0.0'],
    ]);
  });

  it('records lock acquisition and release while satisfying SourceLock', async () => {
    const lock: SourceLock = new FakeSourceLock();

    const lease: LockLease = await lock.acquire('owner/repo', 'test-owner', 1000);
    await lease.release();

    expect((lock as FakeSourceLock).calls).toEqual([
      ['acquire', 'owner/repo', 'test-owner', 1000],
      ['release'],
    ]);
  });
});
