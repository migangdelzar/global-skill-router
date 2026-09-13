import type { Clock } from '../../src/ports/clock.js';
import type { FileSystem } from '../../src/ports/filesystem.js';
import type { GitHubClient } from '../../src/ports/github.js';
import type { LockLease, SourceLock } from '../../src/ports/lock.js';

export class FakeClock implements Clock {
  readonly calls: string[] = [];

  now(): Date {
    this.calls.push('now');
    return new Date('2026-01-01T00:00:00.000Z');
  }

  random(): number {
    this.calls.push('random');
    return 0.5;
  }
}

export class FakeFileSystem implements FileSystem {
  readonly calls: Array<readonly [string, ...string[]]> = [];
  private readonly files = new Map<string, string>();
  private readonly directories = new Set<string>();

  async exists(path: string): Promise<boolean> {
    this.calls.push(['exists', path]);
    return this.files.has(path) || this.directories.has(path);
  }

  async readText(path: string): Promise<string> {
    this.calls.push(['readText', path]);
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`File not found: ${path}`);
    return content;
  }

  async list(path: string): Promise<readonly string[]> {
    this.calls.push(['list', path]);
    const prefix = path.endsWith('/') ? path : `${path}/`;
    const children = new Set<string>();
    for (const entry of [...this.files.keys(), ...this.directories]) {
      if (!entry.startsWith(prefix)) continue;
      const child = entry.slice(prefix.length).split('/')[0];
      if (child !== undefined && child.length > 0) children.add(child);
    }
    return [...children];
  }

  async createExclusive(path: string, content: string): Promise<boolean> {
    this.calls.push(['createExclusive', path, content]);
    if (this.files.has(path) || this.directories.has(path)) return false;
    this.files.set(path, content);
    return true;
  }

  async removeIfMatches(path: string, content: string): Promise<boolean> {
    this.calls.push(['removeIfMatches', path, content]);
    if (this.files.get(path) !== content) return false;
    this.files.delete(path);
    return true;
  }

  async writeText(path: string, content: string): Promise<void> {
    this.calls.push(['writeText', path, content]);
    this.files.set(path, content);
  }

  async mkdir(path: string): Promise<void> {
    this.calls.push(['mkdir', path]);
    this.directories.add(path);
  }

  async remove(path: string): Promise<void> {
    this.calls.push(['remove', path]);
    this.files.delete(path);
    this.directories.delete(path);
  }

  async rename(from: string, to: string): Promise<void> {
    this.calls.push(['rename', from, to]);
    const content = this.files.get(from);
    if (content !== undefined) {
      this.files.delete(from);
      this.files.set(to, content);
    }
    if (this.directories.has(from)) {
      this.directories.delete(from);
      this.directories.add(to);
      for (const directory of [...this.directories]) {
        if (directory.startsWith(`${from}/`)) {
          this.directories.delete(directory);
          this.directories.add(`${to}${directory.slice(from.length)}`);
        }
      }
      for (const [path, value] of [...this.files]) {
        if (path.startsWith(`${from}/`)) {
          this.files.delete(path);
          this.files.set(`${to}${path.slice(from.length)}`, value);
        }
      }
    }
  }

  async copyTree(from: string, to: string): Promise<void> {
    this.calls.push(['copyTree', from, to]);
    for (const [path, content] of this.files) {
      if (path.startsWith(`${from}/`)) {
        this.files.set(`${to}${path.slice(from.length)}`, content);
      }
    }
  }
}

export class FakeGitHubClient implements GitHubClient {
  readonly calls: Array<readonly [string, ...string[]]> = [];

  async listReleases(repo: string) {
    this.calls.push(['listReleases', repo]);
    return [];
  }

  async resolveTag(repo: string, tag: string) {
    this.calls.push(['resolveTag', repo, tag]);
    return { commitSha: 'fake-commit-sha' };
  }

  async downloadTagArchive(repo: string, tag: string) {
    this.calls.push(['downloadTagArchive', repo, tag]);
    return new Uint8Array();
  }
}

export class FakeSourceLock implements SourceLock {
  readonly calls: Array<readonly [string, ...Array<string | number>]> = [];

  async acquire(key: string, owner: string, timeoutMs: number): Promise<LockLease> {
    this.calls.push(['acquire', key, owner, timeoutMs]);
    return {
      release: async () => {
        this.calls.push(['release']);
      },
    };
  }
}
