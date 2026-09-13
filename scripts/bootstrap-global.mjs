import { chmod, cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function bootstrapGlobal({ home, sourceRoot }) {
  const activeSkill = join(home, '.agents/skills/skill-router/SKILL.md');
  const claudeSkill = join(home, '.claude/skills/skill-router/SKILL.md');
  const catalog = join(home, '.codex/skill-router/catalog/catalog.yaml');
  const cli = join(home, '.codex/skill-router/dist');
  const internalLauncher = join(home, '.codex/skill-router/bin/skill-router.mjs');
  const launcher = join(home, '.local/bin/skill-router');
  await mkdir(dirname(activeSkill), { recursive: true });
  await mkdir(dirname(claudeSkill), { recursive: true });
  await mkdir(dirname(catalog), { recursive: true });
  await mkdir(dirname(internalLauncher), { recursive: true });
  await mkdir(dirname(launcher), { recursive: true });
  await cp(join(sourceRoot, 'skill/SKILL.md'), activeSkill);
  await cp(join(sourceRoot, 'skill/SKILL.md'), claudeSkill);
  await cp(join(sourceRoot, 'catalog/catalog.yaml'), catalog);
  await cp(join(sourceRoot, 'dist'), cli, { recursive: true });
  await cp(join(sourceRoot, 'bin/skill-router.mjs'), internalLauncher);
  await writeFile(launcher, '#!/bin/sh\nexec node "$HOME/.codex/skill-router/bin/skill-router.mjs" "$@"\n', 'utf8');
  await chmod(launcher, 0o755);
  return { activeSkill, claudeSkill, catalog, cli, internalLauncher, launcher };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const home = process.env.HOME;
  if (home === undefined) throw new Error('HOME is required');
  const result = await bootstrapGlobal({ home, sourceRoot: dirname(dirname(fileURLToPath(import.meta.url))) });
  console.log(`bootstrapped ${result.catalog}`);
}
