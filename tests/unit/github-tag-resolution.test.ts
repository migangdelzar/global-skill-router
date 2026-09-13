import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubReleaseClient } from '../../src/adapters/github.js';
import { GitHubToolReleaseClient } from '../../src/adapters/tooling.js';

afterEach(() => vi.unstubAllGlobals());

describe('GitHub tag resolution', () => {
  it('resolves the commit object only from an exact refs/tags response', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ref: 'refs/tags/v1.0.0', object: { sha: '0'.repeat(40), type: 'commit' },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new GitHubReleaseClient().resolveTag('owner/repo', 'v1.0.0'))
      .resolves.toEqual({ commitSha: '0'.repeat(40) });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/git/ref/tags/v1.0.0',
      expect.any(Object),
    );
  });

  it('accepts only an exact refs/tags response for skill releases', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ref: 'refs/heads/main', object: { sha: '0'.repeat(40) },
    }), { status: 200 })));

    await expect(new GitHubReleaseClient().resolveTag('owner/repo', 'v1.0.0')).resolves.toEqual({ commitSha: '' });
  });

  it('accepts only an exact refs/tags response for tool releases', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ref: 'refs/heads/main', object: { sha: '0'.repeat(40) },
    }), { status: 200 })));

    await expect(new GitHubToolReleaseClient().resolveTag('owner/repo', 'v1.0.0')).resolves.toEqual({ commitSha: '' });
  });
});
