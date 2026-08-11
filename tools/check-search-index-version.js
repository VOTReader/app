/**
 * Tie MS_INDEX_VERSION to the code that actually shapes the search index.
 *
 * WHY THIS EXISTS
 * src/search/cache.js persists the built MiniSearch index to IndexedDB
 * (`vot-minisearch-cache`, ~21 MB) and restores it via MiniSearch.loadJSON. The
 * cache key is dataSignature(), which folds in MS_INDEX_VERSION,
 * CORPUS_CONTENT_VERSION, the translation, and structural corpus COUNTS. What it
 * does NOT fold in is the search code itself — so changing the doc shape, the
 * indexed fields, or the tokenizer produced a NEW builder that happily restored an
 * index built by the OLD one. The counts are unchanged, the corpus is unchanged,
 * so the signature matches and the stale index wins.
 *
 * That failure mode is worse than a stale service-worker cache: it lives in
 * IndexedDB, so neither a hard reload nor clearing the Cache Storage fixes it, and
 * the only remedy was remembering to hand-bump MS_INDEX_VERSION — a discipline
 * with no gate behind it. cache.js's own comment asks for the bump ("Bump on any
 * index-builder doc-shape OR search-config change"); this makes the request
 * enforceable.
 *
 * WHAT IS FINGERPRINTED — only files that decide whether an already-built index is
 * still VALID:
 *   index-builder.js      the documents that go in (doc shape / which fields exist)
 *   search-config.js      MS_FIELDS / MS_STORE_FIELDS / buildMiniSearchOptions
 *   tokenize.js           kjvEncode IS the index-time tokenizer (search-config.js:60)
 *   vendor/minisearch.js  the serialization format loadJSON has to read back
 *
 * Deliberately NOT fingerprinted: ranking.js, snippet.js, query-parse.js,
 * synonyms.js. Those run at QUERY time against whatever index exists, so a cached
 * index stays correct across changes to them — including them would force a
 * pointless ~21 MB rebuild on every ranking tweak.
 *
 * Usage:
 *   node tools/check-search-index-version.js              # update the lock
 *   node tools/check-search-index-version.js --check      # CI/pre-commit gate
 *   node tools/check-search-index-version.js --rebaseline # coverage grew, code didn't
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const searchDir = resolve(root, 'app/src/main/assets/src/search');
const cachePath = resolve(searchDir, 'cache.js');
const lockPath = resolve(here, 'search-index-version.lock');

const INDEX_SHAPING_FILES = [
  'index-builder.js',
  'search-config.js',
  'tokenize.js',
  'vendor/minisearch.js',
];

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const rebaseline = args.includes('--rebaseline');

function fail(msg) {
  console.error('');
  console.error('  \u2716 ' + msg);
  console.error('');
  process.exit(1);
}

// MS_INDEX_VERSION from cache.js (single source of truth).
const cacheText = readFileSync(cachePath, 'utf-8');
const m = cacheText.match(/export const MS_INDEX_VERSION = '([^']+)'/);
if (!m) fail("Could not find MS_INDEX_VERSION in src/search/cache.js.");
const indexVersion = m[1];

// Sanity: MS_INDEX_VERSION must actually be part of the cache key, or bumping it
// would change nothing. Guards against a refactor quietly dropping it.
if (!/'v:'\s*\+\s*MS_INDEX_VERSION/.test(cacheText)) {
  fail(
    "MS_INDEX_VERSION is no longer folded into dataSignature() in src/search/cache.js.\n" +
    '    Bumping it would then have NO effect on the cache key, so this gate cannot\n' +
    '    protect anything. Restore it in dataSignature() (see the \'v:\' component).'
  );
}

// CRLF-stripped so the hash is identical on Windows (CRLF) and CI (LF).
const hash = createHash('sha256');
for (const rel of INDEX_SHAPING_FILES) {
  const fp = resolve(searchDir, rel);
  if (!existsSync(fp)) {
    fail(
      'Missing index-shaping file: src/search/' + rel + '\n' +
      '    If it was renamed or removed, update INDEX_SHAPING_FILES in this tool —\n' +
      '    do not just drop it, or its changes stop busting the cached index.'
    );
  }
  hash.update(rel);
  hash.update(readFileSync(fp).filter((b) => b !== 0x0d));
}
const digest = hash.digest('hex').slice(0, 16);

const writeLock = () =>
  writeFileSync(lockPath, JSON.stringify({ version: indexVersion, hash: digest }, null, 2) + '\n');

let lock = null;
if (existsSync(lockPath)) {
  try { lock = JSON.parse(readFileSync(lockPath, 'utf-8')); } catch { lock = null; }
}

// In sync.
if (lock && lock.hash === digest) {
  if (lock.version !== indexVersion && !checkOnly) {
    writeLock();
    console.log(`[search-index-version] MS_INDEX_VERSION=${indexVersion} (search code unchanged) — lock version synced.`);
  } else {
    console.log(`[search-index-version] search code unchanged (MS_INDEX_VERSION=${indexVersion}) — OK.`);
  }
  process.exit(0);
}

// First run.
if (!lock) {
  if (checkOnly) fail('No tools/search-index-version.lock yet. Run `node tools/check-search-index-version.js` locally and commit the lock.');
  writeLock();
  console.log(`[search-index-version] initialized lock at MS_INDEX_VERSION=${indexVersion} (${digest}).`);
  process.exit(0);
}

// Coverage grew but the code did not change — same escape hatch as the corpus gate.
if (rebaseline) {
  if (checkOnly) fail('--rebaseline cannot be combined with --check.');
  const prev = lock.hash;
  writeLock();
  console.log(
    `[search-index-version] RE-BASELINED at MS_INDEX_VERSION=${indexVersion} (NOT bumped).\n` +
    `    fingerprint ${prev} -> ${digest}\n` +
    '    Use ONLY when this gate started covering MORE files, not when index-shaping\n' +
    '    code changed — otherwise every cached client keeps an index the current\n' +
    '    builder would not produce.'
  );
  process.exit(0);
}

const bumpHint = (() => {
  const mm = indexVersion.match(/^([a-z]*)(\d+)$/);
  return mm ? mm[1] + (parseInt(mm[2], 10) + 1) : indexVersion + '+1';
})();

if (lock.version === indexVersion) {
  fail(
    'SEARCH INDEX-SHAPING CODE CHANGED BUT MS_INDEX_VERSION WAS NOT BUMPED.\n' +
    `    MS_INDEX_VERSION is still '${indexVersion}'.\n` +
    '    Changed (fingerprint ' + lock.hash + ' -> ' + digest + ') — one of:\n' +
    INDEX_SHAPING_FILES.map((f) => '      src/search/' + f).join('\n') + '\n' +
    '\n' +
    '    The built index is persisted in IndexedDB (vot-minisearch-cache) and keyed\n' +
    '    by dataSignature(), which folds in MS_INDEX_VERSION but NOT the search code.\n' +
    '    So every existing client would RESTORE an index built by the old code and\n' +
    '    reuse it — and because it lives in IndexedDB, neither a hard reload nor\n' +
    '    clearing Cache Storage would dislodge it.\n' +
    '\n' +
    `    Bump MS_INDEX_VERSION in src/search/cache.js (e.g. '${indexVersion}' -> '${bumpHint}')\n` +
    '    with a comment saying what changed and why the old index must be discarded,\n' +
    '    then re-run this tool to update the lock and commit it.\n' +
    '\n' +
    '    ONLY IF this gate simply started covering more files (the code is unchanged):\n' +
    '      node tools/check-search-index-version.js --rebaseline'
  );
}

// Version bumped AND code changed → the correct flow.
if (checkOnly) {
  fail(
    `Search-index lock out of sync: MS_INDEX_VERSION='${indexVersion}' but the lock hash\n` +
    '    does not match the index-shaping files. Run\n' +
    '    `node tools/check-search-index-version.js` locally and commit the updated\n' +
    '    tools/search-index-version.lock.'
  );
}
writeLock();
console.log(`[search-index-version] search code changed; MS_INDEX_VERSION bumped to '${indexVersion}' — lock updated.`);
