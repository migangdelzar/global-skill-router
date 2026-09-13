export interface GitHubRelease {
  tagName: string;
  publishedAt: string;
  prerelease: boolean;
  draft: boolean;
}

export interface GitHubClient {
  listReleases(repo: string): Promise<ReadonlyArray<GitHubRelease>>;
  resolveTag(repo: string, tag: string): Promise<{ commitSha: string }>;
  downloadTagArchive(repo: string, tag: string): Promise<Uint8Array>;
}
