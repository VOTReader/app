#!/usr/bin/env node
/* check-css-tokens — a custom property that was never declared is not a
 * fallback, it is a DELETED declaration.
 * ═══════════════════════════════════════════════════════════════════════
 * WHY THIS GATE EXISTS
 * `border: 1px solid var(--border)` reads like it degrades gracefully. It
 * does not. If `--border` is undeclared, the var() resolves to the
 * guaranteed-invalid value, the whole declaration becomes invalid at
 * computed-value time, and every longhand falls to `unset` — for
 * `border-style` that is `none`. The border does not fall back to a
 * default colour; it stops existing.
 *
 * That shipped: `--border` was referenced 13 times across app.css, the
 * Journal stylesheet and the Highlights sheet, declared nowhere, and none
 * of those borders had ever painted. Two of them were worse than cosmetic —
 * .hlx-search and .jrn-search declare their focus ring as a border-COLOUR
 * change, and a border that does not exist cannot change colour, so those
 * search boxes had no focus indicator at all. Nothing failed. No test could
 * see it. It is the same phantom-token class check-type-scale.js already
 * catches for --fs-* only; this is that check, generalized.
 *
 * THE RULE: a `var(--name)` reference with NO fallback must resolve to a
 * declaration. Three things count as declaring it:
 *   1. `--name:` anywhere in the scanned tree (app.css :root, a body.light
 *      override, an injected JS stylesheet, an inline style attribute).
 *   2. `--name` in index.html (the boot script + the splash styles).
 *   3. `element.style.setProperty('--name', …)` — set at runtime, so a
 *      static declaration would be wrong. Discovered, not allowlisted:
 *      --font-scale, --keyboard-height, --card-ar, --inset-top,
 *      --inset-bottom all arrive this way today and none needed listing.
 *
 * `var(--name, fallback)` is NOT flagged, deliberately. A fallback IS the
 * author saying what happens when the token is absent, and it makes the
 * declaration valid, so nothing silently disappears. (--seek-pct and
 * --gold-strong ride that path today and are correct.)
 *
 * --fs-N / --fsc-N are skipped here: check-type-scale.js owns the type
 * ladder and flags a phantom step even WITH a fallback, which is stricter
 * than this gate and shouldn't be reported twice.
 *
 * Run: node tools/check-css-tokens.js   (exit 1 on an undeclared reference)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = path.join(path.dirname(SELF), '..');
// dist/ is generated from these very files; data/ is the corpus; fonts/icons
// are binaries. Scanning dist would let a stale build mask a source defect.
const SKIP_DIRS = new Set(['dist', 'node_modules', 'data', 'fonts', 'icons']);

/** Every file that can carry style text: the static sheet, the injected
 *  stylesheets in JS/JSX, and index.html's boot styles. */
function collect(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) { if (!SKIP_DIRS.has(name)) collect(p, out); }
    else if (/\.(css|js|jsx|html)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

const DECL = /(--[A-Za-z][\w-]*)\s*:/g;                     // `--name:` — a declaration
const SET_PROPERTY = /setProperty\(\s*['"`](--[A-Za-z][\w-]*)/g;  // set at runtime
const REF_NO_FALLBACK = /var\(\s*(--[A-Za-z][\w-]*)\s*\)/g;       // `var(--name)` only
const TYPE_SCALE = /^--fsc?-\d+$/;                          // owned by check-type-scale.js

/**
 * Blank out `/* … *\/` blocks, preserving line and column positions so
 * reported line numbers stay true. A comment is not a declaration site and
 * not a reference site — and this file's own doc comment names `var(--border)`
 * and `var(--name)`, which is exactly how a gate ends up reporting prose.
 * @param {string} text
 * @returns {string}
 */
function stripBlockComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Scan `<root>/app/src/main/assets` and return what the CLI prints and its
 * exit status. Exported so the test runs it in-process: a child process per
 * case was 85 ms alone but 45-77 s whenever another vmThreads worker had a
 * child running (on Windows a concurrent spawn inherits the gate's stdout
 * pipe, and spawnSync waits for that pipe to close).
 * @param {string} [root] repo root (default: the one this file sits in)
 * @returns {{ status: 0|1, stdout: string, stderr: string }}
 */
export function checkCssTokens(root = REPO_ROOT) {
  const files = collect(path.join(root, 'app', 'src', 'main', 'assets'), []);
  /** file → comment-blanked source, read once. */
  const source = new Map(files.map((f) => [f, stripBlockComments(fs.readFileSync(f, 'utf8'))]));

  const declared = new Set();
  for (const text of source.values()) {
    for (const m of text.matchAll(DECL)) declared.add(m[1]);
    for (const m of text.matchAll(SET_PROPERTY)) declared.add(m[1]);
  }

  /** name → ["relative/path.css:120", …] */
  const phantoms = new Map();
  for (const file of files) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const lines = source.get(file).split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const m of line.matchAll(REF_NO_FALLBACK)) {
        const name = m[1];
        if (declared.has(name) || TYPE_SCALE.test(name)) continue;
        if (!phantoms.has(name)) phantoms.set(name, []);
        phantoms.get(name).push(`${rel}:${i + 1}`);
      }
    });
  }

  if (phantoms.size) {
    const err = [
      '[css-tokens] references to UNDECLARED custom properties.',
      '             An undeclared var() with no fallback is invalid at',
      '             computed-value time: the WHOLE declaration is dropped',
      '             (a border becomes `none`, not a default colour).',
    ];
    for (const [name, sites] of phantoms) {
      err.push(`\n  var(${name})  — ${sites.length} reference${sites.length === 1 ? '' : 's'}, 0 declarations:`);
      for (const site of sites) err.push('      ' + site);
    }
    err.push('');
    err.push('  Fix by DECLARING it (app.css :root + its body.light twin, beside the');
    err.push('  token it belongs with) — or, if absence is genuinely fine, give every');
    err.push('  reference a fallback: var(--name, <value>).');
    return { status: 1, stdout: '', stderr: err.join('\n') + '\n' };
  }

  return {
    status: 0,
    stdout: `[css-tokens] OK — every var() with no fallback resolves (${declared.size} properties declared).\n`,
    stderr: '',
  };
}

/** Run as `node tools/check-css-tokens.js` (pre-commit, CI, npm script). */
function isMain() {
  if (!process.argv[1]) return false;
  const a = path.resolve(process.argv[1]);
  return process.platform === 'win32' ? a.toLowerCase() === SELF.toLowerCase() : a === SELF;
}

if (isMain()) {
  const r = checkCssTokens();
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  process.exitCode = r.status;
}
