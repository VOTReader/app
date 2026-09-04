/* reduced-motion — the OS "reduce motion" setting, read at call time.
   ═══════════════════════════════════════════════════════════════════════
   The CSS block in app.css only reaches CSS-DRIVEN scrolling. Per CSSOM-View
   a `behavior` argument passed to scrollIntoView/scrollTo defers to the
   computed `scroll-behavior` only when it is 'auto' — an explicit 'smooth'
   wins over the CSS property, `!important` included. So the JS call sites
   need their own read of the media query; these cases pin it. */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { prefersReducedMotion, scrollBehavior } from './reduced-motion.js';

const REAL = window.matchMedia;
afterEach(() => { setMatchMedia(REAL); });

/** jsdom's MediaQueryList is far wider than the two fields read here. @param {any} fn */
function setMatchMedia(fn) { window.matchMedia = fn; }

/** matchMedia that answers `matches` for the reduce query and false for others. */
function stub(matches) {
  setMatchMedia(vi.fn((q) => ({
    matches: q === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: q,
  })));
}

describe('reduced-motion', () => {
  it('reads the reduce query and reports it', () => {
    stub(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('reports false when the OS is not asking for reduced motion', () => {
    stub(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('flips the scroll behavior with the query', () => {
    stub(true);
    expect(scrollBehavior()).toBe('instant');
    stub(false);
    expect(scrollBehavior()).toBe('smooth');
  });

  it('reads the setting at call time, not at import time', () => {
    stub(false);
    expect(scrollBehavior()).toBe('smooth');
    stub(true);   // the reader flips it in OS settings mid-session
    expect(scrollBehavior()).toBe('instant');
  });

  /* Embedded WebViews have shipped without matchMedia, and some throw on an
     unrecognized query. Motion is the safe default there: a smooth scroll is
     a comfort loss, a thrown TypeError inside a click handler is a dead
     button. */
  it('falls back to motion when matchMedia is absent', () => {
    setMatchMedia(undefined);
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe('smooth');
  });

  it('falls back to motion when matchMedia throws', () => {
    setMatchMedia(() => { throw new TypeError('unsupported media query'); });
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe('smooth');
  });
});
