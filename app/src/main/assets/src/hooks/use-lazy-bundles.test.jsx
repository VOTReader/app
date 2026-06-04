/* useLazyBundles tests (PF6).
   ──────────────────────────
   The hook subscribes App() to the four __makeLazyLoader corpus objects on
   window (3 scripture corpora + screens-e) so a lazy load re-renders App and
   its loading routes swap to the real screen. React is a test global
   (vitest.setup.js).
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { useLazyBundles } from './use-lazy-bundles.js';

const GLOBALS = ['__bibleCorpus', '__matthewCorpus', '__votCorpus', '__screensE'];

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
  it('subscribes to all four lazy-bundle globals', () => {
    render(<Probe />);
    GLOBALS.forEach((g) => { expect(corpora[g].subscribe).toHaveBeenCalled(); });
  });

  it('re-renders when the screens-e bundle bumps its version (the PF6 path)', () => {
    render(<Probe />);
    const before = renders;
    act(() => { corpora.__screensE.bump(); });
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
