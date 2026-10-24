// @ts-nocheck
/* app-css.control-chars.test.js — no stray control characters in the stylesheet or the app source.

   intro-glyph (2026-10-23): the About "Credits & privacy" fold showed a box glyph. Its marker had been
   written through a Python string, which read the CSS escape '\203A' (›) as the octal escape \203 and
   saved U+0083 followed by "A". Earlier the same night a heredoc turned '\00B7' into a NUL in app.css.
   No gate looks at bytes, so both shipped. Tabs, newlines and carriage returns are the only control
   characters the source needs. */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', '..');
const SRC = resolve(HERE, '..');
// C0 controls except \t \n \r, DEL, and the C1 block (by code, not a regex: eslint's no-control-regex).
const isBad = (c) => (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || (c >= 0x7f && c <= 0x9f);
const firstBad = (line) => { for (let i = 0; i < line.length; i++) if (isBad(line.charCodeAt(i))) return line.charCodeAt(i); return -1; };

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx|css)$/.test(name)) out.push(p);
  }
  return out;
}

function hits(file) {
  const found = [];
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    const c = firstBad(line);
    if (c >= 0) found.push(`${relative(ASSETS, file)}:${i + 1} U+${c.toString(16).padStart(4, '0').toUpperCase()}`);
  });
  return found;
}

describe('no stray control characters', () => {
  it('app.css has none (a CSS escape written through a Python string becomes one)', () => {
    expect(hits(resolve(ASSETS, 'app.css'))).toEqual([]);
  });

  it('the app source has none', () => {
    expect(walk(SRC, []).flatMap(hits)).toEqual([]);
  });
});
