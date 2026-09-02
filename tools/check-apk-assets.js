#!/usr/bin/env node
/* check-apk-assets — the APK must still contain every RUNTIME-INJECTED asset.
 * ═══════════════════════════════════════════════════════════════════════
 * WHY THIS GATE EXISTS
 * app/build.gradle.kts trims dead weight out of the packaged assets via
 * androidResources.ignoreAssetsPatterns. That list is basename-matched and
 * has no negative-include, so it is easy to exclude something that IS
 * needed. It happened once: `<dir>src` removed assets/src/ wholesale, which
 * also removed the nine alternate Bible translations (NKJV-R and KJV-R
 * among them) and bible-studies.js — ~36 MB that src/data/translations.js
 * injects at runtime as <script src="src/data/…">. Nothing failed loudly:
 * the translation loader's onerror resolves, so every non-default
 * translation silently fell back to NKJV and Studies dead-ended.
 *
 * index.html's own <script>/<link> tags are NOT the whole runtime surface.
 * This gate reads the DYNAMIC injections out of the source and proves each
 * one survives the ignore list.
 *
 * Run: node tools/check-apk-assets.js
 * Exits non-zero (and explains) when a needed asset would be excluded.
 *
 * NON-VACUITY FLOORS (2026-09-01, tools/check-apk-assets.test.js): both sides
 * of this check are derived by regex over source text, and a regex that stops
 * matching finds nothing rather than failing. So the gate REFUSES to pass when
 * the ignoreAssetsPatterns block cannot be found (a reformat of
 * build.gradle.kts would otherwise disarm it silently) and when the source
 * scan derives zero runtime-injected paths (a loader refactor to
 * setAttribute('src', ...) would otherwise leave it checking an empty list
 * forever). Same standard as smoke-lite's linkage check and
 * list-runtime-src-assets --check, which already fail on an empty scan.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'app', 'src', 'main', 'assets');
const GRADLE = join(ROOT, 'app', 'build.gradle.kts');

/** Every `script.src = 'literal'` / `= "literal"` in the assets source tree. */
function collectInjectedPaths() {
  const found = new Set();
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'dist') walk(p); continue; }
      if (!/\.(js|jsx)$/.test(e.name) || /\.test\.(js|jsx)$/.test(e.name)) continue;
      const src = readFileSync(p, 'utf8');
      // script.src = 'src/data/bible-studies.js'
      for (const m of src.matchAll(/\.src\s*=\s*['"]([^'"]+\.js)['"]/g)) found.add(m[1]);
      // script.src = 'src/data/bible-' + code + '.js'  → expand the family
      for (const m of src.matchAll(/\.src\s*=\s*['"]([^'"]*\/)([a-z-]*)-['"]\s*\+/gi)) {
        found.add({ dir: m[1], prefix: m[2] + '-' });
      }
    }
  };
  walk(ASSETS);
  return found;
}

/** Resolve a concatenation-built family (src/data/bible-<code>.js) to real files. */
function expandFamily(entry) {
  const dir = join(ASSETS, entry.dir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(entry.prefix) && f.endsWith('.js') && !f.includes('.test.'))
    .map((f) => entry.dir + f);
}

/** The ignoreAssetsPatterns list, as written in build.gradle.kts. */
function readIgnorePatterns() {
  const g = readFileSync(GRADLE, 'utf8');
  const block = g.match(/ignoreAssetsPatterns\s*\+=\s*listOf\(([\s\S]*?)\n\s*\)/);
  if (!block) return null;
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** Does an aapt basename pattern exclude this relative asset path? */
function isExcluded(relPath, patterns) {
  const parts = relPath.split('/');
  const base = parts[parts.length - 1];
  const dirs = parts.slice(0, -1);
  for (const raw of patterns) {
    if (raw.startsWith('!')) continue;          // "!" only suppresses the warning
    let pat = raw, kind = 'any';
    if (pat.startsWith('<dir>')) { kind = 'dir'; pat = pat.slice(5); }
    else if (pat.startsWith('<file>')) { kind = 'file'; pat = pat.slice(6); }
    const match = (name) => {
      if (pat.startsWith('*')) return name.toLowerCase().endsWith(pat.slice(1).toLowerCase());
      if (pat.endsWith('*')) return name.toLowerCase().startsWith(pat.slice(0, -1).toLowerCase());
      return name.toLowerCase() === pat.toLowerCase();
    };
    if (kind !== 'file' && dirs.some(match)) return raw;   // an ancestor dir is ignored
    if (kind !== 'dir' && match(base)) return raw;
  }
  return null;
}

const patterns = readIgnorePatterns();
if (!patterns) {
  console.error('[apk-assets] FAIL — no `ignoreAssetsPatterns += listOf(` block found in');
  console.error('app/build.gradle.kts, so there is nothing to check the runtime assets');
  console.error('against. If the list moved to another DSL form (.addAll, = listOf, a');
  console.error('different indent), teach readIgnorePatterns() the new shape; if the list');
  console.error('is gone, retire this gate deliberately. A gate that finds no list must');
  console.error('not report success.');
  process.exit(1);
}

const needed = [];
for (const entry of collectInjectedPaths()) {
  if (typeof entry === 'string') needed.push(entry);
  else needed.push(...expandFamily(entry));
}

if (needed.length === 0) {
  console.error('[apk-assets] FAIL — the source scan derived 0 runtime-injected paths, so');
  console.error('this gate would be checking an empty list. The lazy loaders inject their');
  console.error('scripts as `el.src = "src/data/..."`; if one was refactored to');
  console.error('setAttribute("src", ...) or a template literal, teach collectInjectedPaths()');
  console.error('the new shape. A gate that checks nothing must not report success.');
  process.exit(1);
}

const missing = [];
const violations = [];
for (const rel of needed) {
  if (!existsSync(join(ASSETS, rel))) { missing.push(rel); continue; }
  const by = isExcluded(rel, patterns);
  if (by) violations.push({ rel, by });
}

if (missing.length) {
  console.warn('[apk-assets] WARN: runtime-injected path not found on disk:');
  for (const m of missing) console.warn('   ' + m);
}

if (violations.length) {
  console.error('\n[apk-assets] FAIL — these are injected at RUNTIME but would be');
  console.error('excluded from the packaged APK by ignoreAssetsPatterns:\n');
  for (const v of violations) console.error(`   ${v.rel}\n      excluded by pattern: "${v.by}"`);
  console.error('\nThe app would still build and boot, then fail silently at the');
  console.error('feature (the translation loader\'s onerror falls back to NKJV).');
  console.error('Narrow the pattern in app/build.gradle.kts.\n');
  process.exit(1);
}

console.log(`[apk-assets] OK — ${needed.length} runtime-injected assets all survive the ignore list (${patterns.length} patterns).`);
