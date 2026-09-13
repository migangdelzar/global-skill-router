import type { Clock } from '../ports/clock.js';
import type { GitHubClient } from '../ports/github.js';
import {
  MalformedReleaseError,
  NoStableReleaseError,
  type GitHubRelease,
  type ReleaseResolver,
  type ResolvedRelease,
} from '../domain/version.js';

export class ReleaseResolverService implements ReleaseResolver {
  constructor(
    private readonly github: GitHubClient,
    private readonly clock: Clock,
  ) {}

  async resolveLatestStable(repo: string): Promise<ResolvedRelease> {
    const releases = await this.github.listReleases(repo);
    const validatedReleases = this.validateReleaseList(releases);
    const stableReleases = validatedReleases
      .filter((release) => !release.draft && !release.prerelease)
      .sort(
        (left, right) =>
          Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
      );
    const selectedRelease = stableReleases[0];

    if (selectedRelease === undefined) {
      throw new NoStableReleaseError(repo);
    }

    const resolvedTag = await this.github.resolveTag(repo, selectedRelease.tagName);
    if (
      typeof resolvedTag.commitSha !== 'string' ||
      resolvedTag.commitSha.trim().length === 0
    ) {
      throw new MalformedReleaseError('resolved tag has no commit SHA');
    }

    return {
      repo,
      tag: selectedRelease.tagName,
      commitSha: resolvedTag.commitSha,
      resolvedAt: this.clock.now().toISOString(),
    };
  }

  private validateReleaseList(value: unknown): GitHubRelease[] {
    if (!Array.isArray(value)) {
      throw new MalformedReleaseError('expected an array of releases');
    }

    return value.map((release, index) => {
      if (!this.isGitHubRelease(release)) {
        throw new MalformedReleaseError(`invalid release at index ${index}`);
      }
      return release;
    });
  }

  private isGitHubRelease(value: unknown): value is GitHubRelease {
    if (typeof value !== 'object' || value === null) return false;

    const release = value as Record<string, unknown>;
    return (
      typeof release.tagName === 'string' &&
      release.tagName.trim().length > 0 &&
      typeof release.publishedAt === 'string' &&
      !Number.isNaN(Date.parse(release.publishedAt)) &&
      typeof release.draft === 'boolean' &&
      typeof release.prerelease === 'boolean'
    );
  }
}
