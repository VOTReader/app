// @ts-nocheck — reads files via node fs/path/url (outside the DOM types the Q4 scope carries)
/* P1-5 static guard — every showToast className must have a matching CSS rule.
   ────────────────────────────────────────────────────────────────────────────
   The showToast utility (src/utils/toast.js) owns ONLY the toast lifecycle;
   the visual rule is the caller's className + a stylesheet. A missing rule
   fails SILENTLY — the toast element exists in the DOM with no styling
   (the .jrn-milestone-toast regression: the milestone fired but nothing
   visible rendered). This test scans every showToast({...}) call site in
   src/, collects each `className:` token, and asserts each class appears as
   a selector in the shipped stylesheets (app.css + src/styles/*.js, which
   define rules via R('...') strings).

   CSS comments are stripped before matching so a class merely MENTIONED in
   a comment (e.g. "mirrors the existing .jrn-milestone-toast aesthetic")
   doesn't count as a rule. */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Same path pattern as app-css.test.js (bare 'fs'/'path'/'url' specifiers +
// fileURLToPath) — the node:-prefixed specifiers and import.meta.dirname
// defeat the repo's tsc --noEmit gate (no node:-prefixed @types).
const UTILS_DIR = dirname(fileURLToPath(import.meta.url)); // src/utils/
const SRC_ROOT = join(UTILS_DIR, '..');                   // src/
const ASSETS_ROOT = join(UTILS_DIR, '..', '..');          // app/src/main/assets/

/** Recursively collect source files under dir (js/jsx, tests excluded —
 *  test files call showToast with fixture-only classes like 'vot-toast-test'
 *  that intentionally have no shipped rule). */
function collectSources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { out.push(...collectSources(p)); continue; }
    if (!/\.(js|jsx)$/.test(name)) continue;
    if (/\.test\.(js|jsx)$/.test(name)) continue;
    out.push(p);
  }
  return out;
}

/** Strip block comments so comment mentions never satisfy the assertion. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** All showToast({...}) className tokens used in src/. */
function toastClassNames() {
  const classes = new Set();
  const callRe = /showToast\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
  const classRe = /className\s*:\s*'([^']+)'/g;
  for (const file of collectSources(SRC_ROOT)) {
    const text = readFileSync(file, 'utf8');
    let m;
    while ((m = callRe.exec(text)) !== null) {
      let c;
      while ((c = classRe.exec(m[1])) !== null) {
        c[1].split(/\s+/).filter(Boolean).forEach((cls) => classes.add(cls));
      }
    }
  }
  return Array.from(classes).sort();
}

/** The shipped stylesheets: app.css plus the R('...') rule modules. */
function stylesheetText() {
  const parts = [readFileSync(join(ASSETS_ROOT, 'app.css'), 'utf8')];
  const stylesDir = join(SRC_ROOT, 'styles');
  for (const name of readdirSync(stylesDir)) {
    if (/\.(js|jsx)$/.test(name) && !/\.test\.(js|jsx)$/.test(name)) {
      parts.push(readFileSync(join(stylesDir, name), 'utf8'));
    }
  }
  return stripComments(parts.join('\n'));
}

describe('showToast className ↔ CSS rule coverage (P1-5)', () => {
  it('every showToast className has a matching CSS selector in the shipped stylesheets', () => {
    const classes = toastClassNames();
    expect(classes.length).toBeGreaterThan(0); // the scan itself is non-vacuous
    const css = stylesheetText();
    const missing = classes.filter((cls) => {
      const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Selector-position match: '.cls' NOT followed by a word char or '-'
      // (so '.vot-toast-undo' doesn't satisfy 'vot-toast', and vice versa).
      return !new RegExp('\\.' + esc + '(?![\\w-])').test(css);
    });
    expect(missing).toEqual([]);
  });
});
