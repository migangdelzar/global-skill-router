import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function bootstrapGlobal({ home, sourceRoot }) {
  const activeSkill = join(home, '.agents/skills/skill-router/SKILL.md');
  const catalog = join(home, '.codex/skill-router/catalog/catalog.yaml');
  const cli = join(home, '.codex/skill-router/dist');
  await mkdir(dirname(activeSkill), { recursive: true });
  await mkdir(dirname(catalog), { recursive: true });
  await cp(join(sourceRoot, 'skill/SKILL.md'), activeSkill);
  await cp(join(sourceRoot, 'catalog/catalog.yaml'), catalog);
  await cp(join(sourceRoot, 'dist'), cli, { recursive: true });
  return { activeSkill, catalog, cli };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const home = process.env.HOME;
  if (home === undefined) throw new Error('HOME is required');
  const result = await bootstrapGlobal({ home, sourceRoot: dirname(dirname(fileURLToPath(import.meta.url))) });
  console.log(`bootstrapped ${result.catalog}`);
}
