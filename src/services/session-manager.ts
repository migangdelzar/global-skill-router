import type { CachedArtifact } from './artifact-cache.js';
import { sessionActivePath, sessionRoot, type SessionRecord } from '../domain/session.js';
import type { Clock } from '../ports/clock.js';
import type { FileSystem } from '../ports/filesystem.js';

export interface SessionManagerOptions {
  root: string;
  fileSystem: FileSystem;
  clock: Clock;
  abandonedTtlMs: number;
}

export class SessionIntegrityError extends Error {
  constructor(message: string) {
    super(`Invalid session artifact: ${message}`);
    this.name = 'SessionIntegrityError';
  }
}

export class SessionManagerService {
  constructor(private readonly options: SessionManagerOptions) {}

  async start(sessionId: string): Promise<string> {
    validateSessionId(sessionId);
    const root = sessionRoot(this.options.root, sessionId);
    const active = sessionActivePath(this.options.root, sessionId);
    await this.options.fileSystem.mkdir(root, 0o700);
    await this.options.fileSystem.mkdir(active, 0o700);
    const record: SessionRecord = {
      sessionId,
      startedAt: this.options.clock.now().toISOString(),
    };
    await this.options.fileSystem.writeText(`${root}/session.json`, JSON.stringify(record));
    return active;
  }

  async activate(sessionId: string, artifact: CachedArtifact): Promise<string> {
    validateSessionId(sessionId);
    validateSkillPath(artifact.skillPath);
    const metadataPath = `${artifact.objectPath}.json`;
    if (!(await this.options.fileSystem.exists(metadataPath))) {
      throw new SessionIntegrityError('shared artifact metadata is missing');
    }
    const metadata = JSON.parse(await this.options.fileSystem.readText(metadataPath)) as Partial<CachedArtifact>;
    if (
      metadata.commitSha !== artifact.commitSha ||
      metadata.objectPath !== artifact.objectPath ||
      metadata.sha256 !== artifact.sha256 ||
      metadata.repo !== artifact.repo ||
      metadata.skillPath !== artifact.skillPath ||
      metadata.tag !== artifact.tag
    ) {
      throw new SessionIntegrityError('artifact metadata does not match the shared object');
    }

    const active = await this.startIfMissing(sessionId);
    const name = `${encodeURIComponent(artifact.repo)}-${encodeURIComponent(artifact.skillPath)}`;
    const destination = `${active}/${name}`;
    await this.options.fileSystem.copyTree(`${artifact.objectPath}/${artifact.skillPath}`, destination);
    return destination;
  }

  async cleanup(sessionId: string): Promise<void> {
    validateSessionId(sessionId);
    await this.options.fileSystem.remove(sessionRoot(this.options.root, sessionId));
  }

  async collectAbandoned(now: Date): Promise<number> {
    const sessionsPath = `${this.options.root}/sessions`;
    const ids = await this.options.fileSystem.list(sessionsPath);
    let removed = 0;
    for (const sessionId of ids) {
      const recordPath = `${sessionRoot(this.options.root, sessionId)}/session.json`;
      if (!(await this.options.fileSystem.exists(recordPath))) continue;
      try {
        const record = JSON.parse(await this.options.fileSystem.readText(recordPath)) as SessionRecord;
        if (now.getTime() - Date.parse(record.startedAt) >= this.options.abandonedTtlMs) {
          await this.cleanup(sessionId);
          removed += 1;
        }
      } catch {
        // Corrupt session state is left for manual inspection.
      }
    }
    return removed;
  }

  private async startIfMissing(sessionId: string): Promise<string> {
    const active = sessionActivePath(this.options.root, sessionId);
    if (!(await this.options.fileSystem.exists(active))) await this.start(sessionId);
    return active;
  }
}

function validateSessionId(sessionId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sessionId)) {
    throw new SessionIntegrityError(`unsafe session id ${sessionId}`);
  }
}

function validateSkillPath(skillPath: string): void {
  if (
    skillPath.length === 0 ||
    skillPath.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(skillPath) ||
    skillPath.includes('\\') ||
    skillPath.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new SessionIntegrityError(`unsafe skill path ${skillPath}`);
  }
}
