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
 * yet", or "live" you are actually in. "Live" includes LIVE (INCLUDED): other
 * work landed after yours and a later main commit that contains HEAD is the
 * build serving - by the time a deploy that waits for CI is live, usually so.
 *
 * Usage:
 *   node tools/check-live-version.js            # report
 *   node tools/check-live-version.js --strict   # exit 1 unless HEAD is live
 *   node tools/check-live-version.js --wait     # poll until HEAD goes live (25 min cap: the
 *                                               # deploy starts only after CI is green)
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
/** --wait's cap, in minutes: CI, then the deploy that waits for it, then Pages' cache. */
const WAIT_MIN = 25;

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

/**
 * A LATER main commit whose deploy is serving `cache`, when HEAD is on main: lanes push often, so by
 * the time anyone checks, HEAD's own build has usually been replaced by a newer one that contains it.
 * Main is linear, so every commit in HEAD..origin/main is a descendant of HEAD. Null when none of the
 * newest 50 carries `cache` (or git cannot answer).
 * @param {string} cache
 * @returns {string | null} the short SHA
 */
function laterCommitServing(cache) {
  try {
    const newer = git('rev-list --max-count=50 HEAD..origin/main').split('\n').filter(Boolean);
    for (const sha of newer) {
      if (versionsOf(git(`show ${sha}:${SW_PATH}`), sha).cache === cache) return sha.slice(0, 8);
    }
  } catch (_e) { /* offline or shallow: no answer */ }
  return null;
}

const headIsLive = committed.cache === live.cache;
const includedIn = onMain && !headIsLive ? laterCommitServing(live.cache) : null;
const problems = [];

if (local.cache !== committed.cache || swDirty) {
  problems.push('UNCOMMITTED: the working tree differs from HEAD. Commit (pre-commit rebuilds dist/ + the SW version) or these changes cannot reach anyone.');
}
if (!onMain) {
  problems.push(`NOT ON MAIN: HEAD is not contained in origin/main, so the deploy workflow will never publish it. ${unpushed !== '(unknown)' ? `${unpushed} commit(s) ahead of origin/main. ` : ''}The Pages deploy runs only after a green CI run of a push to main.`);
}
if (onMain && !headIsLive && !includedIn) {
  problems.push('NOT DEPLOYED YET: HEAD is on origin/main but the live site still serves an older CACHE_VERSION. The deploy starts when CI on main finishes green (~10 min) and takes ~4 more — re-run this with --wait, or check: gh run list --workflow=deploy-web.yml');
}

// NOTE: this file sets process.exitCode and returns rather than calling
// process.exit(). undici's fetch keeps handles open briefly after the response is
// read, and process.exit() while they are closing trips a libuv assertion on
// Windows ("!(handle->flags & UV_HANDLE_CLOSING)") which exits 127 — a false
// failure that would poison this tool's use as a gate.

if (!problems.length && includedIn) {
  console.log(`LIVE (INCLUDED) — HEAD is inside ${includedIn}, a later main commit whose build (${live.cache}) votreader.github.io/app/ is serving.\n`);
} else if (!problems.length) {
  console.log(`LIVE AND CURRENT — HEAD (${committed.cache}) is what votreader.github.io/app/ is serving.\n`);
} else {
  console.log('NOT LIVE:\n');
  for (const p of problems) console.log('  - ' + p);
  console.log('');

  const blocked = problems.some((p) => p.startsWith('UNCOMMITTED') || p.startsWith('NOT ON MAIN'));
  if (wait && !blocked) {
    // The deploy starts only when CI finishes green (deploy-web.yml, workflow_run):
    // CI ~10 min + deploy ~4 min + Pages' max-age=600 on service-worker.js.
    const deadline = Date.now() + WAIT_MIN * 60 * 1000;
    let landed = false;
    process.stdout.write('waiting for the deploy');
    while (Date.now() < deadline && !landed) {
      await new Promise((r) => setTimeout(r, 15000));
      process.stdout.write('.');
      const now = await fetchLive();
      if (now.cache === committed.cache) { landed = true; break; }
      try { git('fetch origin main --quiet'); } catch (_e) { /* offline: keep polling what we have */ }
      const later = laterCommitServing(now.cache);
      if (later) { landed = `inside ${later}, whose build ${now.cache} is serving`; break; }
    }
    if (landed === true) {
      console.log(`\n\nLIVE — ${committed.cache} is now serving.\n`);
    } else if (landed) {
      console.log(`\n\nLIVE (INCLUDED) — HEAD is ${landed}.\n`);
    } else {
      console.log(`\n\nTIMED OUT after ${WAIT_MIN} min. Check CI first (the deploy waits for it), then: gh run list --workflow=deploy-web.yml\n`);
      process.exitCode = 1;
    }
  } else if (strict) {
    process.exitCode = 1;
  }
}
