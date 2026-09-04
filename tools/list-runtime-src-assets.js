/**
 * Enumerate every file under app/src/main/assets/src/ that the app loads at
 * RUNTIME, so the Pages deploy can stage exactly those and no more.
 *
 * WHY THIS EXISTS
 * deploy-web.yml stages the web-facing tree with `--exclude='src'` (src/ is ES
 * module SOURCE — it is bundled into dist/, so shipping it would double the
 * artifact) and then copies a handful of files back in. That copy-back was a
 * hand-maintained glob, `src/data/bible-*.js`, and it silently rotted: the
 * Scripture Web landed `src/data/scripture-web-data.js` (2.6 MB, injected by
 * ScriptureWebScreen via `script.src`), which matches no `bible-*` glob, so the
 * deploy would have dropped it and the screen would 404 on the live PWA while
 * working perfectly in local preview. Nothing failed loudly; the file just
 * wasn't there.
 *
 * The fix is to DERIVE the list from the source that does the loading instead of
 * restating it in YAML. Any future `script.src = 'src/data/<something>.js'` is
 * picked up automatically, and `--check` fails the build if a derived file is
 * missing from disk or if the service worker precaches a src/ path this scan
 * doesn't see (the two lists must agree, or one of them is wrong).
 *
 * Loader shapes recognised (see src/data/translations.js + ScriptureWebScreen):
 *   script.src = 'src/data/bible-studies.js'        -> exact filename
 *   script.src = 'src/data/scripture-web-data.js'   -> exact filename
 *   script.src = 'src/data/bible-' + code + '.js'   -> prefix, expanded to a glob
 *
 * Usage:
 *   node tools/list-runtime-src-assets.js            # print paths, one per line
 *   node tools/list-runtime-src-assets.js --check    # validate, exit nonzero on drift
 *   node tools/list-runtime-src-assets.js --check --site _site   # also assert staged
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { resolve, dirname, join, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = resolve(root, 'app/src/main/assets');
const srcDir = resolve(assetsDir, 'src');

/** Recursively collect every .js/.jsx under a directory. */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * Every src/data file that tools/build.py CONCATENATES into a dist bundle.
 * Such a file is already inside the bundle the page loads, so it must NOT be
 * counted as a runtime asset — shipping it separately is dead weight, and
 * asserting it were staged would be asserting the wrong thing. This matters
 * because the translation loader's prefix ('src/data/bible-' + code + '.js')
 * globs to bible-audio-manifest.js too, which lives in bundle-a.
 */
function bundledSrcFiles() {
  const py = readFileSync(resolve(root, 'tools/build.py'), 'utf-8');
  return new Set([...py.matchAll(/['"](src\/data\/[A-Za-z0-9._-]+\.js)['"]/g)].map((m) => m[1]));
}

/**
 * Scan the source tree for runtime `src/...` loads and return the set of
 * asset paths (relative to app/src/main/assets) they resolve to.
 */
export function deriveRuntimeSrcAssets() {
  const found = new Set();
  const unresolved = [];
  const bundled = bundledSrcFiles();
  // Match the string literal that STARTS a runtime src/ path. A literal ending
  // in .js is a complete filename; anything else is a concatenation prefix
  // (e.g. 'src/data/bible-' + code + '.js') and expands to a glob.
  const re = /['"]src\/(data\/[A-Za-z0-9._-]*)['"]/g;

  for (const file of walk(srcDir)) {
    // Skip tests: they reference paths in prose/fixtures, not as real loads.
    if (/\.test\.(js|jsx)$/.test(file)) continue;
    const text = readFileSync(file, 'utf-8');
    let m;
    while ((m = re.exec(text)) !== null) {
      const frag = m[1];
      if (frag.endsWith('.js')) {
        found.add('src/' + frag);
        continue;
      }
      // Concatenation prefix -> expand against what's on disk.
      const dir = resolve(assetsDir, 'src', dirname(frag));
      const base = frag.slice(frag.lastIndexOf('/') + 1);
      if (!base || !existsSync(dir)) { unresolved.push({ file, frag }); continue; }
      const hits = readdirSync(dir)
        .filter((n) => n.startsWith(base) && n.endsWith('.js'))
        .map((n) => 'src/' + dirname(frag) + '/' + n)
        // A glob hit that is concatenated into a bundle is not a runtime asset.
        .filter((p) => !bundled.has(p));
      if (!hits.length) { unresolved.push({ file, frag }); continue; }
      for (const h of hits) found.add(h);
    }
  }
  return { assets: [...found].sort(), unresolved };
}

/**
 * Every root-level FILE the published site is allowed to carry, derived from
 * the service worker's own CORE_ASSETS list — the app's single source of truth
 * for what it caches — plus service-worker.js, which cannot appear in its own
 * list, plus the control files GitHub Pages reads.
 *
 * Only root entries: a CORE_ASSETS path containing a slash lives in dist/,
 * fonts/ or icons/, and those directories ship wholesale.
 */
export function allowedSiteRootFiles() {
  const sw = readFileSync(resolve(assetsDir, 'service-worker.js'), 'utf-8');
  const block = sw.match(/const CORE_ASSETS = \[([\s\S]*?)\];/);
  if (!block) return null;
  // Pages control files: not app assets, but legitimately published.
  const names = new Set(['service-worker.js', 'CNAME', '.nojekyll']);
  for (const m of block[1].matchAll(/'\.\/([^'/]+)'/g)) names.add(m[1]);
  return names;
}

/** Every './src/...' path the service worker precaches, as an assets-relative path. */
function swPrecachedSrcPaths() {
  const sw = readFileSync(resolve(assetsDir, 'service-worker.js'), 'utf-8');
  return [...sw.matchAll(/'\.\/(src\/[^']+)'/g)].map((m) => m[1]);
}

/** The CLI: print the derived list, or --check it (optionally against a staged site). */
function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const siteIdx = args.indexOf('--site');
  const site = siteIdx >= 0 ? args[siteIdx + 1] : null;

  const { assets, unresolved } = deriveRuntimeSrcAssets();

  if (!check) {
    for (const a of assets) console.log(a);
    process.exit(0);
  }

  let failed = false;
  const fail = (msg) => { console.error('[runtime-src-assets] ' + msg); failed = true; };

  if (!assets.length) fail('derived ZERO runtime src/ assets — the scanner is broken.');

  for (const u of unresolved) {
    fail(`could not resolve the runtime path prefix 'src/${u.frag}' referenced in ${relative(root, u.file)}. Add a matching file or teach this tool the new loader shape.`);
  }

  // Every derived asset must exist on disk.
  for (const a of assets) {
    if (!existsSync(resolve(assetsDir, a))) fail(`derived asset does not exist on disk: ${a}`);
  }

  // The SW's precache list and this scan must agree. A src/ path the SW precaches
  // but nothing loads means a dead precache entry; the reverse (handled above by
  // the deploy assertion) means a file that ships but never gets cached offline.
  const derived = new Set(assets);
  for (const p of swPrecachedSrcPaths()) {
    if (!derived.has(p)) {
      fail(`service-worker.js precaches '${p}' but no runtime loader in src/ references it — either it is dead weight in CORPUS_PRECACHE, or the loader uses a shape this tool cannot see (which means the deploy would drop the file).`);
    }
  }

  // When given a staged site, assert every derived asset actually landed there.
  // This is the check that would have caught scripture-web-data.js being dropped.
  if (site) {
    for (const a of assets) {
      if (!existsSync(resolve(root, site, a))) {
        fail(`runtime asset MISSING from the staged site (${site}/${a}) — it would 404 on the live PWA.`);
      }
    }

    // security-privacy-4 / service-worker-8: the deploy stages by EXCLUSION, so
    // it publishes whatever it was not told to drop. Assert the root positively
    // instead, in both directions — nothing extra, and nothing missing.
    const allowed = allowedSiteRootFiles();
    if (!allowed) {
      fail('could not parse CORE_ASSETS out of service-worker.js, so the staged root cannot be checked.');
    } else {
      for (const name of readdirSync(resolve(root, site))) {
        if (statSync(resolve(root, site, name)).isDirectory()) continue;
        if (!allowed.has(name)) {
          fail(`the staged site publishes a root file the app never asks for: ${name}. Either add it to CORE_ASSETS in service-worker.js, or exclude it in deploy-web.yml's staging step. Nothing reaches the public site by default.`);
        }
      }
      for (const name of allowed) {
        if (name === 'CNAME' || name === '.nojekyll') continue; // optional by nature
        if (!existsSync(resolve(root, site, name))) {
          fail(`CORE_ASSETS names '${name}' but it is MISSING from the staged site — the service worker would fail to install on every client.`);
        }
      }
    }
  }

  if (failed) {
    console.error(`[runtime-src-assets] FAILED. Derived ${assets.length} runtime src/ asset(s).`);
    process.exit(1);
  }
  console.log(`[runtime-src-assets] ok — ${assets.length} runtime src/ asset(s)${site ? ` all present in ${site}/` : ''}.`);
}

// Run the CLI only when invoked AS A SCRIPT. tools/check-corpus-version.js
// imports deriveRuntimeSrcAssets() (c41) so the corpus fingerprint covers every
// lazily fetched src/data file — an import must not print the list and exit 0,
// which would make the corpus gate pass without checking anything.
const invokedAsScript = !!process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href.toLowerCase() === import.meta.url.toLowerCase();
if (invokedAsScript) main();
