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

/* Compact is a root 500 px tall or less (spec 4.5), not a narrow one: the phone in landscape is
   891 px wide, so chips keyed to .sw-narrow kept the PC sizes there (the review of 2026-10-18). */
describe("the go-to's chips in compact mode", () => {
  it('the compact chips are keyed to .is-compact: 13 px edge chips at a 16 px gutter, a 14 px verse chip', () => {
    expect(declsFor('.sw-goto-edge.is-compact')).toMatch(/font-size:\s*var\(--fsc-13\)/);
    expect(declsFor('.sw-goto-edge.is-compact')).toMatch(/--sw-goto-gutter:\s*16px/);
    expect(declsFor('.sw-goto-chip.is-compact')).toMatch(/font-size:\s*var\(--fsc-14\)/);
    expect(CSS).not.toMatch(/\.sw-narrow \.sw-goto-(chip|edge)/);
  });
});

/* The compact box lies over the title and the control row (the header row, w4 below), and its
   0.96 fill let their gold text ghost through behind the query (the review of 2026-10-18). While it is open they are hidden (visibility, so nothing reflows); the
   Back button, left of the box, stays. */
describe('the chrome under the compact box', () => {
  it('the title and the control row are hidden while a compact box is open; the topbar (Back) is not', () => {
    const under = '.sw-root:has(> .sw-goto.is-compact)';
    expect(declsFor(under + ' .sw-title')).toMatch(/visibility:\s*hidden/);
    expect(declsFor(under + ' .sw-controls')).toMatch(/visibility:\s*hidden/);
    // a hover tip left under it ghosted the same way (the phone walk, tools/e2e-sw-goto.mjs)
    expect(declsFor(under + ' .sw-tip')).toMatch(/visibility:\s*hidden/);
    expect(declsFor(under + ' .sw-topbar')).toBe('');
  });
});

/* w4 (the phone stream). The spec's 64 / 64 at top 8 put the box's edge on Back's (both at 64)
   and its field 6 px above Back's line, and with the landscape keyboard up (about half the 411 px
   root) three rows, the hairline and the hint ran under the keyboard (shot s07k). The box now
   takes the header row: its field on Back's centre line (Back is 40 px at chrome-top + 8, so a
   48 px field at chrome-top + 4), 12 px after Back, out to the 16 px compact gutter where the
   control row ended (the panel's width more when one is docked); and it is never taller than
   the room above the keyboard (either inset: --keyboard-height on the web, --inset-bottom with
   the IME in it on the APK), where the list scrolls. */
describe('the compact box takes the header row and keeps above the keyboard', () => {
  const d = () => declsFor('.sw-goto.is-compact');
  it("its field sits on Back's line, 12 px after Back, out to the compact gutter", () => {
    expect(d()).toMatch(/top:\s*calc\(var\(--sw-chrome-top\) \+ 4px\)/);
    // the topbar's 16 px left and its 8 px pad, Back's 40 px, then 12
    expect(d()).toMatch(/left:\s*calc\(16px \+ var\(--sw-topbar-pad\) \+ 40px \+ 12px\)/);
    expect(d()).toMatch(/right:\s*calc\(16px \+ var\(--sw-goto-inset, 0px\)\)/);
  });
  it('it is never taller than the room above the keyboard, and the list scrolls in it', () => {
    expect(d()).toMatch(/display:\s*flex/);
    expect(d()).toMatch(/flex-direction:\s*column/);
    expect(d()).toMatch(/max-height:\s*calc\(100% - var\(--sw-chrome-top\) - 8px - max\(var\(--keyboard-height, 0px\), var\(--inset-bottom, 0px\)\)\)/);
    expect(declsFor('.sw-goto.is-compact .sw-goto-field')).toMatch(/flex:\s*none/);
    const list = declsFor('.sw-goto.is-compact .sw-goto-list');
    expect(list).toMatch(/overflow-y:\s*auto/);
    expect(list).toMatch(/min-height:\s*0/);
    expect(list).toMatch(/overscroll-behavior:\s*contain/);
  });
  /* a portrait phone draws the web turned (.sw-rotated): the keyboard rises from the glass's
     bottom, which is the turned root's right end, so there it takes width, not height */
  it('turned (a portrait phone), the keyboard takes the right end, not the height', () => {
    const r = declsFor('.sw-root.sw-rotated > .sw-goto.is-compact');
    expect(r).toMatch(/right:\s*calc\(16px \+ max\(var\(--sw-goto-inset, 0px\), var\(--keyboard-height, 0px\), var\(--inset-bottom, 0px\)\)\)/);
    expect(r).toMatch(/max-height:\s*calc\(100% - var\(--sw-chrome-top\) - 8px\)/);
  });
});
