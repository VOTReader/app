// @ts-nocheck — reads index.html as text; no component graph needed
/* The boot splash is in the HTML, not only in React.
   ═══════════════════════════════════════════════════════════════════════
   THE DEFECT (Lighthouse on the live site, 2026-09-22): First Contentful
   Paint 2.9 s, Speed Index 4.4 s, and the audit blaming five render-
   blocking requests. The blame was misplaced but the wait was real:
   `<div id="root">` shipped EMPTY, so there was nothing in the document
   for the browser to paint. The first pixel could not arrive until
   bundle-a..d (over 300 KB) had downloaded AND parsed, React had mounted,
   and HydrationGate had rendered its splash. On a cold phone that is a
   blank screen for seconds — the app looks dead, not slow.

   THE FIX. The same splash HydrationGate renders is written STATICALLY
   into `#root`. app.min.css is in <head>, so the browser can paint the
   gold "VOTReader" word as soon as the stylesheet lands — before a byte
   of the app has been parsed. React's createRoot() replaces the
   container's children on its first commit, and the markup it replaces
   them with is byte-identical, so nothing flashes: the reader sees one
   splash that simply arrives sooner.

   WHAT THIS TEST PINS. The static copy and the React copy must not drift
   apart — the day HydrationGate changes its splash, the HTML has to
   follow, or the handoff starts to flicker.
*/

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', '..');
const html = readFileSync(resolve(ASSETS, 'index.html'), 'utf-8');
const gate = readFileSync(resolve(ASSETS, 'src', 'components', 'HydrationGate.jsx'), 'utf-8');

/** The `<div id="root">…</div>` element, contents included. */
function rootElement() {
  const open = html.indexOf('<div id="root"');
  expect(open).toBeGreaterThan(-1);
  const close = html.indexOf('</div>', open);
  const end = html.indexOf('>', open);
  return html.slice(end + 1, close);
}

describe('index.html — the boot splash paints before the bundles', () => {
  it('ships the splash inside #root, not an empty div', () => {
    const inner = rootElement();
    expect(inner).toMatch(/class="hydration-loading"/);
    expect(inner).toMatch(/class="hydration-loading-text"/);
    expect(inner).toMatch(/VOTReader/);
  });

  it('carries the same live-region semantics React gives it', () => {
    const inner = rootElement();
    expect(inner).toMatch(/role="status"/);
    expect(inner).toMatch(/aria-live="polite"/);
    // …and HydrationGate still renders those, so the two agree.
    expect(gate).toMatch(/className="hydration-loading" role="status" aria-live="polite"/);
    expect(gate).toMatch(/className="hydration-loading-text">VOTReader</);
  });

  it('keeps the splash ahead of the first bundle in document order', () => {
    const splash = html.indexOf('class="hydration-loading"');
    const firstBundle = html.indexOf('<script src="dist/bundle-a.js">');
    expect(splash).toBeGreaterThan(-1);
    expect(firstBundle).toBeGreaterThan(-1);
    expect(splash).toBeLessThan(firstBundle);
  });
});
