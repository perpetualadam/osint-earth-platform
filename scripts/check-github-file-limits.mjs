#!/usr/bin/env node
/**
 * GitHub.com rejects blobs > 100 MiB; 50 MiB triggers a warning on push.
 * Repo-wide: githooks/pre-commit runs this on every commit (enable via npm install at root or
 * `node scripts/enable-git-hooks.mjs`). Manual check: `npm run check:github-limits` from repo root.
 * Optional scope: --staged --prefix some/dir/
 *
 * Per-file limit: splitting one huge file across commits does not help — use Git LFS or shrink the asset.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const WARN_BYTES = 50 * 1024 * 1024;
const MAX_BYTES = 100 * 1024 * 1024;

function repoRoot() {
  return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
}

function parseArgs() {
  const args = process.argv.slice(2);
  let prefix = '';
  let staged = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--staged') staged = true;
    else if (args[i] === '--prefix' && args[i + 1]) {
      prefix = args[++i].replace(/\\/g, '/').replace(/^\/+/, '');
      if (prefix && !prefix.endsWith('/')) prefix += '/';
    }
  }
  return { staged, prefix };
}

function stagedPaths(root, prefix) {
  const raw = execSync('git diff --cached --name-status', {
    encoding: 'utf8',
    cwd: root,
  });
  const paths = [];
  for (const line of raw.trim().split('\n')) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    if (tab < 1) continue;
    const status = line.slice(0, tab).trim();
    const filePath = line.slice(tab + 1).trim().replace(/\\/g, '/');
    if (status.startsWith('D')) continue;
    if (prefix !== '' && !filePath.startsWith(prefix)) continue;
    paths.push(filePath);
  }
  return paths;
}

function main() {
  const { staged, prefix } = parseArgs();
  const root = repoRoot();

  let paths;
  if (staged) {
    paths = stagedPaths(root, prefix);
    if (paths.length === 0) {
      console.log(
        'check-github-file-limits: no staged files' + (prefix ? ` under ${prefix}` : '') + '.'
      );
      process.exit(0);
    }
  } else {
    console.error(
      'Usage: node scripts/check-github-file-limits.mjs --staged [--prefix path/]\n' +
        '  Omit --prefix to check every staged file (e.g. before a mixed commit).'
    );
    process.exit(2);
  }

  const issues = [];
  for (const rel of paths) {
    const abs = path.join(root, rel);
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    if (st.size > MAX_BYTES) {
      issues.push({ rel, size: st.size, level: 'error' });
    } else if (st.size > WARN_BYTES) {
      issues.push({ rel, size: st.size, level: 'warn' });
    }
  }

  const fmt = (n) => `${(n / (1024 * 1024)).toFixed(2)} MiB`;
  let exitCode = 0;
  for (const { rel, size, level } of issues.sort((a, b) => b.size - a.size)) {
    const msg = `${rel} — ${fmt(size)}`;
    if (level === 'error') {
      console.error(`[BLOCKED] ${msg} (GitHub max is ${fmt(MAX_BYTES)} per file)`);
      exitCode = 1;
    } else {
      console.warn(`[WARN] ${msg} (GitHub warns above ${fmt(WARN_BYTES)})`);
    }
  }

  if (issues.length === 0) {
    console.log(
      `check-github-file-limits: OK (${paths.length} staged file(s)` +
        (prefix ? ` under ${prefix}` : '') +
        ').'
    );
  } else if (exitCode === 0) {
    console.log('check-github-file-limits: passed with warnings.');
  } else {
    console.error(
      'Remove or shrink these files, or use Git LFS. Splitting into multiple commits does not fix a single oversized file.'
    );
  }

  process.exit(exitCode);
}

main();
