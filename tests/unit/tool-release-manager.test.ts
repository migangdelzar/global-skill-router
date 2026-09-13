import { describe, expect, it } from 'vitest';
import { ToolReleaseManager, type ToolDefinition } from '../../src/services/tool-release-manager.js';
import type { ToolAssetInstaller, ToolRelease, ToolReleaseClient } from '../../src/ports/tooling.js';
import { FakeFileSystem } from '../fixtures/fakes.js';

const tool: ToolDefinition = { id: 'tgrep', repo: 'microsoft/tgrep', binaryPath: '/bin/tgrep' };
const release: ToolRelease = {
  repo: 'microsoft/tgrep', tag: 'v1.0.6', publishedAt: '2026-09-10T00:00:00.000Z', draft: false, prerelease: false,
  assets: [{ name: 'tgrep-aarch64-apple-darwin.tar.gz', platform: 'macos', architecture: 'arm64', sha256: 'a'.repeat(64) }],
};

class FakeToolClient implements ToolReleaseClient {
  readonly calls: string[] = [];
  constructor(private readonly releaseValue: ToolRelease = release) {}
  async listReleases(repo: string): Promise<readonly ToolRelease[]> { this.calls.push(`list:${repo}`); return [this.releaseValue]; }
  async downloadAsset(repo: string, tag: string, assetName: string): Promise<Uint8Array> { this.calls.push(`download:${repo}:${tag}:${assetName}`); return new Uint8Array([1]); }
}

class FakeAssetInstaller implements ToolAssetInstaller {
  constructor(private readonly fileSystem: FakeFileSystem) {}

  async install(_archive: Uint8Array, _assetName: string, destination: string): Promise<void> {
    await this.fileSystem.writeBytes(destination, new Uint8Array([1]));
  }
}

class FailingReplacementFileSystem extends FakeFileSystem {
  private renameCount = 0;

  override async rename(from: string, to: string): Promise<void> {
    this.renameCount += 1;
    if (this.renameCount === 2) throw new Error('replacement failed');
    await super.rename(from, to);
  }
}

describe('ToolReleaseManager', () => {
  it('previews without confirmation and does not download', async () => {
    const client = new FakeToolClient({ ...release, assets: [{ ...release.assets[0]!, sha256: 'a'.repeat(64) }] });
    const fileSystem = new FakeFileSystem();
    const result = await new ToolReleaseManager({ fileSystem, client, platform: 'macos', architecture: 'arm64', versionOf: async () => '1.0.6', assetInstaller: new FakeAssetInstaller(fileSystem) }).install(tool, false);
    expect(result).toMatchObject({ preview: true, release: { tag: 'v1.0.6' } });
    expect(client.calls).toEqual(['list:microsoft/tgrep']);
  });

  it('rejects a checksum mismatch and does not replace the binary', async () => {
    const client = new FakeToolClient({ ...release, assets: [{ ...release.assets[0]!, sha256: 'a'.repeat(64) }] });
    const fileSystem = new FakeFileSystem();
    await expect(new ToolReleaseManager({ fileSystem, client, platform: 'macos', architecture: 'arm64', versionOf: async () => '1.0.6', assetInstaller: new FakeAssetInstaller(fileSystem) }).install(tool, true)).rejects.toThrow(/checksum mismatch/);
  });

  it('selects only a stable release and atomically installs a verified asset', async () => {
    const client = new FakeToolClient({ ...release, assets: [{ ...release.assets[0]!, sha256: '4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a' }] });
    const fileSystem = new FakeFileSystem();
    const result = await new ToolReleaseManager({ fileSystem, client, platform: 'macos', architecture: 'arm64', versionOf: async () => '1.0.6', assetInstaller: new FakeAssetInstaller(fileSystem) }).install(tool, true);
    expect(result).toMatchObject({ toolId: 'tgrep', tag: 'v1.0.6', path: '/bin/tgrep' });
  });

  it('restores the previous binary when replacement fails', async () => {
    const client = new FakeToolClient({ ...release, assets: [{ ...release.assets[0]!, sha256: '4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a' }] });
    const fileSystem = new FailingReplacementFileSystem();
    await fileSystem.writeText('/bin/tgrep', 'previous');

    await expect(new ToolReleaseManager({ fileSystem, client, platform: 'macos', architecture: 'arm64', versionOf: async () => '1.0.6', assetInstaller: new FakeAssetInstaller(fileSystem) }).install(tool, true)).rejects.toThrow(/replacement failed/);
    await expect(fileSystem.readText('/bin/tgrep')).resolves.toBe('previous');
  });
});
