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
