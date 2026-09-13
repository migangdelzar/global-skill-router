import { readFile, writeFile, mkdir, rm, rename, readdir, stat, cp } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import type { ArchiveExtractor } from '../ports/archive.js';
import type { FileSystem } from '../ports/filesystem.js';

const execFileAsync = promisify(execFile);

export class NodeFileSystem implements FileSystem {
  async exists(path: string): Promise<boolean> {
    try { await stat(path); return true; } catch { return false; }
  }

  async readText(path: string): Promise<string> { return readFile(path, 'utf8'); }

  async createExclusive(path: string, content: string): Promise<boolean> {
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(path, content, { encoding: 'utf8', flag: 'wx' });
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === 'EEXIST') return false;
      throw error;
    }
  }

  async removeIfMatches(path: string, content: string): Promise<boolean> {
    try {
      if ((await readFile(path, 'utf8')) !== content) return false;
      await rm(path);
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return false;
      throw error;
    }
  }

  async list(path: string): Promise<readonly string[]> {
    return (await readdir(path, { withFileTypes: true })).map((entry) => entry.name);
  }

  async writeText(path: string, content: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  }

  async mkdir(path: string): Promise<void> { await mkdir(path, { recursive: true }); }

  async remove(path: string): Promise<void> { await rm(path, { recursive: true, force: true }); }

  async rename(from: string, to: string): Promise<void> {
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
  }

  async copyTree(from: string, to: string): Promise<void> { await cp(from, to, { recursive: true }); }
}

export class TarGzipExtractor implements ArchiveExtractor {
  async extract(archive: Uint8Array, destination: string): Promise<void> {
    const temporaryDirectory = await mkdtemp(`${tmpdir()}/skill-router-`);
    const archivePath = `${temporaryDirectory}/archive.tar.gz`;
    try {
      await writeFile(archivePath, archive);
      await execFileAsync('tar', ['-xzf', archivePath, '-C', destination]);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}
