/**
 * U3 — CORPUS_VERSION enforcement gate.
 *
 * The lazy corpus bundles (bundle-a-bible/matthew/vot.js) carry the scripture
 * + letter DATA. They are served CACHE-FIRST by the service worker and busted
 * ONLY by a manual CORPUS_VERSION bump — the content-hash CACHE_VERSION
 * (sync-sw-version.js) deliberately EXCLUDES them (a ~10 MB re-download must be
 * a deliberate act). The failure mode this gate closes: edit a verse → rebuild
 * → deploy WITHOUT bumping CORPUS_VERSION → every existing web client keeps the
 * STALE scripture forever, silently. On a scripture reader, corpus correctness
 * IS the product, so this must be impossible, not tribal knowledge.
 *
 * This gate pins the corpus-bundle hash in a committed lock file
 * (tools/corpus-version.lock = { version, hash }) and FAILS the commit/CI when
 * the corpus bytes changed but CORPUS_VERSION did not.
 *
 * Usage:
 *   node tools/check-corpus-version.js          (pre-commit) check + AUTO-UPDATE
 *       the lock when CORPUS_VERSION was bumped; FAIL if corpus changed with no
 *       bump. Writes/stages tools/corpus-version.lock.
 *   node tools/check-corpus-version.js --check   (CI) check ONLY, never writes.
 *       PASS iff the corpus bundles match the committed lock hash.
 *
 * The hash is CRLF-normalized (like sync-sw-version.js) so a Windows-committed
 * bundle and a Linux-CI rebuild produce the same fingerprint.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const distDir = resolve(root, 'app/src/main/assets/dist');
const dataDir = resolve(root, 'app/src/main/assets/src/data');
const swPath = resolve(root, 'app/src/main/assets/service-worker.js');
const lockPath = resolve(here, 'corpus-version.lock');

const CORPUS_BUNDLES = ['bundle-a-bible.js', 'bundle-a-matthew.js', 'bundle-a-vot.js'];
// SW1: bible-studies.js + the bible-<code>.js alt-translations are now served
// from the STABLE corpus cache (precache + cache-on-use), so — exactly like the
// dist corpus bundles — a content edit must bump CORPUS_VERSION or cached clients
// keep the stale data forever. Fold them into the gate's fingerprint. Globbed so
// a future translation is auto-covered.
const DATA_CORPUS = readdirSync(dataDir).filter((f) => /^bible-[a-z-]+\.js$/.test(f)).sort();
const checkOnly = process.argv.includes('--check');

function fail(msg) {
  console.error('');
  console.error('  ✖ ' + msg);
  console.error('');
  process.exit(1);
}

// CORPUS_VERSION from the service worker (single source of truth).
const sw = readFileSync(swPath, 'utf-8');
const cvMatch = sw.match(/const CORPUS_VERSION = '([^']+)'/);
if (!cvMatch) fail('Could not find CORPUS_VERSION in service-worker.js.');
const corpusVersion = cvMatch[1];

// SRCH1: the search-index cache signature (assets/search.js CORPUS_CONTENT_VERSION)
// folds in the corpus content version so a content-only corpus edit (a reworded
// verse of the same length) busts the stale search index — dataSignature is
// otherwise purely structural. Keep it equal to CORPUS_VERSION and fail closed if
// they diverge, so the corpus-edit → CORPUS_VERSION bump also rebuilds the index.
const searchPath = resolve(root, 'app/src/main/assets/search.js');
const ccvMatch = readFileSync(searchPath, 'utf-8').match(/var CORPUS_CONTENT_VERSION = '([^']+)'/);
if (!ccvMatch) fail('Could not find CORPUS_CONTENT_VERSION in app/src/main/assets/search.js.');
if (ccvMatch[1] !== corpusVersion) {
  fail(
    'SEARCH-CACHE VERSION OUT OF SYNC (SRCH1).\n' +
    `    app/src/main/assets/search.js  CORPUS_CONTENT_VERSION = '${ccvMatch[1]}'\n` +
    `    app/src/main/assets/service-worker.js  CORPUS_VERSION       = '${corpusVersion}'\n` +
    '    The search-index cache signature folds in CORPUS_CONTENT_VERSION so a corpus\n' +
    '    content edit busts the stale index — keep the two equal. Set\n' +
    `    CORPUS_CONTENT_VERSION = '${corpusVersion}' in search.js, then rebuild.`
  );
}

// Hash the corpus bundles (CRLF-stripped → deterministic cross-platform).
const hash = createHash('sha256');
for (const name of CORPUS_BUNDLES) {
  const fp = resolve(distDir, name);
  if (!existsSync(fp)) fail('Missing corpus bundle: ' + name + ' (run `npm run build` first).');
  hash.update(name);
  hash.update(readFileSync(fp).filter((b) => b !== 0x0d));
}
for (const name of DATA_CORPUS) {
  hash.update(name);
  hash.update(readFileSync(resolve(dataDir, name)).filter((b) => b !== 0x0d));
}
const digest = hash.digest('hex').slice(0, 16);

// Read the lock.
let lock = null;
if (existsSync(lockPath)) {
  try { lock = JSON.parse(readFileSync(lockPath, 'utf-8')); } catch { lock = null; }
}

function nextVersion(v) {
  const m = v.match(/^c(\d+)$/);
  return m ? 'c' + (parseInt(m[1], 10) + 1) : v + '+1';
}

function writeLock() {
  writeFileSync(lockPath, JSON.stringify({ version: corpusVersion, hash: digest }, null, 2) + '\n');
}

// ── Corpus bundles match the locked hash → in sync. ──
if (lock && lock.hash === digest) {
  if (lock.version !== corpusVersion && !checkOnly) {
    // Version bumped without a corpus change (deliberate forced re-download).
    // Keep the lock's version field consistent.
    writeLock();
    console.log(`[corpus-version] CORPUS_VERSION=${corpusVersion} (corpus unchanged) — lock version synced.`);
  } else {
    console.log(`[corpus-version] corpus unchanged (CORPUS_VERSION=${corpusVersion}) — OK.`);
  }
  process.exit(0);
}

// ── No lock yet → initialize it (first run). ──
if (!lock) {
  if (checkOnly) fail('No tools/corpus-version.lock yet. Run `node tools/check-corpus-version.js` locally and commit the lock.');
  writeLock();
  console.log(`[corpus-version] initialized lock at CORPUS_VERSION=${corpusVersion}.`);
  process.exit(0);
}

// ── Corpus bytes changed. ──
if (lock.version === corpusVersion) {
  // The exact bug this gate exists to prevent.
  fail(
    'CORPUS BUNDLES CHANGED BUT CORPUS_VERSION WAS NOT BUMPED.\n' +
    `    CORPUS_VERSION is still '${corpusVersion}'. The lazy corpus bundles\n` +
    '    (bundle-a-bible/matthew/vot.js) are SW-cached and busted ONLY by a\n' +
    '    CORPUS_VERSION change — so every existing web client would keep STALE\n' +
    '    scripture/letters forever. Bump CORPUS_VERSION in\n' +
    `    app/src/main/assets/service-worker.js  (e.g. ${corpusVersion} -> ${nextVersion(corpusVersion)}),\n` +
    '    then rebuild + re-commit.'
  );
}

// Version was bumped AND corpus changed → the correct flow.
if (checkOnly) {
  fail(
    `Corpus/lock out of sync: CORPUS_VERSION='${corpusVersion}' but the lock hash\n` +
    '    does not match the built corpus bundles. Run `node tools/check-corpus-version.js`\n' +
    '    locally and commit the updated tools/corpus-version.lock.'
  );
}
writeLock();
console.log(`[corpus-version] corpus changed; CORPUS_VERSION bumped to '${corpusVersion}' — lock updated.`);
process.exit(0);
