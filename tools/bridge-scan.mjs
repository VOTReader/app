/* bridge-scan — shared reading for check-bridges.mjs and kt-events-check.mjs (heart-7 + arch-10, audit 2026-11-23).
   Both gates derive what they check from the source: the window.__* assignments in the page's JS, the
   JsEvent names and window.* calls in the Kotlin host, and the names BRIDGES.md lists. Nothing here is a
   hand-kept list. */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Blank out comments, keeping every newline so line numbers stay true. A `//` after a colon (a URL) is kept. */
export function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\'"`])\/\/[^\n]*/g, '$1');
}

/** The page's own JS: assets/src (no tests, fixtures or corpus data) plus the root pages and the worker. */
export function pageSources(root = REPO_ROOT) {
  const assets = join(root, 'app', 'src', 'main', 'assets');
  const out = [];
  const walk = (dir, rel) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const r = rel + '/' + e.name;
      if (e.isDirectory()) { if (r !== 'src/data') walk(join(dir, e.name), r); continue; }
      if (!/\.(js|jsx|mjs)$/.test(e.name) || /\.test\.|\.fixture\./.test(e.name)) continue;
      out.push({ rel: r, text: readFileSync(join(dir, e.name), 'utf8') });
    }
  };
  walk(join(assets, 'src'), 'src');
  for (const f of ['index.html', 'offline.html', 'service-worker.js']) {
    const p = join(assets, f);
    if (existsSync(p)) out.push({ rel: f, text: readFileSync(p, 'utf8') });
  }
  return out;
}

/* A bridge assignment: window.__x = …, globalThis.__x =, (window).__x = (a JSDoc cast), and the module aliases the
   code uses for window (w, win, g, _g()). Not ==, not =>. */
const SETTER_RE = /(?<![\w$.])(window|globalThis|self|w|win|g|_g\(\))\s*\)?\s*\.(__[A-Za-z][\w$]*)\s*=(?![=>])/g;

/** @returns {Map<string, string[]>} bridge name -> ['file:line', …] where the page assigns it */
export function jsBridgeSetters(root = REPO_ROOT) {
  const found = new Map();
  for (const { rel, text } of pageSources(root)) {
    const lines = stripComments(text).split('\n');
    lines.forEach((l, i) => {
      for (const m of l.matchAll(SETTER_RE)) {
        if (!found.has(m[2])) found.set(m[2], []);
        found.get(m[2]).push(rel + ':' + (i + 1));
      }
    });
  }
  return found;
}

/** Every Kotlin source of the host app, comments blanked. */
export function kotlinSources(root = REPO_ROOT) {
  const dir = join(root, 'app', 'src', 'main', 'java');
  const out = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.name.endsWith('.kt')) out.push({ rel: e.name, text: stripComments(readFileSync(join(d, e.name), 'utf8')) });
    }
  };
  walk(dir);
  return out;
}

/**
 * The page functions the Kotlin host calls: every JsEvent entry (JsBridge.callOptional) and every window.<name>
 * a Kotlin string evaluates (callWithResult: the back press, the shared-link opener).
 * @returns {Map<string, string>} name -> where Kotlin names it
 */
export function kotlinEntryPoints(root = REPO_ROOT) {
  const found = new Map();
  for (const { rel, text } of kotlinSources(root)) {
    for (const m of text.matchAll(/data object (\w+)\s*:\s*JsEvent\("([\w$]+)"\)/g)) found.set(m[2], rel + ' JsEvent.' + m[1]);
    for (const m of text.matchAll(/window\.(__[A-Za-z][\w$]*|handle[A-Z][\w$]*)/g)) if (!found.has(m[1])) found.set(m[1], rel);
  }
  return found;
}

/** BRIDGES.md: every backticked name it mentions, its `### \`__x\`` headings, and the paths on its Setter lines. */
export function readRegistry(root = REPO_ROOT) {
  const p = join(root, 'BRIDGES.md');
  if (!existsSync(p)) return null;
  const md = readFileSync(p, 'utf8');
  const lines = md.split('\n');
  const mentioned = new Set([...md.matchAll(/`((?:__|handle)[A-Za-z][\w$]*)/g)].map((m) => m[1]));
  const headings = [];
  const setterPaths = [];
  let inStackers = false;
  lines.forEach((l, i) => {
    const h = /^###\s+`(__[A-Za-z][\w$]*|handle[A-Z][\w$]*)`/.exec(l);
    if (h) headings.push({ name: h[1], line: i + 1 });
    const isSetter = /\*\*(Setters?|Stackers[^*]*):?\*\*/.test(l);
    if (isSetter) inStackers = /Stackers/.test(l);
    else if (!/^\s{2,}-\s/.test(l)) inStackers = false;
    if (isSetter || inStackers) {
      for (const m of l.matchAll(/(?<![\w/.-])((?:src\/)?(?:ui|hooks|renderer|utils|stores|components|search|data)\/[\w./-]+\.(?:jsx?|mjs))/g)) {
        setterPaths.push({ path: m[1], line: i + 1 });
      }
    }
  });
  return { mentioned, headings, setterPaths };
}

/** Does a Setter line's path name a file? Paths are written from assets/ or from assets/src/. */
export function pathExists(root, path) {
  const assets = join(root, 'app', 'src', 'main', 'assets');
  return existsSync(join(assets, path)) || existsSync(join(assets, 'src', path));
}

/** Tools that set a page global from outside (the walks, perf tools), e.g. window.__votPeeks before load. */
export function toolMentions(root, name) {
  const dir = join(root, 'tools');
  if (!existsSync(dir)) return false;
  for (const e of readdirSync(dir)) {
    if (!/\.(m?js|py)$/.test(e) || /\.test\./.test(e) || /^(check-bridges|kt-events-check|bridge-scan)\./.test(e)) continue;
    if (readFileSync(join(dir, e), 'utf8').includes(name)) return true;
  }
  return false;
}
