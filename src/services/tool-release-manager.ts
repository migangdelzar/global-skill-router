import { createHash } from 'node:crypto';
import type { FileSystem } from '../ports/filesystem.js';
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

    const bytes = await this.options.client.downloadAsset(definition.repo, release.tag, asset.name);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== asset.sha256.toLowerCase()) throw new ToolInstallError(`checksum mismatch for ${asset.name}`);

    const temporaryPath = `${definition.binaryPath}.tmp-${Date.now()}`;
    const backupPath = `${definition.binaryPath}.previous`;
    const metadataPath = `${definition.binaryPath}.json`;
    const temporaryMetadataPath = `${metadataPath}.tmp-${Date.now()}`;
    const backupMetadataPath = `${metadataPath}.previous`;
    let existingWasMoved = false;
    let existingMetadataWasMoved = false;
    try {
      await this.options.assetInstaller.install(bytes, asset.name, temporaryPath);
      const version = await this.options.versionOf(temporaryPath);
      if (!version.includes(release.tag.replace(/^v/, ''))) {
        throw new ToolInstallError(`version ${version} does not match ${release.tag}`);
      }
      const hasExisting = await this.options.fileSystem.exists(definition.binaryPath);
      if (hasExisting) {
        await this.options.fileSystem.rename(definition.binaryPath, backupPath);
        existingWasMoved = true;
      }
      const hasMetadata = await this.options.fileSystem.exists(metadataPath);
      if (hasMetadata) {
        await this.options.fileSystem.rename(metadataPath, backupMetadataPath);
        existingMetadataWasMoved = true;
      }
      await this.options.fileSystem.rename(temporaryPath, definition.binaryPath);
      await this.options.fileSystem.writeText(temporaryMetadataPath, JSON.stringify({
        toolId: definition.id,
        repo: definition.repo,
        tag: release.tag,
        commitSha: release.commitSha,
        asset: asset.name,
        sha256: asset.sha256.toLowerCase(),
        path: definition.binaryPath,
      }));
      await this.options.fileSystem.rename(temporaryMetadataPath, metadataPath);
      return { toolId: definition.id, repo: definition.repo, tag: release.tag, asset: asset.name, path: definition.binaryPath, backupPath: hasExisting ? backupPath : null, commitSha: release.commitSha };
    } catch (error) {
      await this.options.fileSystem.remove(temporaryPath);
      await this.options.fileSystem.remove(temporaryMetadataPath);
      if (existingWasMoved) {
        try {
          if (!(await this.options.fileSystem.exists(definition.binaryPath))) {
            await this.options.fileSystem.rename(backupPath, definition.binaryPath);
          }
        } catch {
          // Preserve the original installation error. The backup remains available for manual recovery.
        }
      }
      if (existingMetadataWasMoved) {
        try {
          if (!(await this.options.fileSystem.exists(metadataPath))) {
            await this.options.fileSystem.rename(backupMetadataPath, metadataPath);
          }
        } catch {
          // Preserve the original installation error. The metadata backup remains available for manual recovery.
        }
      }
      throw error;
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
