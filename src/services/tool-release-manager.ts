import { createHash, randomUUID } from 'node:crypto';
import type { FileSystem } from '../ports/filesystem.js';
import type { SourceLock } from '../ports/lock.js';
import type { ToolAsset, ToolAssetInstaller, ToolInstallResult, ToolRelease, ToolReleaseClient } from '../ports/tooling.js';

export interface ToolDefinition {
  id: 'tgrep' | 'rtk';
  repo: string;
  binaryPath: string;
}

export interface ToolReleaseManagerOptions {
  fileSystem: FileSystem;
  client: ToolReleaseClient;
  platform: string;
  architecture: string;
  versionOf(path: string): Promise<string>;
  assetInstaller: ToolAssetInstaller;
  sourceLock: SourceLock;
  lockTimeoutMs?: number;
}

export class ToolInstallError extends Error {
  constructor(message: string) {
    super(`Tool install failed: ${message}`);
    this.name = 'ToolInstallError';
  }
}

export class ToolReleaseManager {
  constructor(private readonly options: ToolReleaseManagerOptions) {}

  async install(
    definition: ToolDefinition,
    confirm: boolean,
    requestedVersion?: string,
  ): Promise<ToolInstallResult | { preview: true; release: ToolRelease; asset: ToolAsset }> {
    const release = await this.latestStable(definition.repo, requestedVersion);
    const asset = release.assets.find(
      (candidate) => candidate.platform === this.options.platform && candidate.architecture === this.options.architecture,
    );
    if (asset === undefined) {
      throw new ToolInstallError(`no ${this.options.platform}/${this.options.architecture} asset for ${definition.id}`);
    }
    if (asset.sha256 === undefined || !/^[0-9a-f]{64}$/i.test(asset.sha256)) {
      throw new ToolInstallError(`checksum is required for ${asset.name}`);
    }
    if (!confirm) return { preview: true, release, asset };

    const lease = await this.options.sourceLock.acquire(
      `tool:${definition.repo}:${definition.id}`,
      `tool-${definition.id}-${process.pid}`,
      this.options.lockTimeoutMs ?? 30_000,
      definition.id,
    );
    let temporaryPath: string | undefined;
    let temporaryMetadataPath: string | undefined;
    try {
      const bytes = await this.options.client.downloadAsset(definition.repo, release.tag, asset.name);
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (digest !== asset.sha256.toLowerCase()) throw new ToolInstallError(`checksum mismatch for ${asset.name}`);

      const token = `${Date.now()}-${randomUUID()}`;
      temporaryPath = `${definition.binaryPath}.tmp-${token}`;
      const backupPath = `${definition.binaryPath}.previous-${token}`;
      const metadataPath = `${definition.binaryPath}.json`;
      temporaryMetadataPath = `${metadataPath}.tmp-${token}`;
      const backupMetadataPath = `${metadataPath}.previous-${token}`;
      await this.installAndCheckVersion(bytes, asset.name, temporaryPath, release.tag);
      await this.options.fileSystem.writeText(temporaryMetadataPath, JSON.stringify({
        toolId: definition.id,
        repo: definition.repo,
        tag: release.tag,
        commitSha: release.commitSha,
        asset: asset.name,
        sha256: asset.sha256.toLowerCase(),
        path: definition.binaryPath,
      }));

      const hasExisting = await this.options.fileSystem.exists(definition.binaryPath);
      const hasMetadata = await this.options.fileSystem.exists(metadataPath);
      let existingWasMoved = false;
      let existingMetadataWasMoved = false;
      let binaryReplaced = false;
      let metadataReplaced = false;
      try {
        if (hasExisting) {
          await this.options.fileSystem.rename(definition.binaryPath, backupPath);
          existingWasMoved = true;
        }
        if (hasMetadata) {
          await this.options.fileSystem.rename(metadataPath, backupMetadataPath);
          existingMetadataWasMoved = true;
        }
        await this.options.fileSystem.rename(temporaryPath, definition.binaryPath);
        binaryReplaced = true;
        await this.options.fileSystem.rename(temporaryMetadataPath, metadataPath);
        metadataReplaced = true;
        return { toolId: definition.id, repo: definition.repo, tag: release.tag, asset: asset.name, path: definition.binaryPath, backupPath: hasExisting ? backupPath : null, commitSha: release.commitSha };
      } catch (error) {
        await this.rollbackPair(
          definition.binaryPath,
          metadataPath,
          backupPath,
          backupMetadataPath,
          existingWasMoved,
          existingMetadataWasMoved,
          binaryReplaced,
          metadataReplaced,
        );
        throw error;
      }
    } catch (error) {
      // The install/check phase can fail before replacement begins.
      if (temporaryPath !== undefined) await this.options.fileSystem.remove(temporaryPath);
      if (temporaryMetadataPath !== undefined) await this.options.fileSystem.remove(temporaryMetadataPath);
      throw error;
    } finally {
      await lease.release();
    }
  }

  private async installAndCheckVersion(bytes: Uint8Array, assetName: string, destination: string, tag: string): Promise<string> {
    await this.options.assetInstaller.install(bytes, assetName, destination);
    const version = await this.options.versionOf(destination);
    if (normalizeVersion(version) !== normalizeVersion(tag)) {
      throw new ToolInstallError(`version ${version} does not match ${tag}`);
    }
    return version;
  }

  private async rollbackPair(
    binaryPath: string,
    metadataPath: string,
    backupPath: string,
    backupMetadataPath: string,
    existingWasMoved: boolean,
    existingMetadataWasMoved: boolean,
    binaryReplaced: boolean,
    metadataReplaced: boolean,
  ): Promise<void> {
    if (binaryReplaced) await this.options.fileSystem.remove(binaryPath);
    if (metadataReplaced) await this.options.fileSystem.remove(metadataPath);
    if (existingWasMoved && !(await this.options.fileSystem.exists(binaryPath))) {
      await this.options.fileSystem.rename(backupPath, binaryPath);
    }
    if (existingMetadataWasMoved && !(await this.options.fileSystem.exists(metadataPath))) {
      await this.options.fileSystem.rename(backupMetadataPath, metadataPath);
    }
  }

  private async latestStable(repo: string, _requestedVersion?: string): Promise<ToolRelease & { commitSha: string }> {
    const releases = (await this.options.client.listReleases(repo))
      .filter((release) => !release.draft && !release.prerelease)
      .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
    const release = releases[0];
    if (release === undefined) throw new ToolInstallError(`no stable release found for ${repo}`);
    const resolved = await this.options.client.resolveTag(repo, release.tag);
    if (typeof resolved.commitSha !== 'string' || !/^[0-9a-f]{40}$/i.test(resolved.commitSha)) {
      throw new ToolInstallError(`release ${release.tag} does not resolve to a 40-character commit SHA`);
    }
    return { ...release, commitSha: resolved.commitSha };
  }
}

function normalizeVersion(value: string): string {
  const match = value.match(/\b\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/);
  return match?.[0] ?? value.trim().replace(/^v/, '');
}
