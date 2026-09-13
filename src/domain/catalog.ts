export type ActivationMode = 'automatic' | 'explicit';

export interface SkillEntry {
  id: string;
  category: string;
  source: string;
  skillPath: string;
  useWhen: readonly string[];
  activation: ActivationMode;
  conflictsWith: readonly string[];
  requires: readonly string[];
  releasePolicy: 'latest-stable-tag';
}

export class CatalogValidationError extends Error {
  constructor(field: string, message: string) {
    super(`Invalid catalog field ${field}: ${message}`);
    this.name = 'CatalogValidationError';
  }
}

type CatalogRecord = Record<string, unknown>;

const requiredStrings = ['id', 'category', 'source', 'skillPath'] as const;
const requiredArrays = ['useWhen', 'conflictsWith', 'requires'] as const;

export function parseCatalog(source: string): readonly SkillEntry[] {
  const document = parseDocument(source);
  if (!isRecord(document) || !Array.isArray(document.skills)) {
    throw new CatalogValidationError('skills', 'expected an array');
  }

  return Object.freeze(document.skills.map((entry, index) => validateEntry(entry, index)));
}

function parseDocument(source: string): unknown {
  const trimmed = source.trim();
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch (error) {
      throw new CatalogValidationError('document', `invalid JSON (${String(error)})`);
    }
  }

  const skills: CatalogRecord[] = [];
  let current: CatalogRecord | undefined;
  let activeArray: string | undefined;

  for (const [lineNumber, rawLine] of source.split(/\r?\n/).entries()) {
    const line = rawLine.replace(/\s+#.*$/, '');
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    const content = line.trim();

    if (indent === 0 && content === 'skills:') continue;
    if (indent === 2 && content.startsWith('- ')) {
      current = {};
      skills.push(current);
      activeArray = undefined;
      assignPair(current, content.slice(2), lineNumber + 1);
      continue;
    }
    if (current === undefined) {
      throw new CatalogValidationError(`line ${lineNumber + 1}`, 'expected a skill entry');
    }
    if (indent >= 6 && content.startsWith('- ') && activeArray !== undefined) {
      const values = current[activeArray];
      if (!Array.isArray(values)) {
        throw new CatalogValidationError(`skills[${skills.length - 1}].${activeArray}`, 'expected an array');
      }
      values.push(parseScalar(content.slice(2)));
      continue;
    }
    if (indent === 4) {
      const [key, value] = splitPair(content, lineNumber + 1);
      const normalizedKey = normalizeKey(key);
      if (value === '') {
        current[normalizedKey] = [];
        activeArray = normalizedKey;
      } else {
        current[normalizedKey] = parseScalar(value);
        activeArray = undefined;
      }
      continue;
    }
    throw new CatalogValidationError(`line ${lineNumber + 1}`, 'unsupported indentation or syntax');
  }

  return { skills };
}

function assignPair(entry: CatalogRecord, pair: string, lineNumber: number): void {
  const [key, value] = splitPair(pair, lineNumber);
  entry[normalizeKey(key)] = parseScalar(value);
  if (value === '') entry[normalizeKey(key)] = [];
}

function splitPair(line: string, lineNumber: number): [string, string] {
  const separator = line.indexOf(':');
  if (separator < 1) {
    throw new CatalogValidationError(`line ${lineNumber}`, 'expected key: value');
  }
  return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
}

function normalizeKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function parseScalar(value: string): unknown {
  if (value === '[]') return [];
  if (value === '{}') return {};
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value.startsWith('[') && value.endsWith(']')) {
    const body = value.slice(1, -1).trim();
    if (body === '') return [];
    return body.split(',').map((item) => unquote(item.trim()));
  }
  return unquote(value);
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function validateEntry(value: unknown, index: number): SkillEntry {
  if (!isRecord(value)) {
    throw new CatalogValidationError(`skills[${index}]`, 'expected an object');
  }
  const id = requiredString(value, 'id', index);
  const category = requiredString(value, 'category', index);
  const source = requiredString(value, 'source', index);
  const skillPath = requiredString(value, 'skillPath', index);
  const useWhen = requiredStringArray(value, 'useWhen', index);
  const conflictsWith = requiredStringArray(value, 'conflictsWith', index);
  const requires = requiredStringArray(value, 'requires', index);
  const activation = value.activation;
  if (activation !== 'automatic' && activation !== 'explicit') {
    throw new CatalogValidationError(`skills[${index}].activation`, 'expected automatic or explicit');
  }
  const releasePolicy = value.releasePolicy;
  if (releasePolicy !== 'latest-stable-tag') {
    throw new CatalogValidationError(
      `skills[${index}].releasePolicy`,
      'expected latest-stable-tag',
    );
  }

  return {
    id,
    category,
    source,
    skillPath,
    useWhen: Object.freeze([...useWhen]),
    activation,
    conflictsWith: Object.freeze([...conflictsWith]),
    requires: Object.freeze([...requires]),
    releasePolicy,
  };
}

function requiredString(entry: CatalogRecord, field: (typeof requiredStrings)[number], index: number): string {
  const value = entry[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CatalogValidationError(`skills[${index}].${field}`, 'expected a non-empty string');
  }
  return value;
}

function requiredStringArray(
  entry: CatalogRecord,
  field: (typeof requiredArrays)[number],
  index: number,
): string[] {
  const value = entry[field];
  if (!isStringArray(value)) {
    throw new CatalogValidationError(`skills[${index}].${field}`, 'expected an array of strings');
  }
  return value;
}

function isRecord(value: unknown): value is CatalogRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
