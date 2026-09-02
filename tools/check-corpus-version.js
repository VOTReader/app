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
import { deriveRuntimeSrcAssets } from './list-runtime-src-assets.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const assetsDir = resolve(root, 'app/src/main/assets');
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
// scripture-web-data.js joins them (2026-08-10): the Scripture Web graph asset
// is raw-injected + precached into the same STABLE corpus cache, so a
// regenerated dataset must bump CORPUS_VERSION or cached clients keep the old
// graph forever. Named explicitly — it doesn't match the bible-*.js glob.
// c41 (2026-09-01): UNION the glob with every src/data file a runtime loader in
// src/ actually fetches — tools/list-runtime-src-assets.js is the one scanner
// the deploy and the SW precache already agree on. audio-sync.js became a lazy
// file that day and matches neither the glob nor the explicit name, so without
// this it would have been pinned stale in every installed client on its next
// regeneration — exactly what this gate exists to prevent. Union, NOT
// replacement: the glob stays as an independent belt so the two gates cannot
// go blind together.
const RUNTIME_DATA = deriveRuntimeSrcAssets().assets
  .filter((p) => p.startsWith('src/data/'))
  .map((p) => p.slice('src/data/'.length));
const DATA_CORPUS = [...new Set(
  readdirSync(dataDir)
    .filter((f) => /^bible-[a-z-]+\.js$/.test(f) || f === 'scripture-web-data.js')
    .concat(RUNTIME_DATA)
)].sort();
for (const name of DATA_CORPUS) {
  if (!existsSync(resolve(dataDir, name))) {
    fail('A runtime loader in src/ fetches src/data/' + name + ' but it does not exist on disk.');
  }
}
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');

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

// SRCH1: the MiniSearch cache signature (src/search/cache.js
// CORPUS_CONTENT_VERSION) folds in the corpus content version so a content-only
// corpus edit (a reworded verse of the same length) busts the stale search
// index — dataSignature is otherwise purely structural. Keep it equal to
// CORPUS_VERSION and fail closed if they diverge, so the corpus-edit →
// CORPUS_VERSION bump also rebuilds the index. (Moved from the retired Classic
// engine's assets/search.js on 2026-07-02.)
const searchCachePath = resolve(root, 'app/src/main/assets/src/search/cache.js');
const ccvMatch = readFileSync(searchCachePath, 'utf-8').match(/export const CORPUS_CONTENT_VERSION = '([^']+)'/);
if (!ccvMatch) fail('Could not find CORPUS_CONTENT_VERSION in app/src/main/assets/src/search/cache.js.');
if (ccvMatch[1] !== corpusVersion) {
  fail(
    'SEARCH-CACHE VERSION OUT OF SYNC (SRCH1).\n' +
    `    app/src/main/assets/src/search/cache.js  CORPUS_CONTENT_VERSION = '${ccvMatch[1]}'\n` +
    `    app/src/main/assets/service-worker.js    CORPUS_VERSION         = '${corpusVersion}'\n` +
    '    The search-index cache signature folds in CORPUS_CONTENT_VERSION so a corpus\n' +
    '    content edit busts the stale index — keep the two equal. Set\n' +
    `    CORPUS_CONTENT_VERSION = '${corpusVersion}' in src/search/cache.js, then rebuild.`
  );
}

// The vendored Reading Fonts (2026-08-11). The SW precaches these into the
// STABLE corpus cache (READING_FONT_PRECACHE) precisely so an app-version bump
// does not re-download ~1.7 MB of never-changing faces. The consequence is that
// they were covered by NEITHER version: not listed in CORE_ASSETS (so outside the
// CACHE_VERSION content hash) and not in this fingerprint — so replacing or
// re-subsetting a font file busted NO cache, and every already-installed client
// would keep rendering the old face forever with nothing to dislodge it.
// Folding them in here puts them under the same rule as the corpus bundles: change
// the bytes, bump CORPUS_VERSION. Derived from the SW's OWN list (not a disk glob)
// so the gate cannot drift from what is actually pinned in the corpus bucket.
const READING_FONTS = [...sw.matchAll(/'\.\/(fonts\/reading\/[^']+)'/g)].map((m) => m[1]).sort();
if (!READING_FONTS.length) {
  fail(
    'Could not extract any fonts/reading/ paths from service-worker.js.\n' +
    '    READING_FONT_PRECACHE is the source of truth for this gate; if it was\n' +
    '    renamed or restructured, update the extraction here rather than dropping\n' +
    '    the fonts from the fingerprint (that is the hole this closed).'
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
for (const rel of READING_FONTS) {
  const fp = resolve(assetsDir, rel);
  if (!existsSync(fp)) {
    fail(
      'Missing reading font: ' + rel + '\n' +
      '    service-worker.js precaches it into the corpus cache, so it must exist.\n' +
      '    (tools/gen-reading-fonts.mjs prints the canonical list.)'
    );
  }
  hash.update(rel);
  hash.update(readFileSync(fp).filter((b) => b !== 0x0d));
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

// ── Deliberate re-baseline: the gate's COVERAGE grew, the bytes did not. ──
// Needed when this tool starts fingerprinting a set of files it previously
// ignored (e.g. fonts/reading/ joined the hash on 2026-08-11). The digest changes
// even though every byte a client already holds is identical, so the normal
// "bump CORPUS_VERSION" remedy would be wrong: it would force every installed
// client to re-download ~11 MB of unchanged corpus and fonts for nothing.
//
// Deliberately gated behind an explicit flag and loud output — this is the one
// path that accepts a new digest at an UNCHANGED version, so using it when real
// content changed would silently ship stale data to every cached client. Use it
// only when you can say why the bytes cannot have changed.
if (args.includes('--rebaseline')) {
  if (checkOnly) fail('--rebaseline cannot be combined with --check.');
  const prev = lock.hash;
  writeLock();
  console.log(
    `[corpus-version] RE-BASELINED at CORPUS_VERSION=${corpusVersion} (NOT bumped).\n` +
    `    fingerprint ${prev} -> ${digest}\n` +
    '    Use this ONLY when the fingerprint moved because the gate now covers MORE\n' +
    '    files, not because corpus content changed. Clients keep their existing\n' +
    `    vot-corpus-${corpusVersion} bucket, which is correct precisely because the\n` +
    '    bytes they hold are unchanged.'
  );
  process.exit(0);
}

// ── Corpus bytes changed. ──
if (lock.version === corpusVersion) {
  // The exact bug this gate exists to prevent.
  fail(
    'STABLE-CACHE CONTENT CHANGED BUT CORPUS_VERSION WAS NOT BUMPED.\n' +
    `    CORPUS_VERSION is still '${corpusVersion}'. Everything this gate\n` +
    '    fingerprints lives in the STABLE vot-corpus-<version> bucket, which a\n' +
    '    CACHE_VERSION bump does NOT clear — only a CORPUS_VERSION change does. So\n' +
    '    every already-installed client would keep the OLD bytes forever.\n' +
    '    Covered here:\n' +
    `      - the lazy corpus bundles      (${CORPUS_BUNDLES.join(', ')})\n` +
    `      - runtime src/data corpus files (${DATA_CORPUS.length}: bible-*.js, scripture-web-data.js, audio-sync.js — the glob UNION every src/data file a src/ loader fetches)\n` +
    `      - the vendored reading fonts    (${READING_FONTS.length} woff2 in fonts/reading/)\n` +
    '    Bump CORPUS_VERSION in\n' +
    `    app/src/main/assets/service-worker.js  (e.g. ${corpusVersion} -> ${nextVersion(corpusVersion)}),\n` +
    '    then rebuild + re-commit.\n' +
    '\n' +
    '    ONLY IF you know the bytes cannot have changed and this gate simply started\n' +
    '    covering MORE files, re-baseline instead (no client re-download):\n' +
    '      node tools/check-corpus-version.js --rebaseline'
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
