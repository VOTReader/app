#!/usr/bin/env node
/* check-bundle-state — a module that holds state lives in one bundle.
 * ═══════════════════════════════════════════════════════════════════════
 * WHY THIS GATE EXISTS
 * Bundles b, c and d are separate esbuild entries (package.json build:b/c/d),
 * so a source module two of them import is bundled twice, and each copy has
 * its own module-scope variables. For a module with state that is two states.
 * The audit of 2026-11-23 (item 15) found 39 shared modules, nine with state,
 * and three splits a reader saw: a plan move's history flag set in d's copy
 * and read in b's (arch-1), Search's carried words set in d and read in b
 * (bundles-n1), and toasts from b and d covering each other (bundles-n2).
 *
 * The rule: a module in two or more of b/c/d holds no module-scope state.
 * Shared state goes through utils/shared-state.js (one object on
 * window.__votShared for every copy), or the consumer in the other bundle
 * calls bundle-b's window global instead of importing the module.
 *
 * WHAT COUNTS AS STATE (comments stripped first; module scope = column 0,
 * and the body of a top-level IIFE, `(function () { ... })()` or
 * `(() => { ... })()`, at its own first indent):
 *   - a `let` or `var` declaration;
 *   - a `const` bound to a Map, Set, WeakMap, WeakSet, array or object
 *     literal that the module mutates (.set/.add/.delete/.clear/.push/...,
 *     or an element or property assignment).
 * A frozen table built once from constant data is not state; a memo cache
 * each copy fills with the same values is harmless, and goes in ALLOWED with
 * its reason. An ALLOWED entry that no longer applies fails the gate too, so
 * the list cannot go stale.
 *
 * The bundles are built in memory from the exact package.json commands
 * (--metafile), so the gate sees what ships, chrome108 target included.
 *
 * Run: node tools/check-bundle-state.js   (exit 1 on a stateful shared module;
 *      --json prints the verdict and the b/c/d membership instead)
 * Test: tools/check-bundle-state.test.js
 */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'app/src/main/assets/src/';
export const BUNDLES = ['b', 'c', 'd'];

/* Shared modules allowed to keep module-scope state, each with why the copies
   cannot disagree in a way a reader sees. Paths are relative to SRC. */
export const ALLOWED = {
  'data/plan-engine.js': 'a WeakMap memo of a pure computation: each copy fills it with the same values',
  'utils/word-count.js': 'a WeakMap memo of a pure count: each copy fills it with the same values',
  'utils/answers-shelves.js': 'a memo of the topic list by identity, and a subject table built once from constant data',
  'utils/answers-site.js': 'a memo of the site built from the entry list by identity: each copy builds the same site',
  'stores/idb-chunks.js': 'the generation counter only salts ids that also carry Date.now and Math.random, and the told-inexact set only dedupes a warning (a second copy can warn once more); d\'s copy serves thumb-store',
  'utils/diagnostic-log.js': 'd\'s copy (via idb-chunks for thumb-store) has never been seen to log (audit 2026-11-23); an entry it logged would miss the export. Move its buffer into sharedState if d starts logging',
};

/** Strip comments, keep strings and line breaks (so line numbers and column 0 survive). @param {string} src */
export function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '*') {
      const atLineStart = out === '' || out.endsWith('\n');
      const end = src.indexOf('*/', i + 2);
      const body = src.slice(i, end < 0 ? n : end + 2);
      out += body.replace(/[^\n]/g, '');
      i += body.length;
      // A declaration after a comment that opens its line (`/** @type {x} */ let y`) keeps column 0.
      if (atLineStart) while (src[i] === ' ' || src[i] === '\t') i++;
      continue;
    }
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const MUTATORS = 'set|add|delete|clear|push|pop|shift|unshift|splice|sort|reverse|fill';

/** The same code with every string's inside blanked (quotes and line breaks kept), so a brace in text is not a brace. @param {string} code comment-free */
function blankStrings(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '\'' || c === '"' || c === '`') {
      let j = i + 1;
      while (j < code.length && code[j] !== c) { if (code[j] === '\\') j++; j++; }
      out += c + code.slice(i + 1, j).replace(/[^\n]/g, ' ') + (j < code.length ? c : '');
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/* A column-0 line that opens an immediately invoked function: (function () {, (function name() {, (() => {,
   (async () => {, !function () {, ;(function () {. */
const IIFE_OPEN = /^;?\(\s*(?:async\s+)?(?:function\b[^(]*\([^)]*\)|\([^)]*\)\s*=>|[\w$]+\s*=>)\s*\{/;
const IIFE_OPEN_BANG = /^!\s*function\b[^(]*\([^)]*\)\s*\{/;

/** The lines that run at module scope: column-0 lines, and each top-level IIFE's body lines at that body's first
 *  indent, unindented (a declaration there lives as long as the module does). @param {string} code comment-free */
function scopeLines(code) {
  const lines = code.split('\n');
  const flat = blankStrings(code).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = flat[i];
    if (!line || /^\s/.test(line)) continue;
    out.push(lines[i]);
    if (!IIFE_OPEN.test(line) && !IIFE_OPEN_BANG.test(line)) continue;
    // Walk the braces (strings blanked) from the opening { to its match; the body is the lines in between.
    let depth = 0;
    let end = i;
    for (let k = i, opened = false; k < flat.length; k++) {
      for (const ch of flat[k]) {
        if (ch === '{') { depth++; opened = true; } else if (ch === '}') depth--;
      }
      if (opened && depth <= 0) { end = k; break; }
      end = k;
    }
    const body = lines.slice(i + 1, end);
    const first = body.find((l, k) => flat[i + 1 + k].trim() !== '');
    const indent = first ? first.match(/^\s*/)[0] : '';
    if (!indent) continue;   // an unindented body is column 0: the plain scan reads it
    for (let k = 0; k < body.length; k++) {
      const f = flat[i + 1 + k];
      if (f.startsWith(indent) && !/^\s/.test(f.slice(indent.length))) out.push(body[k].slice(indent.length));
    }
    i = end;
  }
  return out;
}

/** The module-scope state a source holds, as short descriptions ([] = stateless). @param {string} src */
export function moduleState(src) {
  const code = stripComments(src);
  const found = [];
  for (const line of scopeLines(code)) {
    const lv = line.match(/^(?:export\s+)?(let|var)\s+([\w$]+)/);
    if (lv) { found.push(lv[1] + ' ' + lv[2]); continue; }
    const c = line.match(/^(?:export\s+)?const\s+([\w$]+)\s*=\s*(new\s+(?:Map|Set|WeakMap|WeakSet|Array)\b|\[|\{)/);
    if (!c) continue;
    const name = c[1].replace(/\$/g, '\\$');
    const mutated = new RegExp('\\b' + name + '\\s*(?:\\.(?:' + MUTATORS + ')\\s*\\(|\\[[^\\]]*\\]\\s*=(?!=)|\\.[\\w$]+\\s*=(?!=))');
    if (mutated.test(code)) found.push('mutated const ' + c[1]);
  }
  return found;
}

/** esbuild options from a package.json `esbuild <entry> --flag ...` script, for an in-memory metafile build. @param {string} script */
export function optionsFromScript(script) {
  const words = script.trim().split(/\s+/);
  if (words[0] !== 'esbuild') throw new Error('not an esbuild command: ' + script);
  const o = { entryPoints: [], bundle: false, write: false, metafile: true, logLevel: 'silent', absWorkingDir: ROOT };
  for (const w of words.slice(1)) {
    if (!w.startsWith('--')) { o.entryPoints.push(w); continue; }
    const [flag, ...rest] = w.slice(2).split(/[=:]/);
    const v = rest.join(':');
    if (flag === 'bundle') o.bundle = true;
    else if (flag === 'minify') o.minify = true;
    else if (flag === 'format') o.format = v;
    else if (flag === 'target') o.target = v;
    else if (flag === 'jsx-factory') o.jsxFactory = v;
    else if (flag === 'jsx-fragment') o.jsxFragment = v;
    else if (flag === 'inject') (o.inject = o.inject || []).push(v);
    else if (flag === 'outfile') { /* in memory */ }
    else throw new Error('check-bundle-state does not know esbuild flag --' + flag + ' (teach optionsFromScript)');
  }
  return o;
}

/** Which of b/c/d each src module lands in, from the package.json build commands. @returns {Promise<Map<string, string[]>>} */
export async function bundleMembership() {
  const { build } = await import('esbuild');
  const scripts = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')).scripts;
  const where = new Map();
  for (const b of BUNDLES) {
    const r = await build(optionsFromScript(scripts['build:' + b]));
    for (const p of Object.keys(r.metafile.inputs)) {
      const rel = p.replace(/\\/g, '/');
      if (!rel.startsWith(SRC)) continue;
      const k = rel.slice(SRC.length);
      if (!where.has(k)) where.set(k, []);
      where.get(k).push(b);
    }
  }
  return where;
}

/** The gate's verdict. @returns {Promise<{ shared: number, offenders: {file: string, bundles: string[], state: string[]}[], stale: string[], where: Record<string, string[]> }>} */
export async function checkBundleState() {
  const where = await bundleMembership();
  const offenders = [];
  const stillNeeded = new Set();
  let shared = 0;
  for (const [file, bundles] of where) {
    if (bundles.length < 2) continue;
    shared++;
    const state = moduleState(readFileSync(join(ROOT, SRC, file), 'utf-8'));
    if (!state.length) continue;
    if (ALLOWED[file]) { stillNeeded.add(file); continue; }
    offenders.push({ file, bundles, state });
  }
  const stale = Object.keys(ALLOWED).filter((f) => !stillNeeded.has(f));
  return { shared, offenders, stale, where: Object.fromEntries(where) };
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  const verdict = await checkBundleState();
  // --json: the verdict for tools/check-bundle-state.test.js (vitest's jsdom setup breaks esbuild in-process).
  if (process.argv.includes('--json')) { console.log(JSON.stringify(verdict)); process.exit(0); }
  const { shared, offenders, stale } = verdict;
  for (const o of offenders) {
    console.error('[bundle-state] ' + o.file + ' is bundled into ' + o.bundles.join('+') + ' and holds module state (' + o.state.join(', ') + '): keep it in sharedState (utils/shared-state.js), or have the other bundle call bundle-b\'s window global instead of importing it');
  }
  for (const f of stale) console.error('[bundle-state] ALLOWED entry ' + f + ' no longer applies (not shared, or no state): delete it from tools/check-bundle-state.js');
  if (offenders.length || stale.length) process.exit(1);
  console.log('[bundle-state] OK: ' + shared + ' modules shared across b/c/d; none holds state outside sharedState except ' + Object.keys(ALLOWED).length + ' allowed.');
}
