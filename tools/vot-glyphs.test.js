/* The UI's symbols ride every declared face (zones L1, 2026-10-05; tools/gen-vot-glyphs.py).
   Chrome picks a family's face by weight and style BEFORE it looks at unicode-range, so the glyph face must
   copy every (family, weight, style) the app declares: a face added later (a new Reading Font, a Cinzel
   weight) without re-running the generator would leave its symbols to the device's fonts again. */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'src', 'main', 'assets');
const CSS = readFileSync(resolve(ASSETS, 'app.css'), 'utf8');
const HTML = readFileSync(resolve(ASSETS, 'index.html'), 'utf8');
const SW = readFileSync(resolve(ASSETS, 'service-worker.js'), 'utf8');
const FACE = /@font-face \{ font-family: '([^']+)'; font-weight: ([0-9 ]+); font-style: (normal|italic);/g;
const block = (CSS.match(/\/\* GLYPHS-BEGIN[\s\S]*?GLYPHS-END \*\//) || [''])[0];
const faces = (text) => [...text.matchAll(FACE)].map((m) => `${m[1]} ${m[2]} ${m[3]}`);

describe('vot-glyphs', () => {
  it('the block exists and every face in it serves the glyph file, limited by unicode-range', () => {
    expect(block, 'GLYPHS-BEGIN..END block in app.css').not.toBe('');
    const lines = block.split('\n').filter((l) => l.includes('@font-face'));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l).toContain("url('../fonts/vot-glyphs.woff2')");
      expect(l).toMatch(/unicode-range: U\+2/);
    }
  });

  it('every face the app declares has its glyph twin (re-run tools/gen-vot-glyphs.py when this fails)', () => {
    const declared = new Set([...faces(HTML), ...faces(CSS.replace(block, ''))]);
    const twins = new Set(faces(block));
    expect([...declared].filter((f) => !twins.has(f))).toEqual([]);
  });

  it('the file ships, with its licence, precached with the shell fonts', () => {
    expect(existsSync(resolve(ASSETS, 'fonts', 'vot-glyphs.woff2'))).toBe(true);
    expect(existsSync(resolve(ASSETS, 'fonts', 'LICENSE-DejaVu.txt'))).toBe(true);
    expect(SW).toContain("'./fonts/vot-glyphs.woff2'");
  });
});
