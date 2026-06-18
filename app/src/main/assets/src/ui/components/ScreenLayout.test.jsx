/* ScreenLayout — scroll-lift click-suppression contract.
   ──────────────────────────────────────────────────────
   After a scroll (or a >300 ms hold) on the reading content, the next
   synthesized click is suppressed so a finger that lifts on a footnote /
   link / highlight doesn't accidentally activate it. The suppressor is a
   document-wide, capture-phase, one-shot click eater (it must out-race the
   renderer's element-level touchend handlers, which run before any bubble
   listener).

   It MUST only eat clicks landing INSIDE the scroll container. A deliberate
   tap on chrome OUTSIDE it — the Tabs button and every other .top-nav
   control — must pass through, even within the 300 ms window. This is the
   regression guard for the "Tabs button lights up gold but does nothing
   after scrolling" bug: the suppressor used to swallow the next click
   ANYWHERE, so a scroll-then-tap-Tabs (the natural read-then-switch gesture)
   had its click stopPropagation'd before React's onClick ever saw it.

   The handlers live in a mount-time useEffect closure attached to the scroll
   container + document, so they can only be exercised by rendering the
   component and dispatching real events. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { ScreenLayout } from './ScreenLayout.jsx';

beforeEach(() => {
  // `__scrollEl` is a bundle-level global (index.html `let`); the ref callback
  // assigns it by bare name. Pre-create the property so the strict-mode ESM
  // assignment resolves instead of throwing ReferenceError.
  /** @type {any} */ (globalThis).__scrollEl = null;
  // jsdom has no ResizeObserver; the scroll-notch effect constructs one.
  globalThis.ResizeObserver = globalThis.ResizeObserver
    || class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => { cleanup(); });

function fireTouch(target, type, x, y) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'touches', { value: [{ clientX: x, clientY: y }], configurable: true });
  target.dispatchEvent(ev);
}

/** A scroll gesture that lifts on the reading content → arms the one-shot. */
function armSuppressorByScroll(scrollEl) {
  fireTouch(scrollEl, 'touchstart', 100, 300);
  fireTouch(scrollEl, 'touchmove', 100, 278); // dy = 22 > 8 px and > dx → a scroll
  fireTouch(scrollEl, 'touchend', 100, 278);
}

function fireClick(target) {
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev;
}

// ScreenLayout has no explicit props type (destructured params infer as
// all-required); cast to any so the test can omit the cosmetic props.
const SL = /** @type {any} */ (ScreenLayout);

function mount() {
  return render(
    <SL
      hideTabsBtn
      showProgress={false}
      navChildren={<button data-testid="nav-btn" className="nav-home">nav</button>}
    >
      <button data-testid="content-btn">content</button>
    </SL>,
  );
}

describe('ScreenLayout scroll-lift click suppression', () => {
  it('suppresses the accidental click on reading content after a scroll', () => {
    const { container } = mount();
    const scrollEl = container.querySelector('.screen-scroll');
    const contentBtn = container.querySelector('[data-testid="content-btn"]');
    act(() => { armSuppressorByScroll(scrollEl); });
    const ev = fireClick(contentBtn);
    expect(ev.defaultPrevented).toBe(true); // in-content tap is eaten (intended)
  });

  it('does NOT suppress a deliberate tap on nav chrome after a scroll (Tabs-button bug)', () => {
    const { container } = mount();
    const scrollEl = container.querySelector('.screen-scroll');
    const navBtn = container.querySelector('[data-testid="nav-btn"]');
    act(() => { armSuppressorByScroll(scrollEl); });
    const ev = fireClick(navBtn);
    expect(ev.defaultPrevented).toBe(false); // out-of-scroll chrome tap passes through
  });

  it('leaves clicks alone entirely when there was no preceding scroll', () => {
    const { container } = mount();
    const contentBtn = container.querySelector('[data-testid="content-btn"]');
    const ev = fireClick(contentBtn); // no arm step
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe('ScreenLayout scroll-target registration (trackScroll)', () => {
  it('registers its container as the global __scrollEl by default (a real screen)', () => {
    const { container } = render(<SL hideTabsBtn navChildren={null}>x</SL>);
    expect(/** @type {any} */ (globalThis).__scrollEl).toBe(container.querySelector('.screen-scroll'));
  });

  it('does NOT hijack __scrollEl when trackScroll is false (an overlay)', () => {
    // Simulate a real reading screen already being the scroll target.
    const reading = document.createElement('div');
    /** @type {any} */ (globalThis).__scrollEl = reading;
    render(<SL hideTabsBtn trackScroll={false} navChildren={null}>x</SL>);
    expect(/** @type {any} */ (globalThis).__scrollEl).toBe(reading); // overlay left it alone
  });

  it('does NOT null __scrollEl when a trackScroll=false overlay unmounts (the recording-death fix)', () => {
    // The bug: the Tabs overview (its own ScreenLayout) nulled __scrollEl on
    // close, killing scroll recording on the screen underneath until the next
    // nav. With trackScroll={false}, opening AND closing it leave __scrollEl —
    // the reading container — fully intact.
    const reading = document.createElement('div');
    /** @type {any} */ (globalThis).__scrollEl = reading;
    const { unmount } = render(<SL hideTabsBtn trackScroll={false} navChildren={null}>x</SL>);
    expect(/** @type {any} */ (globalThis).__scrollEl).toBe(reading);
    unmount();
    expect(/** @type {any} */ (globalThis).__scrollEl).toBe(reading); // still intact after close
  });
});

describe('ScreenLayout pager wiring', () => {
  const pager = { peek: () => ({ kind: 'verses', verses: [] }), onPrev: () => {}, onNext: () => {} };

  it('wraps children in .pager-track inside a .pager-viewport when a pager is passed', () => {
    const { container } = render(<SL hideTabsBtn navChildren={null} pager={pager}><span data-testid="c">body</span></SL>);
    expect(container.querySelector('.pager-viewport')).toBeTruthy();
    const track = container.querySelector('.screen-scroll .pager-track');
    expect(track).toBeTruthy();
    expect(track.querySelector('[data-testid="c"]')).toBeTruthy(); // children live in the track
  });

  it('still registers .screen-scroll as __scrollEl on the pager path', () => {
    const { container } = render(<SL hideTabsBtn navChildren={null} pager={pager}>x</SL>);
    expect(/** @type {any} */ (globalThis).__scrollEl).toBe(container.querySelector('.screen-scroll'));
  });

  it('pre-mounts both peeks at rest (parked off-screen at CSS ±100%)', () => {
    const { container } = render(<SL hideTabsBtn navChildren={null} pager={pager}>x</SL>);
    // Both peeks are in the DOM immediately — no swipe needed — so the gesture
    // controller can drive them with zero React state delay.
    expect(container.querySelector('.pager-peek-prev')).toBeTruthy();
    expect(container.querySelector('.pager-peek-next')).toBeTruthy();
  });
});
