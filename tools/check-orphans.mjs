#!/usr/bin/env node
/* check-orphans — no module the bundles never load, no export nothing reads (arch-6, audit 2026-11-23).
   ═══════════════════════════════════════════════════════════════════════════════════════════════════
   Two checks over app/src/main/assets/src (tests, fixtures and data/ left out of the subject set):

   1. ORPHAN MODULES: every source module must be reachable through static or dynamic relative imports
      from a bundle entry (build:b/c/d/w in package.json, plus the injected jsx-inject.js). RowMenu.jsx
      sat here for weeks: no import, so not in bundle-d at all, kept alive by its CSS alone.
   2. DEAD EXPORTS: an exported name that no OTHER file reads (tests count) and that its own file never
      uses past the declaration is dead code. An export only its own file uses is merely over-exported,
      not dead, and is left alone. The word search is deliberately loose (any identifier or `.name`
      token), because the classic-globals bundles reach exports as free variables and namespace members.

   ALLOWLIST: each entry names why. Adding one is a deliberate edit, like re-baselining the bundle budget.
     - ui/jsx-inject.js `__jsx`/`__jsxFrag`: injected by esbuild's --inject for build:d; no file imports them,
       and deleting them breaks bundle-d (the audit's thrown-out arch-6 sub-claim).
     - ui/a11y/axe-run.js: loaded by the accessibility tools into a live page, never bundled.
     - the Journal namespace: ui/components/Journal*.jsx exports are spread into one namespace object
       (`...JournalParts`-style), so a member is read as `Journal.X`; the loose `.name` search already finds
       those, and any name it cannot is listed below rather than allowed wholesale.

   Usage: node tools/check-orphans.mjs [--json]   (exit 1 on any finding). tools/check-orphans.test.js runs it. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SRC = join(ROOT, 'app', 'src', 'main', 'assets', 'src');

export const ENTRIES = ['stores/_entry-b.js', 'renderer/_entry.js', 'ui/_entry-d.js', 'search/worker.js', 'ui/jsx-inject.js'];

/** Modules that are loaded some other way than an import, with the way. */
export const ORPHAN_ALLOW = new Map([
  ['ui/a11y/axe-run.js', 'injected into a live page by the a11y tools, never bundled'],
]);

/** "file name" pairs whose export is read by no file, with the reason it must stay. */
export const EXPORT_ALLOW = new Map([
  ['ui/jsx-inject.js __jsx', 'esbuild --inject (build:d jsx-factory)'],
  ['ui/jsx-inject.js __jsxFrag', 'esbuild --inject (build:d jsx-fragment)'],
]);

const posix = (p) => p.split(sep).join('/');
export const isTestish = (p) => /\.test\.|\.spec\.|(^|\/)__tests__\/|\.fixture\.|(^|\/)fixtures?\/|-harness\.|(^|\/)test-utils/.test(p);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(m?js|jsx)$/.test(name)) out.push(posix(relative(SRC, full)));
  }
  return out;
}

const IMPORT_RE = /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const EXPORT_DECL_RE = /^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST_RE = /^export\s*\{([^}]*)\}/gm;
const IDENT_RE = /[A-Za-z_$][\w$]*/g;

/** @param {string} s */
export function exportNames(s) {
  const out = [];
  let m;
  EXPORT_DECL_RE.lastIndex = 0;
  while ((m = EXPORT_DECL_RE.exec(s))) out.push(m[1]);
  EXPORT_LIST_RE.lastIndex = 0;
  while ((m = EXPORT_LIST_RE.exec(s))) {
    for (const part of m[1].split(',')) {
      const nm = part.trim().split(/\s+as\s+/).pop().trim();
      if (nm && nm !== 'default') out.push(nm);
    }
  }
  return out;
}

/** @param {string} src */
export function findOrphans(src = SRC) {
  const files = walk(src);
  const text = new Map(files.map((p) => [p, readFileSync(join(src, p), 'utf8')]));
  const resolve = (from, spec) => {
    if (!spec.startsWith('.')) return null;
    const base = posix(normalize(join(dirname(from), spec)));
    for (const c of [base, base + '.js', base + '.jsx', base + '.mjs', base + '/index.js']) if (text.has(c)) return c;
    return null;
  };
  const reached = new Set();
  const stack = ENTRIES.filter((e) => text.has(e));
  while (stack.length) {
    const p = stack.pop();
    if (reached.has(p)) continue;
    reached.add(p);
    IMPORT_RE.lastIndex = 0;
    let m;
    const s = text.get(p);
    while ((m = IMPORT_RE.exec(s))) {
      const r = resolve(p, m[1] || m[2] || m[3]);
      if (r && !reached.has(r)) stack.push(r);
    }
  }
  const subject = (p) => !isTestish(p) && !p.startsWith('data/');
  const orphans = files.filter((p) => subject(p) && !reached.has(p) && !ORPHAN_ALLOW.has(p));

  // Every identifier each file mentions, with how often.
  const idents = new Map();
  for (const [p, s] of text) {
    const counts = new Map();
    IDENT_RE.lastIndex = 0;
    let m;
    while ((m = IDENT_RE.exec(s))) counts.set(m[0], (counts.get(m[0]) || 0) + 1);
    idents.set(p, counts);
  }
  const deadExports = [];
  for (const p of files) {
    if (!subject(p) || !reached.has(p)) continue;
    for (const nm of exportNames(text.get(p))) {
      if (EXPORT_ALLOW.has(p + ' ' + nm)) continue;
      if ((idents.get(p).get(nm) || 0) > 1) continue; // used in its own file: over-exported, not dead
      let read = false;
      for (const [q, counts] of idents) if (q !== p && counts.has(nm)) { read = true; break; }
      if (!read) deadExports.push({ file: p, name: nm });
    }
  }
  return { orphans, deadExports, modules: files.filter(subject).length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const r = findOrphans();
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    for (const o of r.orphans) console.log('[check-orphans] orphan module (no import reaches it): ' + o);
    for (const d of r.deadExports) console.log('[check-orphans] dead export (no other file reads it): ' + d.file + ' ' + d.name);
    if (!r.orphans.length && !r.deadExports.length) console.log('[check-orphans] OK — ' + r.modules + ' modules, none orphaned, no dead export.');
  }
  process.exit(r.orphans.length || r.deadExports.length ? 1 : 0);
}
