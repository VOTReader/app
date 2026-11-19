import { describe, it, expect, vi, beforeAll } from 'vitest';
import { READING_FONTS } from '../app/src/main/assets/src/utils/reading-fonts.js';

let gen;

beforeAll(async () => {
  // The generator fetches from the CDN only inside main(); importing it must
  // never touch the network. Stub fetch first so a regression is caught.
  vi.stubGlobal('fetch', vi.fn());
  gen = await import('./gen-reading-fonts.mjs');
});

describe('builders', () => {
  it('vf() returns the normal + italic variable faces', () => {
    expect(gen.vf('lora')).toEqual([
      { remote: 'lora:vf@latest/latin-wght-normal.woff2', file: 'lora-latin-wght-normal.woff2', weight: '100 900', style: 'normal' },
      { remote: 'lora:vf@latest/latin-wght-italic.woff2', file: 'lora-latin-wght-italic.woff2', weight: '100 900', style: 'italic' },
    ]);
  });

  it('vfNoItalic() returns only the normal face', () => {
    expect(gen.vfNoItalic('lexend')).toEqual([gen.vf('lexend')[0]]);
    expect(gen.vfNoItalic('lexend')[0].style).toBe('normal');
  });

  it('st() maps [weight, style] pairs to static faces', () => {
    expect(gen.st('cardo', [[400, 'normal'], [700, 'italic']])).toEqual([
      { remote: 'cardo@latest/latin-400-normal.woff2', file: 'cardo-latin-400-normal.woff2', weight: '400', style: 'normal' },
      { remote: 'cardo@latest/latin-700-italic.woff2', file: 'cardo-latin-700-italic.woff2', weight: '700', style: 'italic' },
    ]);
  });

  it('remote URLs stay under the fontsource CDN with matching file names', () => {
    expect(gen.CDN).toBe('https://cdn.jsdelivr.net/fontsource/fonts/');
    for (const f of gen.FONTS) {
      for (const face of f.faces) {
        expect(face.remote.startsWith(f.id)).toBe(true);
        expect(face.file.startsWith(f.id + '-latin-')).toBe(true);
        expect(face.file.endsWith('.woff2')).toBe(true);
      }
    }
  });

  it('reportRow() shapes the per-font report entry', () => {
    expect(gen.reportRow({ id: 'lora', faces: [{}, {}] }, 1536)).toEqual({ id: 'lora', kb: 2, files: 2 });
    expect(gen.reportRow({ id: 'lexend', faces: [{}] }, 0)).toEqual({ id: 'lexend', kb: 0, files: 1 });
  });
});

describe('FONTS registry', () => {
  it('has 23 fonts and 58 faces', () => {
    expect(gen.FONTS).toHaveLength(23);
    expect(gen.FONTS.reduce((s, f) => s + f.faces.length, 0)).toBe(58);
  });

  it('ids are unique kebab-case with non-empty families', () => {
    const ids = gen.FONTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of gen.FONTS) {
      expect(f.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(f.family.length).toBeGreaterThan(0);
    }
  });

  it('lexend is the only single-face font', () => {
    const singles = gen.FONTS.filter((f) => f.faces.length === 1);
    expect(singles.map((f) => f.id)).toEqual(['lexend']);
    expect(singles[0].faces[0].style).toBe('normal');
  });

  it('variable fonts carry wght 100 900 normal + italic', () => {
    const vfs = gen.FONTS.filter((f) => f.faces.length === 2 && f.faces[0].weight === '100 900');
    expect(vfs.length).toBeGreaterThan(0);
    for (const f of vfs) expect(f.faces.map((x) => x.style)).toEqual(['normal', 'italic']);
  });

  it('matches the READING_FONTS vendored set', () => {
    const vendored = READING_FONTS.filter((f) => f.faces.length > 0);
    expect(vendored).toHaveLength(23);
    expect(new Set(vendored.map((f) => f.id))).toEqual(new Set(gen.FONTS.map((f) => f.id)));
  });
});

describe('import has no side effects', () => {
  it('does not fetch on import', () => {
    expect(fetch).not.toHaveBeenCalled();
  });
});
