import { describe, expect, it } from 'vitest';
import type { Clock } from '../../src/ports/clock.js';
import type { GitHubClient } from '../../src/ports/github.js';
import {
  MalformedReleaseError,
  NoStableReleaseError,
} from '../../src/domain/version.js';
import { ReleaseResolverService } from '../../src/services/release-resolver.js';

class FixedClock implements Clock {
  now(): Date {
    return new Date('2026-01-01T00:00:00.000Z');
  }

  random(): number {
    return 0.5;
  }
}

class StubGitHubClient implements GitHubClient {
  readonly calls: Array<readonly [string, ...string[]]> = [];

  constructor(
    private readonly releases: unknown,
    private readonly commitSha = '0123456789abcdef0123456789abcdef01234567',
  ) {}

  async listReleases(repo: string) {
    this.calls.push(['listReleases', repo]);
    return this.releases as Awaited<ReturnType<GitHubClient['listReleases']>>;
  }

  async resolveTag(repo: string, tag: string) {
    this.calls.push(['resolveTag', repo, tag]);
    return { commitSha: this.commitSha };
  }

  async downloadTagArchive(repo: string, tag: string) {
    this.calls.push(['downloadTagArchive', repo, tag]);
    return new Uint8Array();
  }
}

describe('ReleaseResolverService', () => {
  it('selects the newest published stable release and resolves its tag', async () => {
    const github = new StubGitHubClient([
      {
        tagName: 'v1.0.0',
        publishedAt: '2025-01-01T00:00:00.000Z',
        draft: false,
        prerelease: false,
      },
      {
        tagName: 'v2.0.0-rc.1',
        publishedAt: '2026-01-01T00:00:00.000Z',
        draft: false,
        prerelease: true,
      },
      {
        tagName: 'v1.1.0',
        publishedAt: '2025-06-01T00:00:00.000Z',
        draft: false,
        prerelease: false,
      },
      {
        tagName: 'v0.9.0',
        publishedAt: '2025-12-01T00:00:00.000Z',
        draft: true,
        prerelease: false,
      },
    ]);
    const resolver = new ReleaseResolverService(github, new FixedClock());

    await expect(resolver.resolveLatestStable('owner/repo')).resolves.toEqual({
      repo: 'owner/repo',
      tag: 'v1.1.0',
      commitSha: '0123456789abcdef0123456789abcdef01234567',
      resolvedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(github.calls).toEqual([
      ['listReleases', 'owner/repo'],
      ['resolveTag', 'owner/repo', 'v1.1.0'],
    ]);
  });

  it('throws when the repository has no stable release', async () => {
    const github = new StubGitHubClient([
      {
        tagName: 'v2.0.0-rc.1',
        publishedAt: '2026-01-01T00:00:00.000Z',
        draft: false,
        prerelease: true,
      },
      {
        tagName: 'v1.0.0',
        publishedAt: '2025-01-01T00:00:00.000Z',
        draft: true,
        prerelease: false,
      },
    ]);
    const resolver = new ReleaseResolverService(github, new FixedClock());

    await expect(resolver.resolveLatestStable('owner/repo')).rejects.toBeInstanceOf(
      NoStableReleaseError,
    );
  });

  it('rejects an empty or malformed tag response', async () => {
    const github = new StubGitHubClient([
      {
        tagName: '',
        publishedAt: '2026-01-01T00:00:00.000Z',
        draft: false,
        prerelease: false,
      },
    ]);
    const resolver = new ReleaseResolverService(github, new FixedClock());

    await expect(resolver.resolveLatestStable('owner/repo')).rejects.toBeInstanceOf(
      MalformedReleaseError,
    );
  });

  it('rejects a malformed release list response', async () => {
    const github = new StubGitHubClient({ tagName: 'v1.0.0' });
    const resolver = new ReleaseResolverService(github, new FixedClock());

    await expect(resolver.resolveLatestStable('owner/repo')).rejects.toBeInstanceOf(
      MalformedReleaseError,
    );
  });

  it('never downloads an archive while resolving a release', async () => {
    const github = new StubGitHubClient([
      {
        tagName: 'v1.0.0',
        publishedAt: '2026-01-01T00:00:00.000Z',
        draft: false,
        prerelease: false,
      },
    ]);
    const resolver = new ReleaseResolverService(github, new FixedClock());

    await resolver.resolveLatestStable('owner/repo');

    expect(github.calls.some(([method]) => method === 'downloadTagArchive')).toBe(false);
  });
});
