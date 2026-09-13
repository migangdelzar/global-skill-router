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

  it('rejects duplicate skill IDs', () => {
    expect(() =>
      parseCatalog(`
skills:
  - id: duplicate
    category: primary
    source: owner/repo
    skill_path: skills/duplicate
    use_when: [first]
    activation: automatic
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
  - id: duplicate
    category: primary
    source: owner/repo
    skill_path: skills/duplicate-again
    use_when: [second]
    activation: automatic
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
`),
    ).toThrow(/duplicate.*id/i);
  });

  it('normalizes snake_case fields in JSON catalogs', () => {
    const [entry] = parseCatalog(JSON.stringify({
      skills: [{
        id: 'json-skill',
        category: 'primary',
        source: 'owner/repo',
        skill_path: 'skills/json-skill',
        use_when: ['json catalog'],
        activation: 'automatic',
        conflicts_with: [],
        requires: [],
        release_policy: 'latest-stable-tag',
      }],
    }));

    expect(entry).toMatchObject({
      skillPath: 'skills/json-skill',
      useWhen: ['json catalog'],
      conflictsWith: [],
      releasePolicy: 'latest-stable-tag',
    });
  });

  it.each([
    ['https://github.com/owner/repo', 'source'],
    ['owner/../repo', 'source'],
  ])('rejects an unsafe GitHub source %s', (source, field) => {
    expect(() => parseCatalog(`
skills:
  - id: unsafe-source
    category: primary
    source: ${source}
    skill_path: skills/demo
    use_when: [demo]
    activation: automatic
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
`)).toThrow(new RegExp(field));
  });

  it.each(['../outside', '/absolute/path', 'skills/../outside', 'skills\\outside'])('rejects unsafe skill paths: %s', (skillPath) => {
    expect(() => parseCatalog(`
skills:
  - id: unsafe-path
    category: primary
    source: owner/repo
    skill_path: ${skillPath}
    use_when: [demo]
    activation: automatic
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
`)).toThrow(/skillPath/);
  });
});
