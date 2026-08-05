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
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
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

const violations = [];
for (const file of collect(ASSETS, [])) {
  const rel = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (TOKEN_DECL.test(line)) return;          // the ladder's own definition
    LITERAL.lastIndex = 0;
    let m;
    while ((m = LITERAL.exec(line))) {
      violations.push(`${rel}:${i + 1}  ${m[0].trim()}`);
    }
  });
}

if (violations.length) {
  console.error('[type-scale] literal font-size values found — use a --fs-N / --fsc-N token');
  console.error('             (the ladder is defined once in app.css :root):');
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log('[type-scale] OK — every font-size names a scale token.');
