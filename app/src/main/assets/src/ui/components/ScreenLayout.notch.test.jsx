// @ts-nocheck — free-var globals stubbed per test (bundle-d component contract)
/* ScreenLayout — the scroll-notch marker is OPT-IN, and so is its machinery.
   ═══════════════════════════════════════════════════════════════════════
   C2-C [C4]. The notch is a reading aid behind Settings → Reading
   ("Show scroll notch"), mirrored onto `body.scroll-notch` by use-settings.
   Its marker needs a ResizeObserver plus a 500 ms interval that re-attaches
   that observer whenever __scrollEl is swapped for a new screen's container.

   THE DEFECT: both were built unconditionally, on every screen, for every
   reader. The body-class check lived INSIDE the interval callback's update()
   — so with the notch off (the default) the timer still fired twice a second
   forever, did its property check, set opacity 0 and returned. A 2 Hz timer
   whose entire job was to discover it had no job.

   The gate moved to the effect: the class is watched with a MutationObserver
   (event-driven, silent while idle) and the interval only exists while the
   notch is on. These tests count the real constructions.
*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { ScreenLayout } from './ScreenLayout.jsx';

const SL = /** @type {any} */ (ScreenLayout);

/** Every ResizeObserver this render constructs. ScreenLayout has exactly one
    RO — the notch marker's — so the count IS the notch machinery's cost. */
let roCount = 0;
/** 500 ms intervals. useReadTracker also owns one (its per-screen sweep), so
    the notch's contribution is the DELTA above that baseline. */
let intervals500 = 0;
let realRO;
let realSetInterval;

beforeEach(() => {
  /** @type {any} */ (globalThis).__scrollEl = null;
  document.body.classList.remove('scroll-notch');
  roCount = 0;
  intervals500 = 0;
  realRO = globalThis.ResizeObserver;
  realSetInterval = globalThis.setInterval;
  globalThis.ResizeObserver = class {
    constructor() { roCount++; }
    observe() {} unobserve() {} disconnect() {}
  };
  globalThis.setInterval = (fn, ms, ...rest) => {
    if (ms === 500) intervals500++;
    return realSetInterval(fn, ms, ...rest);
  };
});

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = realRO;
  globalThis.setInterval = realSetInterval;
  document.body.classList.remove('scroll-notch');
});

const mount = () => render(<SL hideTabsBtn navChildren={null}>body</SL>);

describe('ScreenLayout — scroll-notch machinery is gated on the setting [C4]', () => {
  it('builds NO observer and NO poll for a reader with the notch off', () => {
    mount();
    // THE RED PROOF: pre-fix this was 1 observer + 1 extra 500 ms interval on
    // every screen, for the default setting, doing nothing but re-checking a
    // class it had already failed.
    expect(roCount).toBe(0);
    expect(intervals500).toBe(1);   // useReadTracker's sweep only
  });

  it('builds them once the notch setting is on', () => {
    document.body.classList.add('scroll-notch');
    mount();
    expect(roCount).toBe(1);
    expect(intervals500).toBe(2);   // the read-tracker sweep + the notch poll
  });

  // MutationObserver delivers on a microtask, so the class flips below are
  // awaited — the setting reaching the screen costs one tick, not a frame.
  it('starts the machinery when the setting is switched on mid-session', async () => {
    mount();
    expect(roCount).toBe(0);
    await act(async () => { document.body.classList.add('scroll-notch'); });
    expect(roCount).toBe(1);
  });

  it('tears the machinery down again when the setting is switched off', async () => {
    document.body.classList.add('scroll-notch');
    mount();
    const before = intervals500;
    await act(async () => { document.body.classList.remove('scroll-notch'); });
    // No NEW interval, and the marker is hidden — the effect cleanup cleared
    // the old one on the way out.
    expect(intervals500).toBe(before);
    expect(document.querySelector('.scroll-notch-marker').style.opacity).toBe('0');
  });

  it('reads a class that was already set before mount', () => {
    document.body.classList.add('scroll-notch');
    mount();
    expect(roCount).toBe(1);
  });

  it('leaves an inert pager peek out of it entirely', () => {
    document.body.classList.add('scroll-notch');
    render(<SL hideTabsBtn inert navChildren={null}>peek</SL>);
    expect(roCount).toBe(0);
    // A clone must claim none of the live screen's singletons.
    expect(/** @type {any} */ (globalThis).__scrollEl).toBe(null);
  });

  it('does not leak the class watcher after unmount', async () => {
    const view = mount();
    view.unmount();
    // A disconnected observer cannot re-arm the machinery from a later toggle.
    await act(async () => { document.body.classList.add('scroll-notch'); });
    expect(roCount).toBe(0);
  });
});

describe('ScreenLayout — the notch marker itself still paints', () => {
  it('places the marker from the .reading-end sentinel when the notch is on', async () => {
    const { container } = render(
      <SL hideTabsBtn navChildren={null}><div className="reading-end" /></SL>,
    );
    const scrollEl = container.querySelector('.screen-scroll');
    // jsdom reports zero geometry; give the container a scrollable shape so
    // update() reaches its placement branch instead of the bail-out.
    Object.defineProperty(scrollEl, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(scrollEl, 'clientHeight', { value: 800, configurable: true });
    await act(async () => { document.body.classList.add('scroll-notch'); });
    expect(container.querySelector('.scroll-notch-marker').style.opacity).toBe('0.5');
  });

  it('hides the marker when the notch is off, without a timer to do it', () => {
    const { container } = render(
      <SL hideTabsBtn navChildren={null}><div className="reading-end" /></SL>,
    );
    expect(container.querySelector('.scroll-notch-marker').style.opacity).toBe('0');
    expect(roCount).toBe(0);
  });
});
