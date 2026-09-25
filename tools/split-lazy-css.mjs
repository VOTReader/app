#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   split-lazy-css — the rules of app.css that only a LAZY screen bundle can
   use leave the render-blocking stylesheet (improvement sweep 2, n7-08).

   Measured 2026-09-25: 91.5 KB of the 336 KB dist/app.min.css (27 %) styled
   only screens of bundle-e (Settings, Search, Garden), -f (the Scripture
   Web), -g (Personal Study) or -h (the Listening Library), yet every cold
   boot downloaded, parsed and matched them before the first paint. This step
   runs after build:css and writes

     dist/app.min.css        what the boot path can use (render-blocking)
     dist/screens-X.min.css  what only bundle-X can use (X = e, f, g, h),
                             loaded by __makeLazyLoader beside bundle-X.js;
                             the screen renders once both have landed.

   app.css stays the one source: authors keep writing there, and a rule
   moves by itself once only a lazy bundle names its classes.

   WHICH RULES MOVE. esbuild's metafile says which source files each bundle
   holds. A class is LAZY-X when every file that names it (src/, index.html,
   the Kotlin shell) sits only in bundle-X; a class named nowhere, named by an
   eager file (bundle-a..d, index.html, anything outside the esbuild graphs:
   the corpora, the loaders' scripts), or starting with a prefix an eager file
   builds names from ('hl-' + colour) stays eager. A rule moves to X when
   each of its selector's alternatives names a LAZY-X class outside
   :not/:is/:where/:has.

   THE CASCADE STAYS AS IT WAS. The loader puts each lazy sheet right after
   the boot sheet's <link> (before the <style> blocks the journal and the
   highlights screen inject), so a moved rule now comes after every rule
   left in app.min.css, and the lazy sheets land in whatever order the reader
   opens their screens. So a rule moves only when no LATER rule outside its own sheet
   could have overridden it: none with the same specificity setting a
   property of the same family (margin/margin-left, font/line-height, inset/
   top, ...). Decided from the last rule back, so each decision sees the
   final place of every rule after it. Against earlier rules a later sheet
   changes nothing: the moved rule beat them before and still does.

   usage: node tools/split-lazy-css.mjs [--check]   (--check: report, write nothing)
   ═══════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'app', 'src', 'main', 'assets');
const DIST = join(ASSETS, 'dist');
const require = createRequire(join(ROOT, 'package.json'));

/** The lazy bundles and their entries (package.json build:e..h); the eager ones (build:b..d). */
export const LAZY_BUNDLES = { e: 'src/ui/_entry-e.js', f: 'src/ui/_entry-f.js', g: 'src/ui/_entry-g.js', h: 'src/ui/_entry-h.js' };
const EAGER_BUNDLES = { b: 'src/stores/_entry-b.js', c: 'src/renderer/_entry.js', d: 'src/ui/_entry-d.js' };
export const lazyCssName = (x) => 'screens-' + x + '.min.css';

const norm = (p) => resolve(p).replace(/\\/g, '/').toLowerCase();

/* ── which bundle holds which file ───────────────────────────────────── */

async function fileBundles() {
  const esbuild = require('esbuild');   // here, not at import: the unit tests load this module under jsdom
  /** @type {Map<string, Set<string>>} */
  const out = new Map();
  for (const [b, entry] of Object.entries({ ...EAGER_BUNDLES, ...LAZY_BUNDLES })) {
    // absWorkingDir: the metafile's paths are relative to it, and they are joined to ROOT below.
    const r = await esbuild.build({ entryPoints: [join(ASSETS, entry)], absWorkingDir: ROOT, bundle: true, write: false, metafile: true, format: 'iife', target: 'chrome108', logLevel: 'silent' });
    if (Object.keys(r.metafile.inputs).length < 2) throw new Error('[split-lazy-css] esbuild found no inputs for bundle-' + b + ' (' + entry + ')');
    for (const input of Object.keys(r.metafile.inputs)) {
      const key = norm(join(ROOT, input));
      if (!out.has(key)) out.set(key, new Set());
      out.get(key).add(b);
    }
  }
  return out;
}

/** Every file that can put a class name on the page: the web source and index.html (the Kotlin shell injects none). */
function sourceFiles() {
  const out = [];
  const walk = (dir, re) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist') walk(p, re); }
      else if (re.test(e.name) && !/\.test\.|\.fixture\./.test(e.name)) out.push(p);
    }
  };
  walk(join(ASSETS, 'src'), /\.(jsx?|mjs)$/);
  for (const e of readdirSync(ASSETS, { withFileTypes: true })) if (e.isFile() && /\.(js|html)$/.test(e.name)) out.push(join(ASSETS, e.name));
  return out;
}

/* ── classes: eager or LAZY-X ────────────────────────────────────────── */

/** Two classes named this close (one className expression, one classList call) may share an element. */
const NEAR = 240;

/** @param {Set<string>} cssClasses the classes the sheet names */
async function classifier(cssClasses) {
  const bundles = await fileBundles();
  /** @type {{ tokens: Set<string>, at: Map<string, number[]>, lazy: string | null }[]} */
  const files = [];
  const eagerPrefixes = new Set();
  for (const f of sourceFiles()) {
    const text = readFileSync(f, 'utf8');
    const bs = bundles.get(norm(f));
    const lazy = bs && [...bs].every((b) => b in LAZY_BUNDLES) ? [...bs].sort().join('+') : null;
    const tokens = new Set();
    /** @type {Map<string, number[]>} where each of the sheet's classes is named in this file */
    const at = new Map();
    for (const m of text.matchAll(/[A-Za-z_][\w-]*/g)) {
      tokens.add(m[0]);
      if (cssClasses.has(m[0])) { if (!at.has(m[0])) at.set(m[0], []); at.get(m[0]).push(m.index); }
    }
    files.push({ tokens, at, lazy });
    // 'hl-' + colour, `nb-${kind}`: an eager file that BUILDS class names keeps every class it could build.
    if (!lazy) for (const m of text.matchAll(/['"`]([A-Za-z][\w-]*-)(?=['"`]|\$\{)/g)) eagerPrefixes.add(m[1]);
  }
  const cache = new Map();
  /** Two classes can sit on one element only if some file names them within NEAR characters of each other. */
  const pairs = new Map();
  const together = (x, y) => {
    if (x === y) return true;
    const key = x < y ? x + ' ' + y : y + ' ' + x;
    if (!pairs.has(key)) {
      pairs.set(key, files.some((f) => {
        const px = f.at.get(x), py = f.at.get(y);
        if (!px || !py) return false;
        for (const i of px) for (const j of py) if (Math.abs(i - j) <= NEAR) return true;
        return false;
      }));
    }
    return pairs.get(key);
  };
  /** @param {string} c @returns {string | null} a single lazy bundle, else null (eager) */
  const lazyOf = (c) => {
    if (cache.has(c)) return cache.get(c);
    let out = null;
    let named = false;
    const keys = new Set();
    for (const f of files) {
      if (!f.tokens.has(c)) continue;
      named = true;
      if (!f.lazy) { keys.clear(); named = false; break; }
      keys.add(f.lazy);
    }
    if (named && keys.size === 1) {
      const k = [...keys][0];
      if (k.length === 1 && ![...eagerPrefixes].some((p) => c.startsWith(p))) out = k;
    }
    cache.set(c, out);
    return out;
  };
  return { lazyOf, together };
}

/* ── the stylesheet as a tree ────────────────────────────────────────── */

/** Index of the brace closing the one opened just before `i`, skipping strings. */
function closeOf(src, i) {
  let depth = 1;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === '"' || ch === "'") { j = src.indexOf(ch, j + 1); if (j < 0) return src.length; continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return j;
  }
  return src.length;
}

const GROUPING = /^@(media|supports|container|layer)\b/;

/** @returns {any[]} nodes: { rule: sel, body } | { at: prelude, kids } | { raw } */
export function parseCss(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (i >= src.length) break;
    if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; out.push({ raw: src.slice(i, end) }); i = end; continue; }
    const brace = src.indexOf('{', i);
    const semi = src.indexOf(';', i);
    if (src[i] === '@' && semi >= 0 && (brace < 0 || semi < brace)) { out.push({ raw: src.slice(i, semi + 1) }); i = semi + 1; continue; }
    if (brace < 0) { out.push({ raw: src.slice(i) }); break; }
    const head = src.slice(i, brace).trim();
    const end = closeOf(src, brace + 1);
    const body = src.slice(brace + 1, end);
    if (GROUPING.test(head)) out.push({ at: head, kids: parseCss(body) });
    else if (head.startsWith('@')) out.push({ raw: src.slice(i, end + 1) });
    else out.push({ rule: head, body });
    i = end + 1;
  }
  return out;
}

/** @param {any[]} nodes @param {(rule: any) => boolean} keep */
function serialize(nodes, keep) {
  let s = '';
  for (const n of nodes) {
    if (n.raw != null) { if (keep(n)) s += n.raw; }
    else if (n.at != null) { const inner = serialize(n.kids, keep); if (inner) s += n.at + '{' + inner + '}'; }
    else if (keep(n)) s += n.rule + '{' + n.body + '}';
  }
  return s;
}

/* ── specificity and property families ───────────────────────────────── */

/** Split on top-level commas. */
function alternatives(sel) {
  const out = [];
  let depth = 0, from = 0;
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) { out.push(sel.slice(from, i)); from = i + 1; }
  }
  out.push(sel.slice(from));
  return out.map((s) => s.trim());
}

/** Selectors-4 specificity of one complex selector, as a*1e6 + b*1e3 + c. */
export function specificity(sel) {
  let a = 0, b = 0, c = 0;
  let s = sel;
  // Functional pseudo-classes: :where() counts nothing; :is/:not/:has count their most specific argument.
  for (;;) {
    const m = s.match(/:(where|is|not|has|matches|-webkit-any)\(/);
    if (!m) break;
    const open = m.index + m[0].length;
    let depth = 1, j = open;
    for (; j < s.length && depth; j++) { if (s[j] === '(') depth++; else if (s[j] === ')') depth--; }
    const args = s.slice(open, j - 1);
    if (m[1] !== 'where') {
      const best = Math.max(0, ...alternatives(args).map(specificity));
      a += Math.floor(best / 1e6); b += Math.floor(best / 1e3) % 1e3; c += best % 1e3;
    }
    s = s.slice(0, m.index) + ' ' + s.slice(j);
  }
  s = s.replace(/\[[^\]]*\]/g, () => { b++; return ' '; });
  s = s.replace(/::[\w-]+(\([^)]*\))?|:(before|after|first-line|first-letter)\b/g, () => { c++; return ' '; });
  s = s.replace(/:[\w-]+(\([^)]*\))?/g, () => { b++; return ' '; });
  s = s.replace(/#[\w-]+/g, () => { a++; return ' '; });
  s = s.replace(/\.[\w-]+/g, () => { b++; return ' '; });
  c += (s.match(/(^|[\s>+~])[A-Za-z][\w-]*/g) || []).length;
  return a * 1e6 + b * 1e3 + c;
}

const GROUPS = [
  ['inset', 'top', 'right', 'bottom', 'left'],
  ['gap', 'row', 'column', 'grid'],
  ['place', 'align', 'justify'],
  ['font', 'line'],
  ['columns', 'column'],
  ['size', 'width', 'height', 'block', 'inline'],
];
/** A declaration's family: its first word, vendor prefix dropped; custom properties stand alone. */
const family = (p) => (p.startsWith('--') ? p : p.replace(/^-(webkit|moz|ms|o)-/, '').split('-')[0]);
function familiesClash(x, y) {
  if (x === y || x === 'all' || y === 'all') return true;
  if (x.startsWith('--') || y.startsWith('--')) return false;
  return GROUPS.some((g) => g.includes(x) && g.includes(y));
}
function declFamilies(body) {
  const out = new Set();
  let depth = 0, from = 0;
  for (let i = 0; i <= body.length; i++) {
    const ch = body[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if ((ch === ';' || i === body.length) && depth === 0) {
      const decl = body.slice(from, i);
      const colon = decl.indexOf(':');
      if (colon > 0) out.add(family(decl.slice(0, colon).trim().toLowerCase()));
      from = i + 1;
    }
  }
  return out;
}

/* ── the split ───────────────────────────────────────────────────────── */

/** Classes an alternative REQUIRES (outside functional pseudo-classes). */
function requiredClasses(alt) {
  let s = alt;
  for (;;) {
    const m = s.match(/:[\w-]+\(/);
    if (!m) break;
    const open = m.index + m[0].length;
    let depth = 1, j = open;
    for (; j < s.length && depth; j++) { if (s[j] === '(') depth++; else if (s[j] === ')') depth--; }
    s = s.slice(0, m.index) + ' ' + s.slice(j);
  }
  return (s.replace(/\[[^\]]*\]/g, ' ').match(/\.[A-Za-z_][\w-]*/g) || []).map((x) => x.slice(1));
}

/** The last compound of a complex selector: its element name, classes and pseudo-element. */
function lastCompound(alt) {
  let depth = 0, from = 0;
  for (let i = 0; i < alt.length; i++) {
    const ch = alt[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) from = i + 1;
  }
  const compound = alt.slice(from);
  const pe = (compound.match(/::([\w-]+)|:(before|after|first-line|first-letter)\b/) || [])[0] || '';
  const tag = (compound.match(/^[A-Za-z*][\w-]*/) || [''])[0].toLowerCase();
  return { tag, pe: pe.replace(/^:+/, ''), classes: requiredClasses(compound) };
}

/** Could these two compounds style one box? Never when their pseudo-elements or elements differ, or two of
 * their classes are never named together. @param {(x: string, y: string) => boolean} together */
function mayOverlap(a, b, together) {
  if (a.pe !== b.pe) return false;
  if (a.tag && b.tag && a.tag !== '*' && b.tag !== '*' && a.tag !== b.tag) return false;
  return a.classes.every((x) => b.classes.every((y) => together(x, y)));
}

/**
 * @param {string} css the full minified sheet
 * @param {(cls: string) => string | null} lazyOf
 * @param {(x: string, y: string) => boolean} together two classes can sit on one element
 * @returns {{ eager: string, lazy: Record<string, string>, moved: Record<string, number> }}
 */
export function splitCss(css, lazyOf, together) {
  const tree = parseCss(css);
  /** @type {any[]} */
  const flat = [];
  (function walk(nodes) { for (const n of nodes) { if (n.kids) walk(n.kids); else if (n.rule != null) flat.push(n); } })(tree);
  for (const r of flat) {
    r.alts = alternatives(r.rule);
    r.parts = r.alts.map((alt) => ({ spec: specificity(alt), last: lastCompound(alt) }));
    r.fams = [...declFamilies(r.body)];
    r.place = null;
    /** @type {Set<string> | null} */
    let common = null;
    for (const alt of r.alts) {
      const here = new Set(requiredClasses(alt).map(lazyOf).filter(Boolean));
      common = common ? new Set([...common].filter((x) => here.has(x))) : here;
      if (!common.size) break;
    }
    r.want = common && common.size ? [...common].sort()[0] : null;
  }
  // From the last rule back: a rule moves to X only if no later rule outside X could override it.
  for (let i = flat.length - 1; i >= 0; i--) {
    const r = flat[i];
    if (!r.want) continue;
    let safe = true;
    for (let j = i + 1; j < flat.length && safe; j++) {
      const later = flat[j];
      if (later.place === r.want) continue;
      if (!r.fams.some((f) => later.fams.some((g) => familiesClash(f, g)))) continue;
      if (r.parts.some((p) => later.parts.some((q) => p.spec === q.spec && mayOverlap(p.last, q.last, together)))) safe = false;
    }
    if (safe) r.place = r.want;
  }
  const lazy = {};
  const moved = {};
  for (const x of Object.keys(LAZY_BUNDLES)) {
    lazy[x] = serialize(tree, (n) => n.rule != null && n.place === x);
    moved[x] = flat.filter((r) => r.place === x).length;
  }
  const eager = serialize(tree, (n) => n.rule == null || !n.place);
  return { eager, lazy, moved };
}

/* ── main ────────────────────────────────────────────────────────────── */

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const check = process.argv.includes('--check');
  const cssPath = join(DIST, 'app.min.css');
  const full = readFileSync(cssPath, 'utf8');
  if (/\/\* split-lazy-css \*\//.test(full)) {
    console.error('[split-lazy-css] dist/app.min.css is already split (run build:css first).');
    process.exit(1);
  }
  const cssClasses = new Set((full.match(/\.[A-Za-z_][\w-]*/g) || []).map((c) => c.slice(1)));
  const { lazyOf, together } = await classifier(cssClasses);
  const { eager, lazy, moved } = splitCss(full, lazyOf, together);
  const kept = eager.length + Object.values(lazy).reduce((a, s) => a + s.length, 0);
  // Every byte of every rule lands in exactly one sheet (the @media wrappers repeat, so the sum can only grow).
  if (kept < full.length) { console.error('[split-lazy-css] lost bytes: ' + full.length + ' in, ' + kept + ' out'); process.exit(1); }
  const line = Object.keys(lazy).map((x) => lazyCssName(x) + ' ' + lazy[x].length + ' B (' + moved[x] + ' rules)').join(', ');
  console.log('[split-lazy-css] app.min.css ' + full.length + ' -> ' + eager.length + ' B render-blocking; ' + line);
  if (!check) {
    writeFileSync(cssPath, eager + '/* split-lazy-css */');
    for (const x of Object.keys(lazy)) writeFileSync(join(DIST, lazyCssName(x)), lazy[x]);
  }
}
