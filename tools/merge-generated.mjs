#!/usr/bin/env node
/**
 * Git merge driver for the two files that mix hand-written code with generated lines (network ln1 item 5, 2026-10-05):
 * app/src/main/assets/service-worker.js (CACHE_VERSION, the ASSET_INTEGRITY hashes) and index.html (the CSP sha256-
 * hashes). service-worker.js changed in 217 of 486 main commits since 09-20; nearly every pair of parallel landings
 * conflicted on those generated lines alone.
 *
 *   git config merge.votgen-sw.driver "node tools/merge-generated.mjs %O %A %B"     (tools/install-merge-drivers.sh)
 *
 * It masks the generated values in all three versions, runs `git merge-file` on the masked texts, and when that is
 * clean writes the result back to %A with OUR generated values put back (theirs for an entry only they have). The
 * values may be stale for the merged tree: the next build rewrites them, land.sh rebuilds after every rebase, and CI's
 * `git diff --exit-code` after `npm run build` fails a commit that skipped the rebuild. A conflict in hand-written
 * lines is left to git exactly as a normal merge would (exit 1, conflict markers in %A).
 * The generated directories (dist/**, tools/*.generated.*) use merge.votgen-ours.driver = true: keep ours, rebuild.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, openSync, closeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CACHE_RE = /^(\s*const CACHE_VERSION = ')([^']*)(';.*)$/;
// each also matches its own placeholder, so unmask() can find the key of a line merge-file returned masked
const INTEGRITY_RE = /^(\s*'[^']+': ')([0-9a-f]{64}|@GENERATED@)(',?\s*)$/;
const CSP_HASH_RE = /'sha(?:256|384|512)?-(?:[A-Za-z0-9+/=]+|@GENERATED@)'/g;

/** A line's generated values replaced by placeholders; `key` names the line so its values can be put back. */
export function maskLine(line) {
  let m = CACHE_RE.exec(line);
  if (m) return { masked: `${m[1]}@GENERATED@${m[3]}`, key: 'CACHE_VERSION' };
  m = INTEGRITY_RE.exec(line);
  if (m) return { masked: `${m[1]}@GENERATED@${m[3]}`, key: m[1] };
  if (CSP_HASH_RE.test(line)) {
    CSP_HASH_RE.lastIndex = 0;
    const masked = line.replace(CSP_HASH_RE, "'sha-@GENERATED@'");
    return { masked, key: masked };
  }
  return { masked: line, key: null };
}

export function mask(text) {
  const values = new Map();
  const lines = text.split('\n').map((line) => {
    const { masked, key } = maskLine(line);
    if (key !== null && !values.has(key)) values.set(key, line);
    return masked;
  });
  return { text: lines.join('\n'), values };
}

/** Put generated values back: ours first, theirs for a line only they have; a line neither has keeps its mask. */
export function unmask(text, ours, theirs) {
  return text.split('\n').map((line) => {
    const { key } = maskLine(line);
    if (key === null || !line.includes('@GENERATED@')) return line;
    return ours.get(key) ?? theirs.get(key) ?? line;
  }).join('\n');
}

/** The whole merge on strings; returns { clean, text }. */
export function mergeGenerated(base, ours, theirs) {
  const dir = mkdtempSync(join(tmpdir(), 'votgen-'));
  try {
    const [mb, mo, mt] = [base, ours, theirs].map(mask);
    writeFileSync(join(dir, 'base'), mb.text);
    writeFileSync(join(dir, 'ours'), mo.text);
    writeFileSync(join(dir, 'theirs'), mt.text);
    // No pipes: merge-file writes the result into 'ours' and its stderr goes to a file. A sync spawn with a stdout
    // pipe waits for EOF, and on Windows any process spawned meanwhile by the same parent (a vitest worker thread
    // beside this one, 11-26) inherits the pipe's write end and holds it until it exits: 20-72 s a merge.
    const errFd = openSync(join(dir, 'err'), 'w');
    let r;
    try {
      r = spawnSync('git', ['merge-file', '-L', 'ours', '-L', 'base', '-L', 'theirs',
        join(dir, 'ours'), join(dir, 'base'), join(dir, 'theirs')], { stdio: ['ignore', 'ignore', errFd] });
    } finally {
      closeSync(errFd);
    }
    if (r.status < 0 || r.status === null || r.error) {
      throw new Error(`git merge-file failed: ${r.error || readFileSync(join(dir, 'err'), 'utf8')}`);
    }
    return { clean: r.status === 0, text: unmask(readFileSync(join(dir, 'ours'), 'utf8'), mo.values, mt.values) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [base, ours, theirs] = process.argv.slice(2);
  if (!theirs) {
    console.error('usage: merge-generated.mjs <base %O> <ours %A> <theirs %B>');
    process.exit(2);
  }
  const { clean, text } = mergeGenerated(...[base, ours, theirs].map((p) => readFileSync(p, 'utf8')));
  writeFileSync(ours, text);
  process.exit(clean ? 0 : 1);
}
