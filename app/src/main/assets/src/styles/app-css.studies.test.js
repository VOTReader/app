/* The studies pass (2026-11-12): the study screens' rules in the new look's terms. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(here, '..', '..', 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** every declaration block whose selector list holds `sel` exactly */
const blocks = (sel) => {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(CSS))) if (m[1].split(',').map((x) => x.trim().replace(/\s+/g, ' ')).includes(sel)) out.push(m[2]);
  return out;
};

describe('app.css — the study screens', () => {
  it('the white part-title plates turn light on dark in the dark theme only, with no edge', () => {
    const b = blocks('body:not(.light) .study-image-block img[src*="study-title-"]');
    expect(b).toHaveLength(1);
    expect(b[0]).toMatch(/filter:\s*invert\(1\)/);
    expect(b[0]).toMatch(/mix-blend-mode:\s*lighten/);
    expect(CSS).not.toMatch(/body\.light [^{]*study-title-[^{]*\{[^}]*filter/);
  });

  it('the study pictures take the card radius', () => {
    expect(blocks('.study-image-block img').join(';')).toMatch(/border-radius:\s*var\(--r-card\)/);
    expect(blocks('.study-cover-inline img').join(';')).toMatch(/border-radius:\s*var\(--r-card\)/);
  });

  it('a prophecy card is a surface with the card radius and at most a hairline; no Cinzel on its tag or sublabel', () => {
    const card = blocks('.prophecy-card').join(';');
    expect(card).toMatch(/var\(--surface-1\)/);
    expect(card).toMatch(/border-radius:\s*var\(--r-card\)/);
    expect(card).toMatch(/border:\s*1px solid var\(--hairline\)/);
    for (const sel of ['.prophecy-card-tag', '.prophecy-card-sublabel', '.prophecy-group-label', '.study-heading']) {
      const b = blocks(sel).join(';');
      expect(b, sel).toMatch(/font-family:\s*var\(--font-ui\)/);
      expect(b, sel).not.toMatch(/Cinzel/);
    }
  });

  it('a study title steps down past 40 and 70 characters', () => {
    expect(blocks('.vol-index-title.is-longish').join(';')).toMatch(/var\(--fs-24\)/);
    expect(blocks('.vol-index-title.is-long').join(';')).toMatch(/var\(--fs-20\)/);
  });

  it('the old boxed part cards are gone', () => {
    expect(CSS).not.toMatch(/\.part-group-card|\.part-chevron|\.part-chapters/);
  });
});
