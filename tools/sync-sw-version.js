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
let counted = 0;
for (const p of paths.sort()) {
  const fp = resolve(assetsDir, p.replace(/^\.\//, ''));
  if (existsSync(fp)) {
    hash.update(p);            // path, so add/remove/rename also shifts the hash
    // Strip CR bytes so the hash is identical whether the file is checked
    // out LF (Linux CI) or CRLF (Windows autocrlf) — otherwise the committed
    // hash wouldn't match CI's rebuild and the SW verify gate would fail.
    // Binary assets rarely contain 0x0D and it's stripped consistently on
    // both platforms, so the fingerprint stays deterministic either way.
    hash.update(readFileSync(fp).filter((b) => b !== 0x0d));
    counted++;
  }
}
const digest = hash.digest('hex').slice(0, 10);
const target = `v${version}-${digest}`;

const re = /const CACHE_VERSION = '[^']*';/;
if (!re.test(sw)) {
  console.error('[sw-version] could not find a CACHE_VERSION line in service-worker.js');
  process.exit(1);
}
const next = sw.replace(re, `const CACHE_VERSION = '${target}';`);
if (next === sw) {
  console.log(`[sw-version] CACHE_VERSION already '${target}' (${counted} core assets) — no change.`);
} else {
  writeFileSync(swPath, next);
  console.log(`[sw-version] CACHE_VERSION -> '${target}' (hashed ${counted} core assets).`);
}
