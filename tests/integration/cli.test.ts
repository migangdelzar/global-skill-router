import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/main.js';
import type { SkillEntry } from '../../src/domain/catalog.js';

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

  it('requires confirmation before an install can write anything', async () => {
    let called = false;
    const result = await runCli(['install', 'rtk-cli-filter'], {
      catalog,
      install: async () => {
        called = true;
      },
    });

    expect(result.code).toBe(2);
    expect(result.output).toContain('--confirm');
    expect(called).toBe(false);
  });
});
