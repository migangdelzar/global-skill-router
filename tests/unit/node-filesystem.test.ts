import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeFileSystem } from '../../src/adapters/node.js';

describe('NodeFileSystem', () => {
  it('copies a selected file and creates its destination parent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skill-router-fs-'));
    const source = join(root, 'object', 'SKILL.md');
    const destination = join(root, 'session', 'active', 'skill', 'SKILL.md');
    await mkdir(join(root, 'object'));
    await writeFile(source, 'selected');

    await new NodeFileSystem().copyFile(source, destination);

    await expect(readFile(destination, 'utf8')).resolves.toBe('selected');
  });
});
