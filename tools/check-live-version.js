/**
 * Answer one question with certainty: IS WHAT I HAVE ACTUALLY LIVE?
 *
 * WHY THIS EXISTS
 * On 2026-08-11 the owner reported that PWA updates "do not push correctly" and
 * that caches "stay stale" across desktop Chrome, Edge, the installed phone PWA
 * and a plain Android browser. The service worker turned out to be fine — an
 * installed client provably adopts a new deploy under GitHub Pages' max-age=600.
 * The actual cause was that the newest work sat on a local branch with no
 * upstream that had never been pushed, so there was nothing on the server to be
 * stale about. Nothing in the toolchain would say so, and the symptom is
 * indistinguishable from a caching bug, so the wrong fix got attempted repeatedly.
 *
 * This tool closes that gap. It compares three things:
 *   LIVE      — the CACHE_VERSION/CORPUS_VERSION the deployed service worker serves
 *   COMMITTED — the same two values in HEAD's service-worker.js
 *   LOCAL     — the same two values in the working tree
 * and tells you plainly which of "not committed", "not pushed", "not deployed
 * yet", or "live" you are actually in.
 *
 * Usage:
 *   node tools/check-live-version.js            # report
 *   node tools/check-live-version.js --strict   # exit 1 unless HEAD is live
 *   node tools/check-live-version.js --wait     # poll until HEAD goes live (10 min cap)
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SW_PATH = 'app/src/main/assets/service-worker.js';
const LIVE_URL = 'https://votreader.github.io/app/service-worker.js';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const wait = args.includes('--wait');

/** Pull the two version literals out of a service-worker.js text. */
function versionsOf(text, label) {
  const cache = text.match(/const CACHE_VERSION = '([^']*)';/);
  const corpus = text.match(/const CORPUS_VERSION = '([^']*)'/);
  if (!cache) throw new Error(`could not find CACHE_VERSION in ${label}`);
  return { cache: cache[1], corpus: corpus ? corpus[1] : '(none)' };
}

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: root, encoding: 'utf-8' }).trim();
}

async function fetchLive() {
  // cache:'no-store' so this tool never reports a stale answer from Node's own
  // fetch cache — the whole point is to see what the server has RIGHT NOW.
  const res = await fetch(LIVE_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`live fetch failed: HTTP ${res.status}`);
  return versionsOf(await res.text(), 'the live site');
}

const local = versionsOf(readFileSync(resolve(root, SW_PATH), 'utf-8'), 'the working tree');
const committed = versionsOf(git(`show HEAD:${SW_PATH}`), 'HEAD');
const branch = git('rev-parse --abbrev-ref HEAD');
const swDirty = git(`status --porcelain -- ${SW_PATH}`) !== '';

// Is this branch's HEAD actually contained in what the deploy publishes (main)?
let onMain = false;
let unpushed = '(unknown)';
try {
  git('fetch origin main --quiet');
  onMain = git('branch --remotes --contains HEAD').split('\n').some((l) => l.trim() === 'origin/main');
  unpushed = git('rev-list --count origin/main..HEAD');
} catch (_e) { /* offline — fall through with what we have */ }

const live = await fetchLive();

const line = (k, v) => console.log(`  ${k.padEnd(12)} ${v}`);
console.log('\nVOTReader — deploy state\n');
line('LIVE', `${live.cache}  corpus ${live.corpus}`);
line('COMMITTED', `${committed.cache}  corpus ${committed.corpus}   (HEAD on ${branch})`);
line('LOCAL', `${local.cache}  corpus ${local.corpus}${swDirty ? '   [working tree DIRTY]' : ''}`);
console.log('');

const headIsLive = committed.cache === live.cache;
const problems = [];

if (local.cache !== committed.cache || swDirty) {
  problems.push('UNCOMMITTED: the working tree differs from HEAD. Commit (pre-commit rebuilds dist/ + the SW version) or these changes cannot reach anyone.');
}
if (!onMain) {
  problems.push(`NOT ON MAIN: HEAD is not contained in origin/main, so the deploy workflow will never publish it. ${unpushed !== '(unknown)' ? `${unpushed} commit(s) ahead of origin/main. ` : ''}The Pages deploy triggers only on a push to main.`);
}
if (onMain && !headIsLive) {
  problems.push('NOT DEPLOYED YET: HEAD is on origin/main but the live site still serves an older CACHE_VERSION. The deploy takes ~3 min — re-run this, or check: gh run list --workflow=deploy-web.yml');
}

// NOTE: this file sets process.exitCode and returns rather than calling
// process.exit(). undici's fetch keeps handles open briefly after the response is
// read, and process.exit() while they are closing trips a libuv assertion on
// Windows ("!(handle->flags & UV_HANDLE_CLOSING)") which exits 127 — a false
// failure that would poison this tool's use as a gate.

if (!problems.length) {
  console.log(`LIVE AND CURRENT — HEAD (${committed.cache}) is what votreader.github.io/app/ is serving.\n`);
} else {
  console.log('NOT LIVE:\n');
  for (const p of problems) console.log('  - ' + p);
  console.log('');

  const blocked = problems.some((p) => p.startsWith('UNCOMMITTED') || p.startsWith('NOT ON MAIN'));
  if (wait && !blocked) {
    const deadline = Date.now() + 10 * 60 * 1000;
    let landed = false;
    process.stdout.write('waiting for the deploy');
    while (Date.now() < deadline && !landed) {
      await new Promise((r) => setTimeout(r, 15000));
      process.stdout.write('.');
      const now = await fetchLive();
      if (now.cache === committed.cache) landed = true;
    }
    if (landed) {
      console.log(`\n\nLIVE — ${committed.cache} is now serving.\n`);
    } else {
      console.log('\n\nTIMED OUT after 10 min. Check: gh run list --workflow=deploy-web.yml\n');
      process.exitCode = 1;
    }
  } else if (strict) {
    process.exitCode = 1;
  }
}
