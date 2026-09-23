/* useLazyBundles tests (PF6).
   ──────────────────────────
   The hook subscribes App() to EVERY __makeLazyLoader corpus object on window
   — the three scripture corpora and every lazy SCREEN bundle — so a lazy load
   re-renders App and its loading route swaps to the real screen. React is a
   test global (vitest.setup.js).

   THE BUG THIS GREW TO COVER (found 2026-09-22, landing 28). The hook knew
   about screens-e and screens-f only. Landings 21-24 added screens-g (the
   Personal Study screens, Bookmarks, Milestones, History) and screens-h (the
   Listening Library) and nobody taught it those two, so when one of them
   arrived nothing told App. The route kept rendering "Loading…" until some
   OTHER state change happened to re-render the tree. It looked fine in
   testing because opening those screens usually also kicks the VOT corpus,
   whose bump does re-render — but a reader who opens My Notes after the
   corpus has already settled just sits there. A lazy bundle without a
   subscription is a screen that never arrives.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
/* Node builtins in an app/src test: this tsconfig has no node types (the
   tools/ suites live outside it), so the three specifiers are ts-ignored
   rather than dragging @types/node into the app's type scope. */
// @ts-ignore -- no node types in this tsconfig
import { readFileSync } from 'node:fs';
// @ts-ignore -- no node types in this tsconfig
import { resolve, dirname } from 'node:path';
// @ts-ignore -- no node types in this tsconfig
import { fileURLToPath } from 'node:url';
import { useLazyBundles } from './use-lazy-bundles.js';

// __answersCorpus is published by utils/sync-loaders.js, not index.html.
const CORPORA = ['__bibleCorpus', '__matthewCorpus', '__votCorpus', '__answersCorpus'];
/* READ FROM index.html, not typed here: every `window.__screensX =` the loader
   IIFE registers. A new lazy bundle therefore fails this file on the day it is
   created, until useLazyBundles subscribes to it — which is the only thing
   that makes its screens appear when the bundle lands. */
const INDEX_HTML = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html'), 'utf-8');
const SCREEN_BUNDLES = [...new Set(
  [...INDEX_HTML.matchAll(/window\.(__screens[A-Z])\s*=/g)].map((m) => m[1]))];
const GLOBALS = [...CORPORA, ...SCREEN_BUNDLES];

function makeCorpus() {
  let v = 0;
  const listeners = new Set();
  return {
    subscribe: vi.fn((cb) => { listeners.add(cb); return () => listeners.delete(cb); }),
    getVersion: () => v,
    bump() { v += 1; listeners.forEach((cb) => cb()); },
  };
}

let renders = 0;
function Probe() { useLazyBundles(); renders++; return null; }

let corpora;
beforeEach(() => {
  renders = 0;
  corpora = {};
  GLOBALS.forEach((g) => { corpora[g] = makeCorpus(); window[g] = corpora[g]; });
});
afterEach(() => {
  cleanup();
  GLOBALS.forEach((g) => { delete window[g]; });
});

describe('useLazyBundles (PF6)', () => {
  it('found the lazy screen bundles in index.html', () => {
    // A derivation that quietly found nothing would make every test below pass.
    expect(SCREEN_BUNDLES.length).toBeGreaterThanOrEqual(4);
  });

  it('subscribes to every lazy-bundle global', () => {
    render(<Probe />);
    GLOBALS.forEach((g) => { expect(corpora[g].subscribe, g + ' is not subscribed').toHaveBeenCalled(); });
  });

  it.each(SCREEN_BUNDLES)('re-renders when %s arrives — the route is waiting on it', (name) => {
    render(<Probe />);
    const before = renders;
    act(() => { corpora[name].bump(); });
    expect(renders, name + ' bumped and App did not re-render').toBeGreaterThan(before);
  });

  it('re-renders when the Answers topics land — the Answers routes wait on them', () => {
    render(<Probe />);
    const before = renders;
    act(() => { corpora.__answersCorpus.bump(); });
    expect(renders).toBeGreaterThan(before);
  });

  it('still re-renders when a scripture corpus bumps (folded-in behavior preserved)', () => {
    render(<Probe />);
    const before = renders;
    act(() => { corpora.__bibleCorpus.bump(); });
    expect(renders).toBeGreaterThan(before);
  });

  it('is inert (no throw) when a loader global is absent', () => {
    delete window.__screensE;
    expect(() => render(<Probe />)).not.toThrow();
  });
});
