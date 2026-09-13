import type { GitHubRelease } from '../domain/version.js';

export type { GitHubRelease } from '../domain/version.js';

export interface GitHubClient {
  listReleases(repo: string): Promise<ReadonlyArray<GitHubRelease>>;
  resolveTag(repo: string, tag: string): Promise<{ commitSha: string }>;
  downloadTagArchive(repo: string, tag: string): Promise<Uint8Array>;
}
