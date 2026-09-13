import { readFile } from 'node:fs/promises';
import { parseCatalog, type SkillEntry } from '../domain/catalog.js';
import { route } from '../services/skill-router.js';

export interface CliDependencies {
  catalog: readonly SkillEntry[];
  install?: (skill: SkillEntry) => Promise<void>;
  update?: (skill: SkillEntry) => Promise<void>;
  clean?: (sessionId?: string) => Promise<void>;
}

export interface CliResult {
  code: number;
  output: string;
}

export async function runCli(args: readonly string[], dependencies: CliDependencies): Promise<CliResult> {
  const [command, ...rest] = args;
  if (command === 'list') return { code: 0, output: list(dependencies.catalog) };
  if (command === 'explain') return explain(rest.join(' '), dependencies.catalog);
  if (command === 'install' || command === 'update') {
    return installOrUpdate(command, rest, dependencies);
  }
  if (command === 'clean') {
    const sessionIndex = rest.indexOf('--session');
    const sessionId = sessionIndex >= 0 ? rest[sessionIndex + 1] : undefined;
    if (dependencies.clean !== undefined) await dependencies.clean(sessionId);
    return { code: 0, output: sessionId === undefined ? 'cleaned sessions' : `cleaned ${sessionId}` };
  }
  if (command === 'use') {
    const skill = dependencies.catalog.find((entry) => entry.id === rest[0]);
    return skill === undefined
      ? { code: 1, output: `Unknown skill: ${rest[0] ?? ''}` }
      : { code: 0, output: `selected ${skill.id}` };
  }
  return { code: 1, output: 'Usage: skill-router list|explain|use|install|update|clean' };
}

export async function runCliFromDisk(args: readonly string[], catalogPath: string): Promise<CliResult> {
  const catalog = parseCatalog(await readFile(catalogPath, 'utf8'));
  return runCli(args, { catalog });
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
    return {
      code: 2,
      output: `${command} ${skill.id} from ${skill.source}; rerun with --confirm to write`,
    };
  }
  const operation = command === 'install' ? dependencies.install : dependencies.update;
  if (operation === undefined) return { code: 2, output: `${command} is unavailable in this composition` };
  await operation(skill);
  return { code: 0, output: `${command} complete: ${skill.id}` };
}
