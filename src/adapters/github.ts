import type { GitHubClient } from '../ports/github.js';

export class GitHubReleaseClient implements GitHubClient {
  async listReleases(repo: string) {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'global-skill-router' },
    });
    if (!response.ok) throw new Error(`GitHub releases request failed: ${response.status}`);
    const values = await response.json() as Array<Record<string, unknown>>;
    return values.map((value) => ({
      tagName: typeof value.tag_name === 'string' ? value.tag_name : '',
      publishedAt: typeof value.published_at === 'string' ? value.published_at : '',
      draft: value.draft === true,
      prerelease: value.prerelease === true,
    }));
  }

  async resolveTag(repo: string, tag: string): Promise<{ commitSha: string }> {
    const response = await fetch(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(tag)}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'global-skill-router' },
    });
    if (!response.ok) throw new Error(`GitHub tag resolution failed: ${response.status}`);
    const value = await response.json() as Record<string, unknown>;
    return { commitSha: typeof value.sha === 'string' ? value.sha : '' };
  }

  async downloadTagArchive(repo: string, tag: string): Promise<Uint8Array> {
    const response = await fetch(`https://api.github.com/repos/${repo}/tarball/${encodeURIComponent(tag)}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'global-skill-router' },
    });
    if (!response.ok) throw new Error(`GitHub archive request failed: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
}
