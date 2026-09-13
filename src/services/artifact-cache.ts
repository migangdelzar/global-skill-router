import { createHash } from 'node:crypto';
import type { ResolvedRelease } from '../domain/version.js';
import type { ArchiveExtractor } from '../ports/archive.js';
import type { FileSystem } from '../ports/filesystem.js';
import type { LockLease, SourceLock } from '../ports/lock.js';

export interface CachedArtifact {
  repo: string;
  skillPath: string;
  tag: string;
  commitSha: string;
  sha256: string;
  objectPath: string;
}

export interface ArtifactCacheOptions {
  cacheRoot: string;
  fileSystem: FileSystem;
  archiveExtractor: ArchiveExtractor;
  sourceLock: SourceLock;
  download(repo: string, tag: string): Promise<Uint8Array>;
  skillExists(path: string, skillPath: string): Promise<boolean> | boolean;
  lockTimeoutMs?: number;
}

export class ArtifactValidationError extends Error {
  constructor(message: string) {
    super(`Invalid release artifact: ${message}`);
    this.name = 'ArtifactValidationError';
  }
}

export class ArtifactCacheService {
  private temporarySequence = 0;

  constructor(private readonly options: ArtifactCacheOptions) {}

  async ensure(release: ResolvedRelease, skillPath: string): Promise<CachedArtifact> {
    validateSkillPath(skillPath);
    validateCommitSha(release.commitSha);
    const objectPath = artifactPath(this.options.cacheRoot, release, skillPath);
    const metadataPath = `${objectPath}.json`;
    const lease = await this.options.sourceLock.acquire(
      `artifact:${release.repo}:${release.commitSha}`,
      `artifact-${this.temporarySequence}`,
      this.options.lockTimeoutMs ?? 30_000,
    );

    try {
      const existing = await this.readExisting(metadataPath, release, skillPath, objectPath);
      if (existing !== null) return existing;

      const temporaryPath = `${objectPath}.tmp-${this.temporarySequence++}`;
      await this.options.fileSystem.mkdir(temporaryPath, 0o700);
      try {
        const archive = await this.options.download(release.repo, release.tag);
        const sha256 = createHash('sha256').update(archive).digest('hex');
        await this.options.archiveExtractor.extract(archive, temporaryPath);
        if (!(await this.options.skillExists(temporaryPath, skillPath))) {
          throw new ArtifactValidationError(`missing ${skillPath}/SKILL.md`);
        }

        const artifact: CachedArtifact = {
          repo: release.repo,
          skillPath,
          tag: release.tag,
          commitSha: release.commitSha,
          sha256,
          objectPath,
        };
        const temporaryMetadataPath = `${metadataPath}.tmp-${this.temporarySequence++}`;
        await this.options.fileSystem.writeText(temporaryMetadataPath, JSON.stringify(artifact));
        await this.options.fileSystem.rename(temporaryMetadataPath, metadataPath);
        await this.options.fileSystem.rename(temporaryPath, objectPath);
        return artifact;
      } catch (error) {
        await this.options.fileSystem.remove(temporaryPath);
        throw error;
      }
    } finally {
      await lease.release();
    }
  }

  private async readExisting(
    metadataPath: string,
    release: ResolvedRelease,
    skillPath: string,
    expectedObjectPath: string,
  ): Promise<CachedArtifact | null> {
    if (!(await this.options.fileSystem.exists(metadataPath))) return null;
    try {
      const value: unknown = JSON.parse(await this.options.fileSystem.readText(metadataPath));
      if (!isCachedArtifact(value)) return null;
      if (
        value.repo !== release.repo ||
        value.skillPath !== skillPath ||
        value.tag !== release.tag ||
        value.commitSha.toLowerCase() !== release.commitSha.toLowerCase() ||
        value.objectPath !== expectedObjectPath
      ) return null;
      if (!(await this.options.fileSystem.exists(value.objectPath))) return null;
      return value;
    } catch {
      return null;
    }
  }
}

export function artifactPath(
  cacheRoot: string,
  release: ResolvedRelease,
  skillPath: string,
): string {
  validateCommitSha(release.commitSha);
  return `${cacheRoot}/objects/${encodeURIComponent(release.repo)}-${encodeURIComponent(skillPath)}-${release.commitSha}`;
}

function validateSkillPath(skillPath: string): void {
  if (
    skillPath.length === 0 ||
    skillPath.startsWith('/') ||
    skillPath.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new ArtifactValidationError(`unsafe skill path ${skillPath}`);
  }
}

function validateCommitSha(commitSha: string): void {
  if (!/^[0-9a-f]{40}$/i.test(commitSha)) {
    throw new ArtifactValidationError(`unsafe commit SHA ${commitSha}`);
  }
}

function isCachedArtifact(value: unknown): value is CachedArtifact {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.repo === 'string' &&
    typeof record.skillPath === 'string' &&
    typeof record.tag === 'string' &&
    typeof record.commitSha === 'string' &&
    /^[0-9a-f]{40}$/i.test(record.commitSha) &&
    typeof record.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(record.sha256) &&
    typeof record.objectPath === 'string'
  );
}
