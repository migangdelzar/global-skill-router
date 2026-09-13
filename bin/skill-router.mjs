#!/usr/bin/env node
import { runCliFromDisk } from '../dist/src/cli/main.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const installRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const result = await runCliFromDisk(process.argv.slice(2), join(installRoot, 'catalog/catalog.yaml'));
console.log(result.output);
process.exitCode = result.code;
