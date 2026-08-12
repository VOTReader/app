/**
 * Prove the service worker's ASSET_INTEGRITY map describes the bytes actually on
 * disk — INDEPENDENTLY of the generator that wrote it.
 *
 * WHY THIS EXISTS (the hole it closes)
 * service-worker.js carries a GENERATED map of sha256 hashes and REFUSES to install
 * a build whose bytes disagree. tools/sync-sw-version.js writes that map during
 * `npm run build`. Those are two files, and nothing forced them to travel together:
 *
 *   - .githooks/pre-commit auto-stages service-worker.js but NOT tools/*, so the
 *     worker (with the map and the check) could land in a commit while the generator
 *     that maintains the map did not.
 *   - A later build then runs the OLD generator, which does not know the marker
 *     block, so it rewrites CACHE_VERSION and leaves the map untouched. The map now
 *     describes the PREVIOUS bundles.
 *   - `git diff --exit-code service-worker.js` after a build (ci.yml + deploy-web.yml)
 *     does NOT catch this: the old generator produced exactly the committed file, so
 *     there is no diff. The gate is structurally blind to which generator ran.
 *   - Every client then fails install and is pinned on its old build forever, which
 *     is the disease this whole mechanism exists to prevent, made worse.
 *
 * This gate re-derives the expected hashes from the assets themselves and compares.
 * It cannot be fooled by a stale generator, a hand-edited block, or a partial
 * commit, because it never asks what wrote the map — only whether the map is TRUE.
 *
 * It must stay behaviourally identical to sync-sw-version.js's hashing (same file
 * set, same CR-stripping, same './'-borrows-index.html rule). That duplication is
 * deliberate: a checker that imported the generator's logic would agree with it even
 * when the generator is wrong.
 *
 * Usage: node tools/check-asset-integrity.js [--check]   (always read-only; exit 1 on drift)
 */

import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = resolve(root, 'app/src/main/assets');
const swPath = resolve(assetsDir, 'service-worker.js');
const sw = readFileSync(swPath, 'utf-8');

const problems = [];
const fail = (m) => problems.push(m);

// ── The committed map ───────────────────────────────────────────
const blockMatch = sw.match(/const ASSET_INTEGRITY = \{([\s\S]*?)\};/);
if (!blockMatch) {
  console.error('[asset-integrity] no ASSET_INTEGRITY map found in service-worker.js.\n'
    + '  The install-time byte check cannot work without it. If it was removed on purpose,\n'
    + '  remove this gate in the same commit so the two cannot silently disagree.');
  process.exit(1);
}
const committed = {};
for (const m of blockMatch[1].matchAll(/'([^']+)':\s*'([0-9a-f]{64})'/g)) committed[m[1]] = m[2];
// Any entry that is not a well-formed url -> 64-hex pair means the block was
// hand-edited or the generator is malformed; a silently short/odd value would be
// compared and always mismatch, bricking installs.
const entryLines = blockMatch[1].split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
if (entryLines.length !== Object.keys(committed).length) {
  fail(`the map has ${entryLines.length} entry line(s) but only ${Object.keys(committed).length} parse as url -> 64-hex-sha256. Something is hand-edited or malformed.`);
}

// ── What the map SHOULD contain, derived from the assets ────────
const coreBlock = sw.match(/const CORE_ASSETS = \[([\s\S]*?)\];/);
if (!coreBlock) {
  console.error('[asset-integrity] could not find CORE_ASSETS in service-worker.js.');
  process.exit(1);
}
const corePaths = [...coreBlock[1]
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  .matchAll(/'([^']+)'/g)].map((m) => m[1]);

const isVerifiable = (p) => /\.(js|css|html|json)$/.test(p);
const hashOf = (rel) => createHash('sha256')
  .update(readFileSync(resolve(assetsDir, rel)).filter((b) => b !== 0x0d))
  .digest('hex');

const expected = {};
for (const p of corePaths) {
  if (!isVerifiable(p)) continue;
  const rel = p.replace(/^\.\//, '');
  if (!existsSync(resolve(assetsDir, rel))) {
    fail(`CORE_ASSETS lists '${p}' but the file does not exist — it can be neither hashed nor served.`);
    continue;
  }
  expected[p] = hashOf(rel);
}
// './' is served from index.html and borrows its hash (see service-worker.js).
if (corePaths.includes('./') && expected['./index.html']) expected['./'] = expected['./index.html'];

// ── Compare ────────────────────────────────────────────────────
for (const [p, want] of Object.entries(expected)) {
  if (!(p in committed)) {
    fail(`'${p}' has NO hash in the committed map, so it would be cached UNVERIFIED. Run \`npm run build\`.`);
  } else if (committed[p] !== want) {
    fail(`'${p}' hash is STALE.\n      committed ${committed[p].slice(0, 16)}…\n      on disk   ${want.slice(0, 16)}…\n      Every client would refuse to install this build. Run \`npm run build\` and commit the result.`);
  }
}
for (const p of Object.keys(committed)) {
  if (!(p in expected)) {
    fail(`the committed map has an entry for '${p}', which is not a verifiable CORE asset. A key the worker never looks up is dead weight; a key it DOES look up with the wrong name verifies nothing.`);
  }
}

// Every CRITICAL asset must be covered — these boot the app.
const critBlock = sw.match(/const CRITICAL_ASSETS = new Set\(\[([\s\S]*?)\]\);/);
if (critBlock) {
  const crit = [...critBlock[1]
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    .matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const bare = crit.filter((p) => !committed[p]);
  if (bare.length) fail('these CRITICAL_ASSETS have no hash in the committed map: ' + bare.join(', '));
} else {
  fail('could not find CRITICAL_ASSETS — cannot prove the boot set is verified.');
}

if (problems.length) {
  console.error('');
  console.error('  ✖ ASSET_INTEGRITY does not match the assets on disk:');
  for (const p of problems) console.error('    - ' + p);
  console.error('');
  console.error('  The service worker compares every CORE text asset against this map at install');
  console.error('  time and REFUSES a build whose bytes disagree — so a stale map does not mean');
  console.error('  "slightly wrong", it means NO CLIENT CAN UPDATE. Rebuild and commit.');
  console.error('');
  process.exit(1);
}
console.log(`[asset-integrity] ok — ${Object.keys(committed).length} hashes match the assets on disk.`);
