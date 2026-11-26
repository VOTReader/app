#!/usr/bin/env node
/* check-type-scale — the type scale stays THE single source of truth.
 *
 * 2026-08-04: 590 font-size declarations across 15 files used 103 distinct
 * hand-picked values (ten of them between 8.8px and 10.9px). They were snapped
 * onto one 13-step ladder defined once in app.css :root — --fs-N (rem, scales
 * with Settings -> Text Size) and its frozen chrome twin --fsc-N (px).
 *
 * This gate keeps it that way: every font-size in the app must name a token.
 * A literal rem/px font-size anywhere but the token block itself fails the
 * build. Two exceptions, both deliberate and documented at their sites:
 *   - `em` font-sizes  — relative to their PARENT by design (verse sups, the
 *     external-link marker, inline refs: they follow whatever they sit in).
 *   - the three `calc(...%  * var(--font-scale))` root rules — that IS the
 *     one setting; it cannot be expressed as one of its own steps.
 * clamp() is allowed only when both ends are tokens.
 *
 * Usage: node tools/check-type-scale.js   (exit 1 on violation)
 * checkTypeScale(root) returns the same report in-process (the test uses it).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = path.join(path.dirname(SELF), '..');
const SKIP_DIRS = new Set(['dist', 'node_modules', 'data', 'fonts', 'icons']);

/** Files to scan: the static CSS + every source module that can carry style text. */
function collect(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) collect(p, out); }
    else if (/\.(css|js|jsx)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

// A literal font-size: `font-size: 0.72rem`, `fontSize: "18px"`, etc.
// `em` is excluded here (allowed by design); calc()/var()/clamp() don't match.
const LITERAL = /font-?[sS]ize\s*:\s*["']?\s*[0-9.]+(rem|px)\b/g;
// The token declarations themselves: `--fs-12: 0.75rem;` / `--fsc-12: 12px;`
const TOKEN_DECL = /^\s*--fsc?-\d+\s*:/;
// Blank out block comments (newlines kept, so line numbers hold) before the
// literal scan — a doc comment quoting `font-size: 14px` is prose, not a
// violation. check-css-tokens.js does the same.
function stripBlockComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

// Any reference to a scale token: `var(--fs-19)` / `var(--fsc-12)`.
const TOKEN_REF = /var\(\s*(--fsc?-\d+)\s*[),]/g;

// The declared ladder — collected first so references can be validated
// against it. An undefined custom property doesn't error in CSS: the whole
// declaration silently becomes 'unset', which is exactly how six phantom
// tokens (--fs-9/17/19/22/27/34) shipped inert on 2026-08-09.
const DECL_ANYWHERE = /(--fsc?-\d+)\s*:/g;   // --fs-N and --fsc-N share a line in the ladder

/**
 * Scan `<root>/app/src/main/assets` and return what the CLI prints and its
 * exit status. Exported so the test runs it in-process: a child process per
 * case can wait 45-77 s in the hook's fast run, because on Windows a
 * concurrent spawn in another vmThreads worker inherits the gate's stdout
 * pipe and spawnSync waits for that pipe to close (check-css-tokens, 11-26).
 * @param {string} [root] repo root (default: the one this file sits in)
 * @returns {{ status: 0|1, stdout: string, stderr: string }}
 */
export function checkTypeScale(root = REPO_ROOT) {
  const files = collect(path.join(root, 'app', 'src', 'main', 'assets'), []);
  const texts = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));

  const declared = new Set();
  for (const text of texts.values()) {
    for (const d of text.matchAll(DECL_ANYWHERE)) declared.add(d[1]);
  }

  const violations = [];
  const phantoms = [];
  for (const file of files) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const lines = stripBlockComments(texts.get(file)).split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const r of line.matchAll(TOKEN_REF)) {
        if (!declared.has(r[1])) phantoms.push(`${rel}:${i + 1}  var(${r[1]}) is not declared`);
      }
      if (TOKEN_DECL.test(line)) return;          // the ladder's own definition
      for (const m of line.matchAll(LITERAL)) violations.push(`${rel}:${i + 1}  ${m[0].trim()}`);
    });
  }

  if (violations.length || phantoms.length) {
    const err = [];
    if (violations.length) {
      err.push('[type-scale] literal font-size values found — use a --fs-N / --fsc-N token');
      err.push('             (the ladder is defined once in app.css :root):');
      for (const v of violations) err.push('  ' + v);
    }
    if (phantoms.length) {
      err.push('[type-scale] references to UNDECLARED scale tokens — the declaration is');
      err.push('             silently unset at runtime; use a declared ladder step:');
      for (const p of phantoms) err.push('  ' + p);
    }
    return { status: 1, stdout: '', stderr: err.join('\n') + '\n' };
  }
  return {
    status: 0,
    stdout: `[type-scale] OK — every font-size names a scale token, every token reference resolves (${declared.size} declared).\n`,
    stderr: '',
  };
}

/** Run as `node tools/check-type-scale.js` (pre-commit, CI, npm script). */
function isMain() {
  if (!process.argv[1]) return false;
  const a = path.resolve(process.argv[1]);
  return process.platform === 'win32' ? a.toLowerCase() === SELF.toLowerCase() : a === SELF;
}

if (isMain()) {
  const r = checkTypeScale();
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  process.exitCode = r.status;
}
