// @ts-nocheck — node:fs source scan; the Q4 typecheck scope has no node types
/* The go-to's rows read "John 3:16 — For God so loved…" and "John 3 · whole chapter" (r3-04).
   Each part of a row is its own flex item (.sw-goto-ref, .sw-goto-sub, .sw-goto-text), and a
   flex item's leading space collapses under the row's white-space: nowrap, so the browser drew
   "John 3:16— For God" and "John 3· whole chapter" (the 2026-10-18 screenshot). The parts
   that open with a space keep it: white-space: pre (no wrapping, so the text's ellipsis
   still works). jsdom lays nothing out, so this is pinned on the stylesheet's text. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../app.css'), 'utf-8');

/** The declarations every rule naming `sel` (alone or in a list) gives it. */
function declsFor(sel) {
  const out = [];
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(CSS))) {
    const sels = m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((s) => s.trim());
    if (sels.includes(sel)) out.push(m[2]);
  }
  return out.join(';');
}

describe("the go-to's rows keep their spaces", () => {
  it('the sub and the text parts, which open with " · " and " — ", keep the space they open with', () => {
    for (const sel of ['.sw-goto-sub', '.sw-goto-text']) {
      expect(declsFor(sel), sel).toMatch(/white-space:\s*pre\b/);
    }
  });
});

/* The PC box's place is goto.jsx gotoBoxPlace's, measured clear of the title and the control row
   (the review of 2026-10-18); the rule reads it, and keeps the spec's place (640 px, top 24,
   centred over the canvas area) as each fallback for a frame not yet measured. */
describe("the go-to box's place", () => {
  it('.sw-goto reads --sw-goto-x, --sw-goto-w and --sw-goto-top, each with the spec place as its fallback', () => {
    const d = declsFor('.sw-goto');
    expect(d).toMatch(/top:\s*var\(--sw-goto-top,\s*24px\)/);
    expect(d).toMatch(/left:\s*var\(--sw-goto-x,\s*calc\(\(100% - var\(--sw-goto-inset, 0px\)\) \/ 2\)\)/);
    expect(d).toMatch(/width:\s*var\(--sw-goto-w,\s*min\(640px,/);
  });
});
