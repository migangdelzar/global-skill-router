import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile, readdir, stat, mkdir, rename } from 'node:fs/promises';
import { tmpdir, platform, arch } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { ToolAssetInstaller, ToolRelease, ToolReleaseClient } from '../ports/tooling.js';

const execFileAsync = promisify(execFile);

export class GitHubToolReleaseClient implements ToolReleaseClient {
  private readonly assets = new Map<string, Map<string, number>>();

  async listReleases(repo: string): Promise<readonly ToolRelease[]> {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'global-skill-router' },
    });
    if (!response.ok) throw new Error(`GitHub releases request failed: ${response.status}`);
    const values = await response.json() as Array<Record<string, unknown>>;
    return values.map((value) => {
      const tag = String(value.tag_name ?? '');
      const rawAssets = Array.isArray(value.assets) ? value.assets : [];
      const assetIds = new Map<string, number>();
      const assets = rawAssets.flatMap((raw) => {
        if (typeof raw !== 'object' || raw === null) return [];
        const record = raw as Record<string, unknown>;
        const name = typeof record.name === 'string' ? record.name : '';
        const id = typeof record.id === 'number' ? record.id : 0;
        const target = inferTarget(name);
        if (name.length === 0 || id === 0 || target === null) return [];
        assetIds.set(name, id);
        const sha256 = digestSha256(record.digest);
        return [{
          name,
          platform: target.platform,
          architecture: target.architecture,
          ...(sha256 === undefined ? {} : { sha256 }),
        }];
      });
      this.assets.set(`${repo}:${tag}`, assetIds);
      return { repo, tag, publishedAt: String(value.published_at ?? ''), draft: value.draft === true, prerelease: value.prerelease === true, assets };
    });
  }

  async downloadAsset(repo: string, tag: string, assetName: string): Promise<Uint8Array> {
    const id = this.assets.get(`${repo}:${tag}`)?.get(assetName);
    if (id === undefined) throw new Error(`Unknown GitHub asset ${assetName}`);
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/assets/${id}`, {
      headers: { accept: 'application/octet-stream', 'user-agent': 'global-skill-router' },
    });
    if (!response.ok) throw new Error(`GitHub asset request failed: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async resolveTag(repo: string, tag: string): Promise<{ commitSha: string }> {
    const response = await fetch(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(tag)}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'global-skill-router' },
    });
    if (!response.ok) throw new Error(`GitHub tag resolution failed: ${response.status}`);
    const value = await response.json() as Record<string, unknown>;
    return { commitSha: typeof value.sha === 'string' ? value.sha : '' };
  }
}

export class PathToolLocator {
  async has(command: string): Promise<boolean> {
    try {
      await execFileAsync(process.platform === 'win32' ? 'where' : 'which', [command]);
      return true;
    } catch {
      return false;
    }
  }
}

export async function toolVersion(path: string): Promise<string> {
  const result = await execFileAsync(path, ['--version']);
  return `${result.stdout}\n${result.stderr}`.trim();
}

export class ArchiveToolAssetInstaller implements ToolAssetInstaller {
  async install(archive: Uint8Array, assetName: string, destination: string): Promise<void> {
    const work = await mkdtemp(join(tmpdir(), 'skill-router-tool-'));
    const archivePath = join(work, assetName);
    const extracted = join(work, 'extracted');
    await mkdir(extracted);
    try {
      await writeFile(archivePath, archive);
      if (assetName.endsWith('.zip')) {
        await execFileAsync('unzip', ['-q', archivePath, '-d', extracted]);
      } else {
        await execFileAsync('tar', ['-xzf', archivePath, '-C', extracted]);
      }
      const prefix = assetName.replace(/\.(tar\.gz|tgz|zip)$/, '').split('-')[0];
      if (prefix === undefined || prefix.length === 0) throw new Error(`Invalid tool archive name ${assetName}`);
      const binary = await findBinary(extracted, prefix);
      await mkdir(dirname(destination), { recursive: true });
      await rename(binary, destination);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
}

function inferTarget(name: string): { platform: string; architecture: string } | null {
  const normalized = name.toLowerCase();
  const target = normalized.includes('apple-darwin') ? 'macos' : normalized.includes('linux') ? 'linux' : normalized.includes('windows') || normalized.endsWith('.zip') ? 'windows' : null;
  const architecture = normalized.includes('aarch64') || normalized.includes('arm64') ? 'arm64' : normalized.includes('x86_64') || normalized.includes('amd64') ? 'x64' : null;
  return target !== null && architecture !== null ? { platform: target, architecture } : null;
}

function digestSha256(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const digest = value.replace(/^sha256:/i, '').toLowerCase();
  return /^[0-9a-f]{64}$/.test(digest) ? digest : undefined;
}

async function findBinary(root: string, prefix: string): Promise<string> {
  for (const entry of await readdir(root)) {
    const path = join(root, entry);
    const info = await stat(path);
    if (info.isDirectory()) {
      try { return await findBinary(path, prefix); } catch { /* keep looking */ }
    } else if (entry === prefix || entry.startsWith(`${prefix}.`)) {
      return path;
    }
  }
  throw new Error(`Archive does not contain binary ${prefix}`);
}

export function currentToolTarget(): { platform: string; architecture: string } {
  return {
    platform: platform() === 'darwin' ? 'macos' : platform() === 'win32' ? 'windows' : 'linux',
    architecture: arch() === 'arm64' ? 'arm64' : 'x64',
  };
}
