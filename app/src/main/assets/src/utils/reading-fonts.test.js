// @ts-nocheck — fs-based sync gates read repo files relative to this test.
/* reading-fonts tests — the registry contract + the three-way sync gate.
   ─────────────────────────────────────────────────────────────────────────
   Registry: every id the Settings picker can persist into settings.fontStyle
   must stay well-formed forever (ids are stored in backups — a rename would
   orphan users' choices), classic/modern keep their historical spots, and
   the LIST ORDER is the picker order (owner call: scripture-and-classic
   faces first, sans last).

   Sync gate: all fonts are vendored (2026-07-31 owner call — no CDN, no
   download step), which puts three artifacts at risk of drifting apart:
   the registry's `faces`, the files on disk in fonts/reading/, the
   @font-face block in app.css, and the SW's stable-cache precache list.
   Each is asserted against the registry here — a font added or renamed in
   one place fails until all four agree. */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { READING_FONTS, readingFontById, readingFontCss } from './reading-fonts.js';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const READING_DIR = join(ASSETS, 'fonts', 'reading');
const APP_CSS = readFileSync(join(ASSETS, 'app.css'), 'utf8');
const SW = readFileSync(join(ASSETS, 'service-worker.js'), 'utf8');

describe('READING_FONTS registry', () => {
  it('ids are unique and kebab-case', () => {
    const ids = READING_FONTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('keeps the two historical built-ins first, with no faces', () => {
    expect(READING_FONTS[0].id).toBe('classic');
    expect(READING_FONTS[1].id).toBe('modern');
    expect(READING_FONTS[0].faces).toEqual([]);
    expect(READING_FONTS[1].faces).toEqual([]);
  });

  it('orders scripture-and-classic faces to the top and the sans to the bottom', () => {
    const ids = READING_FONTS.map((f) => f.id);
    // The scripture block leads right after the built-ins…
    expect(ids.slice(2, 6)).toEqual(['cormorant-garamond', 'cardo', 'gentium-book-plus', 'rosarivo']);
    // …and the two readability sans close the list.
    expect(ids.slice(-2)).toEqual(['atkinson-hyperlegible', 'lexend']);
  });

  it('offers a real menu of vendored fonts', () => {
    const vendored = READING_FONTS.filter((f) => f.faces.length);
    expect(vendored.length).toBeGreaterThanOrEqual(20);
    for (const f of vendored) {
      expect(f.family).toBeTruthy();
      expect(f.css).toContain(`'${f.family}'`);
      expect(f.css).toMatch(/, (serif|sans-serif)$/);
      expect(f.sub.length).toBeGreaterThan(0);
      // Exactly one regular face minimum; every face is this font's file.
      expect(f.faces.some((file) => file.includes('-normal'))).toBe(true);
      for (const file of f.faces) {
        expect(file.startsWith(f.id + '-latin-')).toBe(true);
        expect(file).toMatch(/\.woff2$/);
      }
    }
  });

  it('readingFontById finds every id and misses unknowns', () => {
    for (const f of READING_FONTS) expect(readingFontById(f.id)).toBe(f);
    expect(readingFontById('papyrus')).toBeUndefined();
    expect(readingFontById(null)).toBeUndefined();
  });

  it('readingFontCss falls back to the EB Garamond stack for classic AND unknowns', () => {
    expect(readingFontCss('classic')).toBe("'EB Garamond', serif");
    expect(readingFontCss('some-future-font')).toBe("'EB Garamond', serif");
    expect(readingFontCss(undefined)).toBe("'EB Garamond', serif");
    expect(readingFontCss('lora')).toBe("'Lora', serif");
    expect(readingFontCss('cormorant-garamond')).toBe("'Cormorant Garamond', serif");
  });
});

describe('registry ↔ disk ↔ app.css ↔ service-worker sync', () => {
  const allFaces = READING_FONTS.flatMap((f) => f.faces);

  it('every registry face exists on disk, and no stray files exist', () => {
    const onDisk = readdirSync(READING_DIR).filter((f) => f.endsWith('.woff2'));
    expect(new Set(onDisk)).toEqual(new Set(allFaces));
  });

  it('every face has an app.css @font-face under its font family', () => {
    for (const f of READING_FONTS) {
      if (!f.faces.length) continue;
      for (const file of f.faces) {
        const line = APP_CSS.split('\n').find((l) => l.includes(`fonts/reading/${file}`));
        expect(line, `app.css @font-face missing for ${file}`).toBeTruthy();
        expect(line).toContain(`font-family: '${f.family}'`);
        expect(line).toContain('font-display: swap');
        // Variable files carry the full axis; static files their exact weight.
        if (file.includes('-wght-')) expect(line).toContain('font-weight: 100 900');
        expect(line).toContain(file.includes('-italic') ? 'font-style: italic' : 'font-style: normal');
      }
    }
  });

  it('the license file rides along with the vendored fonts', () => {
    expect(readdirSync(READING_DIR)).toContain('OFL-reading-fonts.txt');
  });

  it('the service worker precaches every face into the stable cache', () => {
    for (const file of allFaces) {
      expect(SW, `SW precache missing ${file}`).toContain(`'./fonts/reading/${file}'`);
    }
    // …and routes the directory corpusFirst so fonts survive version bumps.
    expect(SW).toContain("url.pathname.includes('/fonts/reading/')");
  });
});
