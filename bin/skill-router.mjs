#!/usr/bin/env node
import { runCliFromDisk } from '../dist/src/cli/main.js';

const result = await runCliFromDisk(process.argv.slice(2), 'catalog/catalog.yaml');
console.log(result.output);
process.exitCode = result.code;
