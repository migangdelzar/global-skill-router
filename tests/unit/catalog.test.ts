import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CatalogValidationError, parseCatalog } from '../../src/domain/catalog.js';

describe('catalog parser', () => {
  it('parses the approved catalog entries from YAML', async () => {
    const source = await readFile(resolve(process.cwd(), 'catalog/catalog.yaml'), 'utf8');

    const skills = parseCatalog(source);
    const appleDesign = skills.find((skill) => skill.id === 'apple-design');

    expect(appleDesign).toMatchObject({
      source: 'emilkowalski/skills',
      skillPath: 'skills/apple-design',
      activation: 'explicit',
      releasePolicy: 'latest-stable-tag',
    });

    expect(skills.find((skill) => skill.id === 'rtk-cli-filter')).toMatchObject({
      category: 'tooling',
      activation: 'automatic',
      useWhen: ['run tests', 'inspect git', 'build logs', 'shell-heavy coding task'],
      conflictsWith: [],
      requires: ['rtk'],
    });
  });

  it('rejects a malformed entry and names the invalid field', () => {
    expect(() =>
      parseCatalog(`
skills:
  - id: incomplete
    source: owner/repo
    skill_path: skills/incomplete
    use_when: [incomplete]
    activation: automatic
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
`),
    ).toThrowError(CatalogValidationError);

    expect(() =>
      parseCatalog(`
skills:
  - id: incomplete
    source: owner/repo
    skill_path: skills/incomplete
    use_when: [incomplete]
    activation: automatic
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
`),
    ).toThrow(/category/);
  });
});
