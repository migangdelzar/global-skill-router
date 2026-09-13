import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bootstrapGlobal } from '../../scripts/bootstrap-global.mjs';

describe('bootstrapGlobal', () => {
  it('installs the router into shared and Claude discovery paths without an OpenCode duplicate', async () => {
    const home = await mkdtemp(join(tmpdir(), 'skill-router-home-'));
    const sourceRoot = process.cwd();

    await bootstrapGlobal({ home, sourceRoot });
    await bootstrapGlobal({ home, sourceRoot });

    const skillPath = join(home, '.agents/skills/skill-router/SKILL.md');
    const catalogPath = join(home, '.codex/skill-router/catalog/catalog.yaml');
    const internalLauncher = join(home, '.codex/skill-router/bin/skill-router.mjs');
    const launcher = join(home, '.local/bin/skill-router');
    const claudeSkillPath = join(home, '.claude/skills/skill-router/SKILL.md');
    expect((await stat(skillPath)).isFile()).toBe(true);
    expect((await stat(catalogPath)).isFile()).toBe(true);
    expect((await stat(internalLauncher)).isFile()).toBe(true);
    expect((await stat(launcher)).isFile()).toBe(true);
    expect((await stat(claudeSkillPath)).isFile()).toBe(true);
    await expect(readFile(claudeSkillPath, 'utf8')).resolves.toBe(await readFile(skillPath, 'utf8'));
    expect(await readFile(launcher, 'utf8')).toContain('.codex/skill-router/bin/skill-router.mjs');
    expect(await readFile(skillPath, 'utf8')).toContain('route');
    await expect(readdir(join(home, '.agents/skills'))).resolves.toEqual(['skill-router']);
    await expect(readdir(join(home, '.claude/skills'))).resolves.toEqual(['skill-router']);
    await expect(stat(join(home, '.config/opencode/skills/skill-router'))).rejects.toThrow();
    await expect(stat(join(home, '.agents/skills/rtk-cli-filter'))).rejects.toThrow();
    await expect(stat(join(home, '.codex/skill-library'))).rejects.toThrow();
  });
});
