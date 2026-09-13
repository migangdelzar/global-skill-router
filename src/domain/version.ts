export interface GitHubRelease {
  tagName: string;
  publishedAt: string;
  draft: boolean;
  prerelease: boolean;
}

export interface ResolvedRelease {
  repo: string;
  tag: string;
  commitSha: string;
  resolvedAt: string;
}

export interface ReleaseResolver {
  resolveLatestStable(repo: string): Promise<ResolvedRelease>;
}

export class NoStableReleaseError extends Error {
  constructor(repo: string) {
    super(`No stable release found for ${repo}`);
    this.name = 'NoStableReleaseError';
  }
}

export class MalformedReleaseError extends Error {
  constructor(message: string) {
    super(`Malformed GitHub release response: ${message}`);
    this.name = 'MalformedReleaseError';
  }
}
