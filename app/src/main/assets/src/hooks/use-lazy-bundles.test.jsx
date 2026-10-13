/* useLazyBundles tests (PF6, rewritten for lz1 2026-10-13).
   ──────────────────────────
   The hook subscribes App() to EVERY __makeLazyLoader corpus object on window
   — the three scripture corpora and Answers — so a lazy load re-renders App
   and its loading route swaps to the real screen. React is a test global
   (vitest.setup.js).

   THE BUG THIS GREW TO COVER (found 2026-09-22, landing 28). The hook knew
   about two of the four lazy SCREEN bundles; when one of the other two
   arrived nothing told App, and the route kept rendering "Loading…" until
   some OTHER state change re-rendered the tree. A lazy bundle without a
   subscription is a screen that never arrives. The screen bundles are gone
   (lz1 folded e-h into bundle-d), but the law holds for every loader
   index.html still registers, so the list below is read from index.html.
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

/* READ FROM index.html, not typed here: every `window.__X = <loader>.corpus`
   the loader IIFE registers. A new lazy bundle therefore fails this file on
   the day it is created, until useLazyBundles subscribes to it. */
const INDEX_HTML = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html'), 'utf-8');
const INDEX_LOADERS = [...new Set(
  [...INDEX_HTML.matchAll(/window\.(__\w+)\s*=\s*\w+\.corpus\b/g)].map((m) => m[1]))];
// __answersCorpus is published by utils/sync-loaders.js, not index.html.
const GLOBALS = [...new Set([...INDEX_LOADERS, '__answersCorpus'])];

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
  it('found the corpus loaders in index.html', () => {
    // A derivation that quietly found nothing would make every test below pass.
    expect(INDEX_LOADERS).toEqual(expect.arrayContaining(['__bibleCorpus', '__matthewCorpus', '__votCorpus']));
  });

  it('index.html registers no lazy SCREEN bundle (lz1: screen code ships in bundle-d)', () => {
    expect(INDEX_HTML).not.toMatch(/__screens[A-Z]|__loadScreens[A-Z]|bundle-[e-h]\.js|screens-[e-h]\.min\.css/);
  });

  it('subscribes to every lazy-bundle global', () => {
    render(<Probe />);
    GLOBALS.forEach((g) => { expect(corpora[g].subscribe, g + ' is not subscribed').toHaveBeenCalled(); });
  });

  it.each(GLOBALS)('re-renders when %s arrives — the route is waiting on it', (name) => {
    render(<Probe />);
    const before = renders;
    act(() => { corpora[name].bump(); });
    expect(renders, name + ' bumped and App did not re-render').toBeGreaterThan(before);
  });

  it('is inert (no throw) when a loader global is absent', () => {
    delete window.__bibleCorpus;
    expect(() => render(<Probe />)).not.toThrow();
  });
});
