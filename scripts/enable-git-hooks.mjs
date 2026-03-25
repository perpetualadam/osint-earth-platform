#!/usr/bin/env node
/**
 * Point this repo at githooks/ so pre-commit runs for every commit.
 * Run once after clone: node scripts/enable-git-hooks.mjs
 * Or: npm install at repo root (prepare script).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.CI === 'true' || process.env.CI === '1') {
  process.exit(0);
}

let root;
try {
  root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
} catch {
  process.exit(0);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const hook = path.join(root, 'githooks', 'pre-commit');
if (!fs.existsSync(hook)) {
  console.error('enable-git-hooks: githooks/pre-commit not found.');
  process.exit(1);
}

execSync('git config core.hooksPath githooks', { cwd: root, stdio: 'inherit' });
console.log('Git hooks enabled: core.hooksPath = githooks (GitHub file-size check on commit).');
