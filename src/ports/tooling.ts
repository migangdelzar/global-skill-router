export interface ToolAsset {
  name: string;
  platform: string;
  architecture: string;
  sha256?: string;
}

export interface ToolRelease {
  repo: string;
  tag: string;
  publishedAt: string;
  draft: boolean;
  prerelease: boolean;
  assets: readonly ToolAsset[];
  commitSha?: string;
}

export interface ToolReleaseClient {
  listReleases(repo: string): Promise<readonly ToolRelease[]>;
  resolveTag(repo: string, tag: string): Promise<{ commitSha: string }>;
  downloadAsset(repo: string, tag: string, assetName: string): Promise<Uint8Array>;
}

export interface ToolAssetInstaller {
  install(archive: Uint8Array, assetName: string, destination: string): Promise<void>;
}

export interface ToolInstallResult {
  toolId: string;
  repo: string;
  tag: string;
  asset: string;
  path: string;
  backupPath: string | null;
  commitSha: string;
}
