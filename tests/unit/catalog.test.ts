import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CatalogValidationError, parseCatalog } from '../../src/domain/catalog.js';

describe('catalog parser', () => {
  const aiupCatalogYaml = `
skills:
  - id: aiup-requirements
    category: requirements
    source: AI-Unified-Process/marketplace
    skill_path: aiup-core/skills/requirements
    use_when: [requirements]
    activation: automatic
    preinstalled: true
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
  - id: aiup-reverse-engineer
    category: requirements
    source: AI-Unified-Process/marketplace
    skill_path: aiup-core/skills/reverse-engineer
    use_when: [reverse engineer]
    activation: automatic
    preinstalled: true
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
  - id: aiup-entity-model
    category: requirements-modeling
    source: AI-Unified-Process/marketplace
    skill_path: aiup-core/skills/entity-model
    use_when: [entity model]
    activation: explicit
    preinstalled: true
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
  - id: aiup-use-case-diagram
    category: requirements-modeling
    source: AI-Unified-Process/marketplace
    skill_path: aiup-core/skills/use-case-diagram
    use_when: [use case diagram]
    activation: explicit
    preinstalled: true
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
  - id: aiup-use-case-spec
    category: requirements
    source: AI-Unified-Process/marketplace
    skill_path: aiup-core/skills/use-case-spec
    use_when: [use case specification]
    activation: explicit
    preinstalled: true
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
  - id: aiup-test-case
    category: requirements-testing
    source: AI-Unified-Process/marketplace
    skill_path: aiup-core/skills/test-case
    use_when: [test case]
    activation: explicit
    preinstalled: true
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
`;

  it('parses preinstalled AIUP entries with their exact source and skill paths', () => {
    const skills = parseCatalog(aiupCatalogYaml);
    expect(skills.filter((skill) => skill.id.startsWith('aiup-'))).toHaveLength(6);
    expect(skills.every((skill) => skill.preinstalled)).toBe(true);
    expect(skills.every((skill) => skill.source === 'AI-Unified-Process/marketplace')).toBe(true);
    expect(skills.map((skill) => skill.skillPath)).toEqual([
      'aiup-core/skills/requirements',
      'aiup-core/skills/reverse-engineer',
      'aiup-core/skills/entity-model',
      'aiup-core/skills/use-case-diagram',
      'aiup-core/skills/use-case-spec',
      'aiup-core/skills/test-case',
    ]);
  });

  it('rejects a catalog entry without the preinstalled boolean', () => {
    expect(() => parseCatalog(aiupCatalogYaml.replace('    preinstalled: true\n', '')))
      .toThrow(/preinstalled/);
  });

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

  it.each(['taste', 'impeccable', 'ui-ux-pro-max', 'graphify', 'understand-anything'])
    ('keeps the approved root skill path for %s', async (skillId) => {
      const source = await readFile(resolve(process.cwd(), 'catalog/catalog.yaml'), 'utf8');
      const skill = parseCatalog(source).find((entry) => entry.id === skillId);

      expect(skill?.skillPath).toBe('.');
    });

  it('rejects a malformed entry and names the invalid field', () => {
    expect(() =>
      parseCatalog(`
skills:
  - id: incomplete
    source: emilkowalski/skills
    skill_path: skills/incomplete
    use_when: [incomplete]
    activation: automatic
    preinstalled: false
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
`),
    ).toThrowError(CatalogValidationError);

    expect(() =>
      parseCatalog(`
skills:
  - id: incomplete
    source: emilkowalski/skills
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
    source: emilkowalski/skills
    skill_path: skills/duplicate
    use_when: [first]
    activation: automatic
    preinstalled: false
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
  - id: duplicate
    category: primary
    source: emilkowalski/skills
    skill_path: skills/duplicate-again
    use_when: [second]
    activation: automatic
    preinstalled: false
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
        source: 'emilkowalski/skills',
        skill_path: 'skills/json-skill',
        use_when: ['json catalog'],
        activation: 'automatic',
        preinstalled: false,
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
    preinstalled: false
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
`)).toThrow(new RegExp(field));
  });

  it('rejects a syntactically valid but unreviewed GitHub source', () => {
    expect(() => parseCatalog(`
skills:
  - id: unreviewed-source
    category: primary
    source: unreviewed-owner/unreviewed-repository
    skill_path: skills/demo
    use_when: [demo]
    activation: automatic
    preinstalled: false
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
`)).toThrow(/allowlisted GitHub owner\/repository/);
  });

  it.each(['../outside', '/absolute/path', 'skills/../outside', 'skills\\outside'])('rejects unsafe skill paths: %s', (skillPath) => {
    expect(() => parseCatalog(`
skills:
  - id: unsafe-path
    category: primary
    source: emilkowalski/skills
    skill_path: ${skillPath}
    use_when: [demo]
    activation: automatic
    preinstalled: false
    conflicts_with: []
    requires: []
    release_policy: latest-stable-tag
`)).toThrow(/skillPath/);
  });
});
