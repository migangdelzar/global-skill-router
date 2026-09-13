import type { ResolvedRelease } from './version.js';

export interface MetadataRecord {
  repo: string;
  release: ResolvedRelease;
  checkedAt: string;
  expiresAt: string;
}

export interface MetadataCache {
  getLatest(repo: string, sessionId: string): Promise<MetadataRecord>;
}

export function metadataPathForRepo(cacheRoot: string, repo: string): string {
  return `${cacheRoot}/metadata/${encodeURIComponent(repo)}.json`;
}

export function isMetadataRecord(value: unknown): value is MetadataRecord {
  if (typeof value !== 'object' || value === null) return false;

  const record = value as Record<string, unknown>;
  if (
    typeof record.repo !== 'string' ||
    typeof record.checkedAt !== 'string' ||
    typeof record.expiresAt !== 'string' ||
    !isValidDate(record.checkedAt) ||
    !isValidDate(record.expiresAt)
  ) {
    return false;
  }

  if (typeof record.release !== 'object' || record.release === null) {
    return false;
  }

  const release = record.release as Record<string, unknown>;
  return (
    release.repo === record.repo &&
    typeof release.tag === 'string' &&
    release.tag.length > 0 &&
    typeof release.commitSha === 'string' &&
    /^[0-9a-f]{40}$/i.test(release.commitSha) &&
    typeof release.resolvedAt === 'string' &&
    isValidDate(release.resolvedAt)
  );
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}
