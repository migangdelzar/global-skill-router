import type { SkillEntry } from '../domain/catalog.js';

export interface RouteRequest {
  task: string;
  explicitSkillId?: string;
  projectInstructions?: string;
}

export interface RouteResult {
  primary: SkillEntry | null;
  adjuncts: readonly SkillEntry[];
  rejected: readonly { id: string; reason: string }[];
  tooling: RouteTooling;
}

export interface RouteTooling {
  repositorySearchCommand: 'tgrep';
  cliOutputOptimizer: 'rtk' | null;
  rtkExcludedCommands: readonly ['tgrep'];
}

type Candidate = {
  skill: SkillEntry;
  score: number;
  order: number;
  forced: boolean;
};
type Role = 'primary' | 'adjunct' | 'reviewer';

export function route(request: RouteRequest, skills: readonly SkillEntry[]): RouteResult {
  const rejected: Array<{ id: string; reason: string }> = [];
  const explicitSkill = request.explicitSkillId === undefined
    ? undefined
    : skills.find((skill) => skill.id === request.explicitSkillId);

  if (request.explicitSkillId !== undefined && explicitSkill === undefined) {
    rejected.push({ id: request.explicitSkillId, reason: 'skill is not in the catalog' });
    return {
      primary: null,
      adjuncts: Object.freeze([]),
      rejected: Object.freeze(rejected),
      tooling: selectTooling(request.task, skills),
    };
  }

  const candidates = skills
    .map((skill, order): Candidate | null => {
      const explicit = request.explicitSkillId === skill.id;
      const projectInstructions = request.projectInstructions ?? '';
      const projectDirectMatch = containsPhrase(projectInstructions, skill.id);
      const projectMatch = matches(skill, projectInstructions);
      const taskMatch = matches(skill, request.task);
      if (skill.category === 'tooling') return null;
      if (!explicit && !projectMatch && (!taskMatch || skill.activation !== 'automatic')) {
        return null;
      }
      return {
        skill,
        score: explicit ? 3 : projectDirectMatch ? 2.5 : projectMatch ? 2 : 1,
        order,
        forced: explicit || projectDirectMatch,
      };
    })
    .filter((candidate): candidate is Candidate => candidate !== null)
    .sort((left, right) => right.score - left.score || left.order - right.order);

  let primary: SkillEntry | null = null;
  let adjunct: SkillEntry | null = null;
  let reviewer: SkillEntry | null = null;
  for (const candidate of candidates) {
    const { skill } = candidate;
    if (conflictsWithSelected(skill, primary, adjunct, reviewer)) {
      const selected = firstConflict(skill, primary, adjunct, reviewer);
      rejected.push({ id: skill.id, reason: `conflicts with ${selected.id}` });
      continue;
    }

    const role = classifyRole(skill);
    if (role === 'primary') {
      if (primary !== null) {
        rejected.push({ id: skill.id, reason: 'primary slot already selected' });
      } else {
        primary = skill;
      }
    } else if (role === 'adjunct') {
      if (adjunct !== null) {
        rejected.push({ id: skill.id, reason: 'adjunct slot already selected' });
      } else {
        adjunct = skill;
      }
    } else if (reviewer !== null) {
      rejected.push({ id: skill.id, reason: 'reviewer slot already selected' });
    } else {
      reviewer = skill;
    }
  }

  return {
    primary,
    adjuncts: Object.freeze([adjunct, reviewer].filter((skill): skill is SkillEntry => skill !== null)),
    rejected: Object.freeze(rejected),
    tooling: selectTooling(request.task, skills),
  };
}

function selectTooling(task: string, skills: readonly SkillEntry[]): RouteTooling {
  const rtk = skills.some(
    (skill) => skill.id === 'rtk-cli-filter' && skill.category === 'tooling' && matches(skill, task),
  );
  const requestsRawOutput = /\b(raw|exact|verbatim|unfiltered)\b[\s\w-]*\b(output|logs?)\b/i.test(task);
  return {
    repositorySearchCommand: 'tgrep',
    cliOutputOptimizer: rtk && !requestsRawOutput ? 'rtk' : null,
    rtkExcludedCommands: ['tgrep'],
  };
}

function matches(skill: SkillEntry, text: string): boolean {
  const normalizedText = normalize(text);
  return [skill.id, skill.category, ...skill.useWhen].some((trigger) => {
    return containsPhrase(normalizedText, trigger);
  });
}

function containsPhrase(text: string, phrase: string): boolean {
  const textTokens = normalize(text).split(' ').filter(Boolean);
  const phraseTokens = normalize(phrase).split(' ').filter(Boolean);
  if (phraseTokens.length === 0 || phraseTokens.length > textTokens.length) return false;

  return textTokens.some((_, index) =>
    index + phraseTokens.length <= textTokens.length &&
    phraseTokens.every((token, offset) => textTokens[index + offset] === token),
  );
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function classifyRole(skill: SkillEntry): Role {
  if (skill.category === 'adjunct') return 'adjunct';
  if (skill.category === 'reviewer') return 'reviewer';
  return 'primary';
}

function conflictsWithSelected(
  candidate: SkillEntry,
  primary: SkillEntry | null,
  adjunct: SkillEntry | null,
  reviewer: SkillEntry | null,
): boolean {
  return [primary, adjunct, reviewer].some(
    (selected) => selected !== null &&
      (candidate.conflictsWith.includes(selected.id) || selected.conflictsWith.includes(candidate.id)),
  );
}

function firstConflict(
  candidate: SkillEntry,
  primary: SkillEntry | null,
  adjunct: SkillEntry | null,
  reviewer: SkillEntry | null,
): SkillEntry {
  const selected = [primary, adjunct, reviewer].find(
    (entry): entry is SkillEntry => entry !== null &&
      (candidate.conflictsWith.includes(entry.id) || entry.conflictsWith.includes(candidate.id)),
  );
  if (selected === undefined) throw new Error('Conflict selected without a matching entry');
  return selected;
}
