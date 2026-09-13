import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCliFromDisk } from '../../src/cli/main.js';
import { ArtifactCacheService } from '../../src/services/artifact-cache.js';
import { SessionManagerService } from '../../src/services/session-manager.js';
import { FileSystemSourceLock } from '../../src/services/source-lock.js';
import type { ResolvedRelease } from '../../src/domain/version.js';
import { FakeClock, FakeFileSystem } from '../fixtures/fakes.js';
import type { ArchiveExtractor } from '../../src/ports/archive.js';
import type { GitHubClient } from '../../src/ports/github.js';

class Extractor implements ArchiveExtractor {
  async extract(): Promise<void> { return undefined; }
}

class DiskExtractor implements ArchiveExtractor {
  constructor(private readonly fileSystem: FakeFileSystem) {}

  async extract(_archive: Uint8Array, destination: string): Promise<void> {
    await this.fileSystem.mkdir(`${destination}/skills/demo`);
    await this.fileSystem.writeText(`${destination}/skills/demo/SKILL.md`, 'selected');
    await this.fileSystem.mkdir(`${destination}/sibling`);
    await this.fileSystem.writeText(`${destination}/sibling/SKILL.md`, 'dormant');
  }
}

class DiskGitHub implements GitHubClient {
  readonly calls: string[] = [];

  async listReleases(repo: string) {
    this.calls.push(`listReleases:${repo}`);
    return [{ tagName: 'v1.0.0', publishedAt: '2026-01-01T00:00:00.000Z', draft: false, prerelease: false, repo }];
  }

  async resolveTag(repo: string, tag: string) {
    this.calls.push(`resolveTag:${repo}:${tag}`);
    return { commitSha: '0123456789abcdef0123456789abcdef01234567' };
  }

  async downloadTagArchive(repo: string, tag: string) {
    this.calls.push(`downloadTagArchive:${repo}:${tag}`);
    return new Uint8Array([1, 2, 3]);
  }
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

  it('runs the disk composition through install and clean without leaking dormant skills', async () => {
    const fileSystem = new FakeFileSystem();
    const clock = new FakeClock();
    const home = await mkdtemp(join(tmpdir(), 'skill-router-hardening-'));
    const catalogPath = join(home, 'catalog.yaml');
    await writeFile(catalogPath, `
skills:
  - id: demo
    category: primary
    source: owner/repo
    skill_path: skills/demo
    use_when: [demo]
    activation: automatic
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
`, 'utf8');

    const install = await runCliFromDisk(['install', 'demo', '--confirm', '--session', 'session-a'], catalogPath, {
      cacheRoot: '/cache',
      fileSystem,
      clock,
      github: new DiskGitHub(),
      archiveExtractor: new DiskExtractor(fileSystem),
    });

    expect(install.code).toBe(0);
    const activeRoot = '/cache/sessions/session-a/active/owner%2Frepo-skills%2Fdemo';
    await expect(fileSystem.exists(`${activeRoot}/SKILL.md`)).resolves.toBe(true);
    await expect(fileSystem.exists(`${activeRoot}/sibling/SKILL.md`)).resolves.toBe(false);

    const use = await runCliFromDisk(['use', 'demo', '--session', 'session-b'], catalogPath, {
      cacheRoot: '/cache', fileSystem, clock, github: new DiskGitHub(), archiveExtractor: new DiskExtractor(fileSystem),
    });
    expect(use.code).toBe(0);
    await expect(fileSystem.exists('/cache/sessions/session-b/active/owner%2Frepo-skills%2Fdemo/SKILL.md')).resolves.toBe(true);

    const previewClean = await runCliFromDisk(['clean', '--session', 'session-a'], catalogPath, {
      cacheRoot: '/cache',
      fileSystem,
      clock,
      github: new DiskGitHub(),
      archiveExtractor: new DiskExtractor(fileSystem),
    });

    expect(previewClean.code).toBe(2);
    await expect(fileSystem.exists('/cache/sessions/session-a')).resolves.toBe(true);

    const clean = await runCliFromDisk(['clean', '--session', 'session-a', '--confirm'], catalogPath, {
      cacheRoot: '/cache',
      fileSystem,
      clock,
      github: new DiskGitHub(),
      archiveExtractor: new DiskExtractor(fileSystem),
    });

    expect(clean.code).toBe(0);
    await expect(fileSystem.exists('/cache/sessions/session-a')).resolves.toBe(false);
    await expect(fileSystem.exists('/cache/objects/owner%2Frepo-skills%2Fdemo-0123456789abcdef0123456789abcdef01234567')).resolves.toBe(true);
  });

  it('checks release metadata without downloading or activating an artifact', async () => {
    const fileSystem = new FakeFileSystem();
    const clock = new FakeClock();
    const home = await mkdtemp(join(tmpdir(), 'skill-router-check-updates-'));
    const catalogPath = join(home, 'catalog.yaml');
    await writeFile(catalogPath, `
skills:
  - id: demo
    category: primary
    source: owner/repo
    skill_path: skills/demo
    use_when: [demo]
    activation: automatic
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
`, 'utf8');
    const github = new DiskGitHub();

    const result = await runCliFromDisk(['check-updates', '--session', 'session-check'], catalogPath, {
      cacheRoot: '/cache',
      fileSystem,
      clock,
      github,
    });

    expect(result.code).toBe(0);
    expect(result.output).toBe(
      'demo: latest v1.0.0 from owner/repo (0123456789abcdef0123456789abcdef01234567)',
    );
    expect(github.calls).toEqual(['listReleases:owner/repo', 'resolveTag:owner/repo:v1.0.0']);
    await expect(fileSystem.exists('/cache/sessions/session-check/active')).resolves.toBe(false);
    await expect(fileSystem.exists('/cache/objects/owner%2Frepo-skills%2Fdemo-0123456789abcdef0123456789abcdef01234567')).resolves.toBe(false);
  });
});
