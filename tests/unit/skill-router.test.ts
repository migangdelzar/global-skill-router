import { describe, expect, it } from 'vitest';
import type { SkillEntry } from '../../src/domain/catalog.js';
import { route } from '../../src/services/skill-router.js';

const skill = (overrides: Partial<SkillEntry>): SkillEntry => ({
  id: 'skill',
  category: 'primary',
  source: 'owner/repo',
  skillPath: 'skills/skill',
  useWhen: [],
  activation: 'automatic',
  preinstalled: false,
  conflictsWith: [],
  requires: [],
  releasePolicy: 'latest-stable-tag',
  ...overrides,
});

describe('skill router', () => {
  it('uses tgrep as the repository search command without enabling RTK', () => {
    const result = route({ task: 'Find where the router is defined' }, []);

    expect(result.tooling).toEqual({
      repositorySearchCommand: 'tgrep',
      cliOutputOptimizer: null,
      rtkExcludedCommands: ['tgrep'],
    });
  });

  it('adds RTK for noisy CLI work while preserving tgrep as the search command', () => {
    const result = route(
      { task: 'Run tests and inspect the git diff' },
      [
        skill({
          id: 'rtk-cli-filter',
          category: 'tooling',
          useWhen: ['run tests', 'inspect git'],
        }),
      ],
    );

    expect(result.tooling).toEqual({
      repositorySearchCommand: 'tgrep',
      cliOutputOptimizer: 'rtk',
      rtkExcludedCommands: ['tgrep'],
    });
  });

  it('does not add RTK when exact raw command output is requested', () => {
    const result = route(
      { task: 'Run tests and show the exact raw output' },
      [
        skill({
          id: 'rtk-cli-filter',
          category: 'tooling',
          useWhen: ['run tests'],
        }),
      ],
    );

    expect(result.tooling.cliOutputOptimizer).toBeNull();
  });

  it('lets an explicit apple-design selection beat an automatic Emil match', () => {
    const result = route(
      { task: 'Create an animated interaction', explicitSkillId: 'apple-design' },
      [
        skill({ id: 'emil-design-eng', useWhen: ['animation'] }),
        skill({ id: 'apple-design', activation: 'explicit', useWhen: ['Apple platform'] }),
      ],
    );

    expect(result.primary?.id).toBe('apple-design');
  });

  it('selects emil-design-eng when the task mentions animation', () => {
    const result = route(
      { task: 'Improve the animation of this component' },
      [skill({ id: 'emil-design-eng', useWhen: ['animation'] })],
    );

    expect(result.primary?.id).toBe('emil-design-eng');
  });

  it('routes requirements and brownfield tasks to AIUP automatic skills', () => {
    const skills = [
      skill({ id: 'aiup-requirements', category: 'requirements', useWhen: ['requirements', 'vision'] }),
      skill({ id: 'aiup-reverse-engineer', category: 'requirements', useWhen: ['reverse engineer', 'brownfield'] }),
    ];

    expect(route({ task: 'turn this vision into measurable requirements' }, skills).primary?.id)
      .toBe('aiup-requirements');
    expect(route({ task: 'reverse engineer this existing application' }, skills).primary?.id)
      .toBe('aiup-reverse-engineer');
  });

  it('does not auto-route downstream AIUP skills', () => {
    const skills = [
      skill({ id: 'aiup-entity-model', category: 'requirements-modeling', activation: 'explicit', useWhen: ['entity model'] }),
      skill({ id: 'aiup-use-case-diagram', category: 'requirements-modeling', activation: 'explicit', useWhen: ['use case diagram'] }),
    ];

    const result = route({ task: 'model entities and draw use cases' }, skills);
    expect(result.primary?.id).not.toBe('aiup-entity-model');
    expect(result.primary?.id).not.toBe('aiup-use-case-diagram');
  });

  it('does not match a short category inside a larger word', () => {
    const result = route(
      { task: 'Build an API' },
      [skill({ id: 'ui-guidance', category: 'ui' })],
    );

    expect(result.primary).toBeNull();
  });

  it('does not select taste without a website-analysis trigger', () => {
    const result = route(
      { task: 'Build a landing page' },
      [
        skill({
          id: 'taste',
          activation: 'explicit',
          useWhen: ['analyze website design', 'extract design DNA'],
        }),
      ],
    );

    expect(result.primary).toBeNull();
  });

  it('rejects a conflicting automatic workflow pack but honors an explicit choice', () => {
    const emil = skill({
      id: 'emil-design-eng',
      category: 'workflow',
      useWhen: ['design system'],
      conflictsWith: ['ui-ux-pro-max'],
    });
    const uiUx = skill({
      id: 'ui-ux-pro-max',
      category: 'workflow',
      useWhen: ['design system'],
      conflictsWith: ['emil-design-eng'],
    });

    const automatic = route({ task: 'Create a design system' }, [emil, uiUx]);
    expect(automatic.primary?.id).toBe('emil-design-eng');
    expect(automatic.rejected).toContainEqual({
      id: 'ui-ux-pro-max',
      reason: 'conflicts with emil-design-eng',
    });

    const explicit = route(
      { task: 'Create a design system', explicitSkillId: 'ui-ux-pro-max' },
      [emil, uiUx],
    );
    expect(explicit.primary?.id).toBe('ui-ux-pro-max');
    expect(explicit.rejected).toContainEqual({
      id: 'emil-design-eng',
      reason: 'conflicts with ui-ux-pro-max',
    });
  });

  it('preserves adjunct and reviewer roles for forced skills', () => {
    const adjunct = skill({
      id: 'forced-adjunct',
      category: 'adjunct',
      activation: 'explicit',
    });
    const reviewer = skill({
      id: 'forced-reviewer',
      category: 'reviewer',
      useWhen: ['review architecture'],
    });

    const explicit = route({ task: 'Anything', explicitSkillId: adjunct.id }, [adjunct]);
    expect(explicit.primary).toBeNull();
    expect(explicit.adjuncts.map((entry) => entry.id)).toEqual([adjunct.id]);

    const projectForced = route(
      { task: 'Anything', projectInstructions: `Use ${reviewer.id}` },
      [reviewer],
    );
    expect(projectForced.primary).toBeNull();
    expect(projectForced.adjuncts.map((entry) => entry.id)).toEqual([reviewer.id]);
  });

  it('fails closed when an explicitly requested skill is unavailable', () => {
    const result = route(
      { task: 'Improve animation', explicitSkillId: 'missing-skill' },
      [skill({ id: 'emil-design-eng', useWhen: ['animation'] })],
    );

    expect(result.primary).toBeNull();
    expect(result.adjuncts).toEqual([]);
    expect(result.rejected).toContainEqual({
      id: 'missing-skill',
      reason: 'skill is not in the catalog',
    });
  });

  it('returns at most one primary, one adjunct, and one reviewer', () => {
    const skills = [
      skill({ id: 'primary-one', useWhen: ['dashboard'] }),
      skill({ id: 'primary-two', useWhen: ['dashboard'] }),
      skill({ id: 'adjunct-one', category: 'adjunct', useWhen: ['dashboard'] }),
      skill({ id: 'adjunct-two', category: 'adjunct', useWhen: ['dashboard'] }),
      skill({ id: 'reviewer-one', category: 'reviewer', useWhen: ['dashboard'] }),
      skill({ id: 'reviewer-two', category: 'reviewer', useWhen: ['dashboard'] }),
    ];

    const result = route({ task: 'Review this dashboard' }, skills);

    expect(result.primary?.id).toBe('primary-one');
    expect(result.adjuncts.map((entry) => entry.id)).toEqual([
      'adjunct-one',
      'reviewer-one',
    ]);
    expect(result.rejected).toEqual([
      { id: 'primary-two', reason: 'primary slot already selected' },
      { id: 'adjunct-two', reason: 'adjunct slot already selected' },
      { id: 'reviewer-two', reason: 'reviewer slot already selected' },
    ]);
  });
});
