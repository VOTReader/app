/**
 * Derive the service worker's CACHE_VERSION from a content hash of the
 * core-cached assets — so the core cache auto-busts whenever any of those
 * assets actually changes, with no manual version bump.
 *
 * CACHE_VERSION = `v{package.version}-{hash}` where {hash} is a short
 * SHA-256 over the contents of every file in the SW's own CORE_ASSETS list
 * (index.html, the minified app.min.css, the dist bundles, vendor libs, fonts, icons,
 * images, offline page). The package.json version is kept only as a
 * human-readable prefix (handy in DevTools / for the APK) — it no longer
 * needs bumping for users to receive an update; the hash does that.
 *
 * CORPUS_VERSION is intentionally NOT touched here. The ~10 MB lazy corpus
 * bundles change only on scripture/letter DATA edits (rare), and a 10 MB
 * re-download for every installed client should be a DELIBERATE act — bump
 * CORPUS_VERSION by hand when corpus data changes.
 *
 * Wired into `npm run build` (build:sw), runs LAST so the bundles it hashes
 * are already rebuilt. Idempotent: no write when the hash is unchanged.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = resolve(root, 'app/src/main/assets');
const swPath = resolve(assetsDir, 'service-worker.js');

const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')).version || '0';
const sw = readFileSync(swPath, 'utf-8');

// Pull the CORE_ASSETS paths straight from the SW — single source of truth
// for what the core cache holds, so the hash always covers exactly that set.
const block = sw.match(/const CORE_ASSETS = \[([\s\S]*?)\];/);
if (!block) {
  console.error('[sw-version] could not find the CORE_ASSETS array in service-worker.js');
  process.exit(1);
}
// SW-1: strip comments from the array body FIRST. An apostrophe in prose (e.g.
// "wouldn't" in a CORE_ASSETS comment) would otherwise be read as a string
// delimiter, desyncing the '…' quote-pairing and silently dropping every asset
// after it from the hash — so editing those assets would never bust the cache.
const blockText = block[1]
  .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
  .replace(/\/\/[^\n]*/g, '');        // line comments
const paths = [...blockText.matchAll(/'([^']+)'/g)]
  .map((m) => m[1])
  .filter((p) => p !== './'); // the directory index is served by index.html
// Self-check: every CORE_ASSETS entry is a './'-prefixed literal, so the count of
// "'./" path-starts must equal paths.length + 1 (the filtered-out './' index). A
// mismatch means the parser desynced — fail LOUD rather than silently hash a SUBSET
// and ship stale assets to every installed client.
const pathStarts = (blockText.match(/'\.\//g) || []).length;
if (paths.length !== pathStarts - 1) {
  console.error(`[sw-version] CORE_ASSETS parse desync: extracted ${paths.length} path(s) but found ${pathStarts} './' start(s). Refusing to write a CACHE_VERSION that would hash only a subset of the cached assets.`);
  process.exit(1);
}

const hash = createHash('sha256');
// ASSET_INTEGRITY: a per-asset sha256 the SW checks each precached response
// against at install time (see the block comment above ASSET_INTEGRITY in
// service-worker.js). Built from the SAME files, read the SAME CR-stripped way,
// in the SAME loop that produces CACHE_VERSION — so the version and the
// expectation can never describe different builds, which is the whole point.
//
// SCOPE — core TEXT assets only (.js/.css/.html/.json). Those are what break the
// app when the bytes are wrong; fonts, icons and images are cosmetic if stale and
// are the bulk of the bytes, so verifying them would cost the most and protect the
// least. NOT covered, deliberately — and the service worker's comments must not
// claim otherwise: the ~10 MB corpus (CORPUS_PRECACHE, the lazy corpus bundles,
// fonts/reading) lives in the STABLE bucket that this hash has no authority over.
// Its staleness contract is CORPUS_VERSION, enforced by check-corpus-version.js.
const integrity = {};
const isVerifiable = (p) => /\.(js|css|html|json)$/.test(p);

let counted = 0;
for (const p of paths.sort()) {
  const fp = resolve(assetsDir, p.replace(/^\.\//, ''));
  if (existsSync(fp)) {
    // Read ONCE and reuse for both hashes. Reading twice meant CACHE_VERSION and
    // ASSET_INTEGRITY could hash different bytes for the same file if it changed
    // between the reads — and the entire guarantee is that the version and the
    // expectation describe the SAME build.
    // CR bytes are stripped so the hash is identical whether the file is checked
    // out LF (Linux CI) or CRLF (Windows autocrlf); otherwise the committed hash
    // would not match CI's rebuild. The service worker strips the response body
    // the same way before comparing, which is what makes the two agree.
    const bytes = readFileSync(fp).filter((b) => b !== 0x0d);
    if (isVerifiable(p)) {
      integrity[p] = createHash('sha256').update(bytes).digest('hex');
    }
    hash.update(p);            // path, so add/remove/rename also shifts the hash
    hash.update(bytes);
    counted++;
  } else if (isVerifiable(p)) {
    // A verifiable core asset absent from disk used to be silently dropped from
    // BOTH the version hash and the integrity map — so deleting or renaming, say,
    // dist/bundle-e.js produced a build that neither busts the cache nor notices
    // the gap. Fail loudly. (Binary assets stay tolerant: a missing icon is a
    // best-effort precache miss, not a broken app.)
    console.error(`[sw-version] CORE_ASSETS lists '${p}' but it does not exist at ${fp}.\n`
      + '  A verifiable core asset must exist: otherwise it silently leaves both the\n'
      + '  CACHE_VERSION hash and the ASSET_INTEGRITY map, and nothing fails.');
    process.exit(1);
  }
}

// './' is the directory index. It sits in CRITICAL_ASSETS and serves every
// navigation to /app/ — the document that BOOTS the app — yet it was the one
// critical asset left unverified, because it has no extension for isVerifiable to
// match. GitHub Pages serves index.html's bytes there (so does the local preview
// server), so it borrows index.html's hash rather than getting an exemption. If a
// host ever served something else at that path, install would refuse it — the
// correct outcome for a boot document that is not the one we built.
if (integrity['./index.html']) {
  integrity['./'] = integrity['./index.html'];
}
const digest = hash.digest('hex').slice(0, 10);
const target = `v${version}-${digest}`;

const re = /const CACHE_VERSION = '[^']*';/;
if (!re.test(sw)) {
  console.error('[sw-version] could not find a CACHE_VERSION line in service-worker.js');
  process.exit(1);
}
let next = sw.replace(re, `const CACHE_VERSION = '${target}';`);

// Rewrite the generated ASSET_INTEGRITY block in place. Marker-delimited rather
// than regex-matching the object literal, so a hash value can never be mistaken
// for the end of the block.
const BEGIN = '// ── BEGIN GENERATED: ASSET_INTEGRITY (tools/sync-sw-version.js) ──';
const END = '// ── END GENERATED: ASSET_INTEGRITY ──';
const bi = next.indexOf(BEGIN);
const ei = next.indexOf(END);
if (bi === -1 || ei === -1 || ei < bi) {
  console.error('[sw-version] could not find the ASSET_INTEGRITY generated block in service-worker.js.\n'
    + '  Expected these two marker lines:\n    ' + BEGIN + '\n    ' + END + '\n'
    + '  Without them the install-time integrity check would silently verify NOTHING.');
  process.exit(1);
}
// Exactly ONE marker pair. indexOf takes the FIRST of each, so a duplicated pair
// would be left behind and emit a second `const ASSET_INTEGRITY` — a SyntaxError
// that stops service-worker.js parsing at all, after which no client could ever
// register a new worker again. Cheap to check, catastrophic to miss.
if (next.indexOf(BEGIN) !== next.lastIndexOf(BEGIN) || next.indexOf(END) !== next.lastIndexOf(END)) {
  console.error('[sw-version] service-worker.js contains MORE THAN ONE ASSET_INTEGRITY marker pair.\n'
    + '  Rewriting would leave a second `const ASSET_INTEGRITY` behind — a SyntaxError that\n'
    + '  would stop the service worker parsing for every client. Remove the duplicate block.');
  process.exit(1);
}

const keys = Object.keys(integrity).sort();

// Refuse to write an EMPTY map. An empty object is valid JS, and the SW reads "no
// expectation" as "cache it unverified" — so a parser regression here would disable
// install-time verification silently while every test still passed. Checked BEFORE
// the splice, so a bad map is never even constructed.
if (!keys.length) {
  console.error('[sw-version] refusing to write an EMPTY ASSET_INTEGRITY map — that would silently disable install-time verification. Check the CORE_ASSETS parse.');
  process.exit(1);
}

// Every CRITICAL asset must be covered. These are the all-or-nothing boot set (the
// directory index, index.html, the CSS, the four eager bundles). If one is
// unverified, the bytes that actually boot the app are the ones we failed to
// check — which is exactly the hole './' fell through until it was given a hash.
const criticalBlock = sw.match(/const CRITICAL_ASSETS = new Set\(\[([\s\S]*?)\]\);/);
if (!criticalBlock) {
  console.error('[sw-version] could not find CRITICAL_ASSETS in service-worker.js — cannot prove the boot set is verified.');
  process.exit(1);
}
const criticalPaths = [...criticalBlock[1]
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  .matchAll(/'([^']+)'/g)].map((m) => m[1]);
const uncoveredCritical = criticalPaths.filter((p) => !integrity[p]);
if (uncoveredCritical.length) {
  console.error('[sw-version] these CRITICAL_ASSETS have no integrity hash: ' + uncoveredCritical.join(', ') + '\n'
    + '  They boot the app, so leaving them unverified defeats the check. Either give them\n'
    + "  a hash (see how './' borrows index.html's) or remove them from CRITICAL_ASSETS.");
  process.exit(1);
}

const body = keys.map((k) => `  '${k}': '${integrity[k]}',`).join('\n');
const integrityBlock = BEGIN + '\n'
  + 'const ASSET_INTEGRITY = {\n' + body + '\n};\n'
  + END;
next = next.slice(0, bi) + integrityBlock + next.slice(ei + END.length);

if (next === sw) {
  console.log(`[sw-version] CACHE_VERSION already '${target}' (${counted} core assets, ${keys.length} integrity hashes) — no change.`);
} else {
  writeFileSync(swPath, next);
  console.log(`[sw-version] CACHE_VERSION -> '${target}' (hashed ${counted} core assets, ${keys.length} integrity hashes).`);
}
