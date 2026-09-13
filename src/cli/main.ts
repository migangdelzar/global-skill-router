import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem } from '../adapters/node.js';
import { TarGzipExtractor } from '../adapters/node.js';
import { GitHubReleaseClient } from '../adapters/github.js';
import {
  ArchiveToolAssetInstaller,
  currentToolTarget,
  GitHubToolReleaseClient,
  PathToolLocator,
  toolVersion,
} from '../adapters/tooling.js';
import { parseCatalog, type SkillEntry } from '../domain/catalog.js';
import { route } from '../services/skill-router.js';
import { ToolReleaseManager, type ToolDefinition } from '../services/tool-release-manager.js';
import { ToolingRegistry, type ManagedToolId } from '../services/tooling-registry.js';
import { ArtifactCacheService, artifactPath } from '../services/artifact-cache.js';
import { MetadataCacheService } from '../services/metadata-cache.js';
import { FileSystemSourceLock } from '../services/source-lock.js';
import { SessionManagerService } from '../services/session-manager.js';
import { ReleaseResolverService } from '../services/release-resolver.js';
import type { ArchiveExtractor } from '../ports/archive.js';
import type { Clock } from '../ports/clock.js';
import type { FileSystem } from '../ports/filesystem.js';
import type { GitHubClient } from '../ports/github.js';
import type { SourceLock } from '../ports/lock.js';

const TOOL_DEFINITIONS: Readonly<Record<ManagedToolId, ToolDefinition>> = {
  tgrep: { id: 'tgrep', repo: 'microsoft/tgrep', binaryPath: join(homedir(), '.local', 'bin', 'tgrep') },
  rtk: { id: 'rtk', repo: 'rtk-ai/rtk', binaryPath: join(homedir(), '.local', 'bin', 'rtk') },
};

export interface CliDependencies {
  catalog: readonly SkillEntry[];
  checkUpdates?: (sessionId: string) => Promise<readonly SkillUpdate[]>;
  activate?: (skill: SkillEntry, sessionId: string) => Promise<string>;
  previewInstall?: (skill: SkillEntry, sessionId: string) => Promise<SkillInstallPreview>;
  install?: (skill: SkillEntry) => Promise<void>;
  update?: (skill: SkillEntry) => Promise<void>;
  clean?: (sessionId?: string) => Promise<void>;
  tooling?: ToolingRegistry;
  previewInstallTool?: (toolId: ManagedToolId) => Promise<ToolInstallPreview>;
  installTool?: (toolId: ManagedToolId, confirm: boolean) => Promise<unknown>;
}

export interface SkillInstallPreview {
  kind: 'skill';
  skillId: string;
  source: string;
  tag: string;
  commitSha: string;
  checksum: string;
  asset: string;
  prerequisites: readonly string[];
  actions: readonly string[];
}

export interface ToolInstallPreview {
  kind: 'tool';
  toolId: ManagedToolId;
  repo: string;
  tag: string;
  commitSha: string;
  asset: string;
  checksum: string;
  prerequisites: readonly string[];
  actions: readonly string[];
}

export interface SkillUpdate {
  skillId: string;
  source: string;
  tag: string;
  commitSha: string;
}

export interface CliResult {
  code: number;
  output: string;
}

export interface DiskCliOptions {
  cacheRoot?: string;
  fileSystem?: FileSystem;
  clock?: Clock;
  github?: GitHubClient;
  archiveExtractor?: ArchiveExtractor;
  sourceLock?: SourceLock;
}

export async function runCli(args: readonly string[], dependencies: CliDependencies): Promise<CliResult> {
  const [command, ...rest] = args;
  if (command === 'list') return { code: 0, output: list(dependencies.catalog) };
  if (command === 'doctor') return doctor(dependencies.tooling);
  if (command === 'explain') return explain(rest.join(' '), dependencies.catalog);
  if (command === 'check-updates') return checkUpdates(rest, dependencies);
  if (command === 'install-tool' || command === 'update-tool') {
    return installTool(command, rest, dependencies);
  }
  if (command === 'install' || command === 'update') {
    return installOrUpdate(command, rest, dependencies);
  }
  if (command === 'clean') {
    if (!rest.includes('--confirm')) {
      return { code: 2, output: 'clean; rerun with --confirm to write' };
    }
    const sessionIndex = rest.indexOf('--session');
    const sessionId = sessionIndex >= 0 ? rest[sessionIndex + 1] : undefined;
    if (dependencies.clean !== undefined) await dependencies.clean(sessionId);
    return { code: 0, output: sessionId === undefined ? 'cleaned sessions' : `cleaned ${sessionId}` };
  }
  if (command === 'use') {
    const skill = dependencies.catalog.find((entry) => entry.id === rest[0]);
    if (skill === undefined) return { code: 1, output: `Unknown skill: ${rest[0] ?? ''}` };
    if (dependencies.activate === undefined) return { code: 2, output: 'use is unavailable in this composition' };
    const sessionIndex = rest.indexOf('--session');
    const sessionId = sessionIndex >= 0 ? rest[sessionIndex + 1] : undefined;
    if (sessionId === undefined) return { code: 2, output: 'use requires --session <id>' };
    try {
      const path = await dependencies.activate(skill, sessionId);
      return { code: 0, output: `activated ${skill.id} -> ${path}` };
    } catch (error) {
      return { code: 2, output: `Unable to activate ${skill.id}: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  return { code: 1, output: 'Usage: skill-router list|doctor|explain|check-updates|use|install|update|install-tool|update-tool|clean' };
}

async function checkUpdates(args: readonly string[], dependencies: CliDependencies): Promise<CliResult> {
  if (dependencies.checkUpdates === undefined) {
    return { code: 2, output: 'check-updates is unavailable in this composition' };
  }

  const sessionId = sessionIdFromArgs(args);
  try {
    const updates = [...await dependencies.checkUpdates(sessionId)].sort((left, right) =>
      left.skillId < right.skillId ? -1 : left.skillId > right.skillId ? 1 : 0,
    );
    return {
      code: 0,
      output: updates.length === 0
        ? 'No approved skill updates found.'
        : updates.map((update) =>
          `${update.skillId}: latest ${update.tag} from ${update.source} (${update.commitSha})`,
        ).join('\n'),
    };
  } catch (error) {
    return {
      code: 2,
      output: `Unable to check updates: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function doctor(tooling: ToolingRegistry | undefined): Promise<CliResult> {
  if (tooling === undefined) return { code: 2, output: 'tooling status is unavailable' };
  const statuses = await tooling.status();
  const output = statuses.map((status) => `${status.id}: ${status.installed ? 'installed' : 'missing'} (required for ${status.requiredFor.join(', ')})`).join('\n');
  return { code: statuses.some((status) => !status.installed && status.id === 'tgrep') ? 2 : 0, output };
}

export async function runCliFromDisk(
  args: readonly string[],
  catalogPath: string,
  options: DiskCliOptions = {},
): Promise<CliResult> {
  const catalog = parseCatalog(await readFile(catalogPath, 'utf8'));
  const fileSystem = options.fileSystem ?? new NodeFileSystem();
  const clock = options.clock ?? new SystemClock();
  const github = options.github ?? new GitHubReleaseClient();
  const cacheRoot = options.cacheRoot ?? join(homedir(), '.codex/skill-router/cache');
  const sourceLock = options.sourceLock ?? new FileSystemSourceLock({
    fileSystem,
    clock,
    lockRoot: `${cacheRoot}/locks`,
  });
  const resolver = new ReleaseResolverService(github, clock);
  const metadata = new MetadataCacheService({
    cacheRoot,
    clock,
    fileSystem,
    resolver,
    sourceLock,
    lockTimeoutMs: 30_000,
  });
  const extractor = options.archiveExtractor ?? new TarGzipExtractor();
  const artifacts = new ArtifactCacheService({
    cacheRoot,
    fileSystem,
    archiveExtractor: extractor,
    sourceLock,
    download: (repo, tag) => github.downloadTagArchive(repo, tag),
    skillExists: (root, skillPath) => fileSystem.exists(`${root}/${skillPath === '.' ? '' : `${skillPath}/`}SKILL.md`),
  });
  const sessions = new SessionManagerService({
    root: cacheRoot,
    fileSystem,
    clock,
    abandonedTtlMs: 24 * 60 * 60 * 1_000,
  });
  const target = currentToolTarget();
  const releaseManager = new ToolReleaseManager({
    fileSystem,
    client: new GitHubToolReleaseClient(),
    platform: target.platform,
    architecture: target.architecture,
    versionOf: toolVersion,
    assetInstaller: new ArchiveToolAssetInstaller(),
    sourceLock,
  });
  const activate = async (skill: SkillEntry): Promise<void> => {
    const sessionId = sessionIdFromArgs(args);
    const metadataRecord = await metadata.getLatest(skill.source, sessionId);
    const artifact = await artifacts.ensure(metadataRecord.release, skill.skillPath);
    await sessions.activate(sessionId, artifact);
  };
  const activateCached = async (skill: SkillEntry, sessionId: string): Promise<string> => {
    const metadataRecord = await metadata.readCached(skill.source);
    if (metadataRecord === null) throw new Error(`no cached metadata for ${skill.source}`);
    const artifact = await artifacts.readCached(metadataRecord.release, skill.skillPath);
    if (artifact === null) throw new Error(`skill ${skill.id} is not installed; run install with --confirm`);
    return sessions.activate(sessionId, artifact);
  };
  const previewInstall = async (skill: SkillEntry, sessionId: string): Promise<SkillInstallPreview> => {
    const release = await resolver.resolveLatestStable(skill.source);
    const objectPath = artifactPath(cacheRoot, release, skill.skillPath);
    const activePath = `${cacheRoot}/sessions/${sessionId}/active/${encodeURIComponent(skill.source)}-${encodeURIComponent(skill.skillPath)}`;
    return {
      kind: 'skill',
      skillId: skill.id,
      source: skill.source,
      tag: release.tag,
      commitSha: release.commitSha,
      checksum: 'SHA-256 computed and recorded after the confirmed archive download',
      asset: `GitHub tarball ${skill.source}@${release.tag}`,
      prerequisites: ['GitHub network access', ...skill.requires],
      actions: [
        `GET release metadata for ${skill.source}`,
        `GET immutable tag ref refs/tags/${release.tag}`,
        `GET archive ${skill.source}@${release.tag}`,
        `create temporary cache object near ${objectPath}`,
        `extract and validate ${skill.skillPath === '.' ? 'SKILL.md' : `${skill.skillPath}/SKILL.md`}`,
        `write and atomically publish ${objectPath}.json and ${objectPath}`,
        `create session directory ${cacheRoot}/sessions/${sessionId}/active`,
        `copy selected skill into ${activePath}`,
      ],
    };
  };
  const previewInstallTool = async (toolId: ManagedToolId): Promise<ToolInstallPreview> => {
    const definition = TOOL_DEFINITIONS[toolId];
    const target = currentToolTarget();
    const result = await releaseManager.install(definition, false);
    if (!('preview' in result)) throw new Error(`unable to preview ${toolId}`);
    if (result.release.commitSha === undefined) throw new Error(`release ${result.release.tag} has no commit SHA`);
    return {
      kind: 'tool',
      toolId,
      repo: definition.repo,
      tag: result.release.tag,
      commitSha: result.release.commitSha,
      asset: result.asset.name,
      checksum: result.asset.sha256 ?? 'missing (install rejected)',
      prerequisites: [`${target.platform}/${target.architecture}`, 'GitHub network access'],
      actions: [
        `GET release metadata for ${definition.repo}`,
        `GET immutable tag ref refs/tags/${result.release.tag}`,
        `GET verified asset ${result.asset.name}`,
        `install and exact-check ${definition.binaryPath}.tmp-*`,
        `atomically replace ${definition.binaryPath} and its metadata`,
      ],
    };
  };
  return runCli(args, {
    catalog,
    checkUpdates: async (sessionId) => {
      const releases = new Map<string, Awaited<ReturnType<typeof metadata.getLatest>>>();
      for (const skill of catalog) {
        if (!releases.has(skill.source)) {
          releases.set(skill.source, await metadata.getLatest(skill.source, sessionId));
        }
      }
      return catalog.map((skill) => {
        const record = releases.get(skill.source);
        if (record === undefined) throw new Error(`missing release metadata for ${skill.source}`);
        return {
          skillId: skill.id,
          source: skill.source,
          tag: record.release.tag,
          commitSha: record.release.commitSha,
        };
      });
    },
    activate: activateCached,
    previewInstall,
    tooling: new ToolingRegistry(new PathToolLocator()),
    previewInstallTool,
    installTool: (toolId, confirm) => releaseManager.install(TOOL_DEFINITIONS[toolId], confirm),
    install: activate,
    update: activate,
    clean: async (sessionId) => {
      if (sessionId === undefined) {
        await sessions.collectAbandoned(clock.now());
      } else {
        await sessions.cleanup(sessionId);
      }
    },
  });
}

class SystemClock implements Clock {
  now(): Date { return new Date(); }
  random(): number { return Math.random(); }
}

function sessionIdFromArgs(args: readonly string[]): string {
  const index = args.indexOf('--session');
  const explicit = index >= 0 ? args[index + 1] : undefined;
  const value = explicit ?? process.env.SKILL_ROUTER_SESSION ?? `cli-${process.pid}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new Error(`unsafe session id ${value}`);
  return value;
}

async function installTool(
  command: 'install-tool' | 'update-tool',
  args: readonly string[],
  dependencies: CliDependencies,
): Promise<CliResult> {
  const toolId = args.find((arg): arg is ManagedToolId => arg === 'tgrep' || arg === 'rtk');
  if (toolId === undefined) return { code: 1, output: `Unknown tool: ${args[0] ?? ''}` };
  if (!args.includes('--confirm')) {
    if (dependencies.previewInstallTool === undefined) return { code: 2, output: `${command} is unavailable in this composition` };
    try {
      const preview = await dependencies.previewInstallTool(toolId);
      return { code: 2, output: formatPreview(`${command} ${toolId}`, preview) };
    } catch (error) {
      return { code: 2, output: `Unable to preview ${toolId}: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  if (dependencies.installTool === undefined) return { code: 2, output: `${command} is unavailable in this composition` };
  const result = await dependencies.installTool(toolId, true) as { tag?: string; path?: string };
  return { code: 0, output: `${command} complete: ${toolId}${result.tag === undefined ? '' : ` ${result.tag}`}${result.path === undefined ? '' : ` -> ${result.path}`}` };
}

function list(catalog: readonly SkillEntry[]): string {
  return catalog.map((skill) => `${skill.id}\t${skill.category}`).join('\n');
}

function explain(task: string, catalog: readonly SkillEntry[]): CliResult {
  const result = route({ task }, catalog);
  const primary = result.primary?.id ?? 'none';
  const optimizer = result.tooling.cliOutputOptimizer ?? 'none';
  return {
    code: 0,
    output: [
      `primary: ${primary}`,
      `repository search: ${result.tooling.repositorySearchCommand}`,
      `CLI output optimizer: ${optimizer}`,
      `RTK excludes: ${result.tooling.rtkExcludedCommands.join(', ')}`,
    ].join('\n'),
  };
}

async function installOrUpdate(
  command: 'install' | 'update',
  args: readonly string[],
  dependencies: CliDependencies,
): Promise<CliResult> {
  const skill = dependencies.catalog.find((entry) => entry.id === args[0]);
  if (skill === undefined) return { code: 1, output: `Unknown skill: ${args[0] ?? ''}` };
  if (!args.includes('--confirm')) {
    if (dependencies.previewInstall === undefined) return { code: 2, output: `${command} is unavailable in this composition` };
    try {
      const preview = await dependencies.previewInstall(skill, sessionIdFromArgs(args));
      return { code: 2, output: formatPreview(`${command} ${skill.id}`, preview) };
    } catch (error) {
      return { code: 2, output: `Unable to preview ${skill.id}: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  const operation = command === 'install' ? dependencies.install : dependencies.update;
  if (operation === undefined) return { code: 2, output: `${command} is unavailable in this composition` };
  await operation(skill);
  return { code: 0, output: `${command} complete: ${skill.id}` };
}

function formatPreview(label: string, preview: SkillInstallPreview | ToolInstallPreview): string {
  return [
    `${label} preview (no download/write/activation performed)`,
    `release tag: ${preview.tag}`,
    `immutable commit SHA: ${preview.commitSha}`,
    `asset: ${preview.asset}`,
    `checksum: ${preview.checksum}`,
    `prerequisites: ${preview.prerequisites.join(', ') || 'none'}`,
    'exact actions:',
    ...preview.actions.map((action) => `- ${action}`),
    `confirm boundary: rerun with --confirm to execute ${preview.actions.length} actions`,
  ].join('\n');
}
