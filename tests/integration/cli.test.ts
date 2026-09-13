import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/main.js';
import type { SkillEntry } from '../../src/domain/catalog.js';
import { ToolingRegistry } from '../../src/services/tooling-registry.js';

const catalog: SkillEntry[] = [
  {
    id: 'rtk-cli-filter',
    category: 'tooling',
    source: 'rtk-ai/rtk',
    skillPath: '.',
    useWhen: ['run tests'],
    activation: 'automatic',
    conflictsWith: [],
    requires: ['rtk'],
    releasePolicy: 'latest-stable-tag',
  },
];

describe('skill-router CLI', () => {
  it('lists catalog metadata without loading skill bodies', async () => {
    const result = await runCli(['list'], { catalog });

    expect(result.code).toBe(0);
    expect(result.output).toContain('rtk-cli-filter\ttooling');
  });

  it('explains a route and its tgrep/RTK tooling decision', async () => {
    const result = await runCli(['explain', 'Run tests'], { catalog });

    expect(result.code).toBe(0);
    expect(result.output).toContain('repository search: tgrep');
    expect(result.output).toContain('CLI output optimizer: rtk');
  });

  it('prints deterministic release metadata from the injected update checker', async () => {
    let requestedSession: string | undefined;
    const result = await runCli(['check-updates', '--session', 'session-a'], {
      catalog,
      checkUpdates: async (sessionId) => {
        requestedSession = sessionId;
        return [{
          skillId: 'rtk-cli-filter',
          source: 'rtk-ai/rtk',
          tag: 'v1.2.3',
          commitSha: 'a'.repeat(40),
        }];
      },
    });

    expect(result.code).toBe(0);
    expect(requestedSession).toBe('session-a');
    expect(result.output).toBe(
      'rtk-cli-filter: latest v1.2.3 from rtk-ai/rtk (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)',
    );
  });

  it('requires confirmation before an install can write anything', async () => {
    let called = false;
    const result = await runCli(['install', 'rtk-cli-filter'], {
      catalog,
      previewInstall: async () => ({
        kind: 'skill', skillId: 'rtk-cli-filter', source: 'rtk-ai/rtk', tag: 'v1.2.3',
        commitSha: 'a'.repeat(40), checksum: 'sha256 computed after archive download',
        asset: 'GitHub tarball rtk-ai/rtk@v1.2.3', prerequisites: ['rtk'],
        actions: ['GET release metadata', 'GET tag ref', 'GET archive', 'write cache', 'activate session'],
      }),
      install: async () => {
        called = true;
      },
    });

    expect(result.code).toBe(2);
    expect(result.output).toContain('immutable commit SHA');
    expect(result.output).toContain('checksum');
    expect(result.output).toContain('GET archive');
    expect(result.output).toContain('--confirm');
    expect(called).toBe(false);
  });

  it('reports missing tgrep through doctor instead of silently falling back', async () => {
    const result = await runCli(['doctor'], {
      catalog,
      tooling: new ToolingRegistry({ has: async (command) => command === 'rtk' }),
    });

    expect(result.code).toBe(2);
    expect(result.output).toContain('tgrep: missing');
  });

  it('requires confirmation before installing global tooling', async () => {
    let called = false;
    const result = await runCli(['install-tool', 'tgrep'], {
      catalog,
      previewInstallTool: async () => ({
        kind: 'tool', toolId: 'tgrep', repo: 'microsoft/tgrep', tag: 'v1.0.6',
        commitSha: 'a'.repeat(40), asset: 'tgrep.tar.gz', checksum: 'b'.repeat(64),
        prerequisites: ['macos/arm64'], actions: ['GET release metadata', 'GET tag ref', 'GET asset', 'replace binary'],
      }),
      installTool: async () => {
        called = true;
        return { preview: true };
      },
    });

    expect(result.code).toBe(2);
    expect(result.output).toContain('immutable commit SHA');
    expect(result.output).toContain('checksum');
    expect(result.output).toContain('GET asset');
    expect(result.output).toContain('--confirm');
    expect(called).toBe(false);
  });

  it('activates a selected skill for the requested session', async () => {
    let activated: string | undefined;
    const result = await runCli(['use', 'rtk-cli-filter', '--session', 'session-a'], {
      catalog,
      activate: async (skill, sessionId) => {
        activated = `${skill.id}:${sessionId}`;
        return '/cache/sessions/session-a/active/rtk';
      },
    });

    expect(result.code).toBe(0);
    expect(activated).toBe('rtk-cli-filter:session-a');
    expect(result.output).toContain('/cache/sessions/session-a/active/rtk');
  });

  it('returns an activation error when the selected skill is unavailable', async () => {
    const result = await runCli(['use', 'rtk-cli-filter', '--session', 'session-a'], {
      catalog,
      activate: async () => { throw new Error('skill is not installed'); },
    });

    expect(result.code).toBe(2);
    expect(result.output).toContain('skill is not installed');
  });

  it('routes confirmed global tooling installation to the release manager', async () => {
    let installed: string | undefined;
    const result = await runCli(['install-tool', 'tgrep', '--confirm'], {
      catalog,
      installTool: async (toolId, confirm) => {
        installed = `${toolId}:${confirm}`;
        return { toolId, tag: 'v1.0.6', path: '/home/test/.local/bin/tgrep' };
      },
    });

    expect(result.code).toBe(0);
    expect(installed).toBe('tgrep:true');
    expect(result.output).toContain('install-tool complete: tgrep');
  });
});
