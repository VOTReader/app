/* TourOverlay — the ring, the dim and the card, as a screen reader and a
   keyboard meet them.
   ──────────────────────────────────────────────────────────────────────
   RED first (review-tutorial, 2026-09-04). Locks down:
     A) A real dialog: role, aria-modal, labelled by its title, focus lands
        inside it, Tab stays inside (useFocusTrap), the text is polite live.
     B) Skip and Back are always on the card; Back is disabled (not hidden)
        on the welcome card; the primary reads Start / Next / Done.
     C) Escape and Android Back mean Skip — through the modal registry, not a
        listener of its own.
     D) With the target on the page: four dims, one ring around it, and the
        target itself is described by the card and still receives a tap,
        which moves the tour on. Without it: no ring, an honest hint.
     E) It renders nothing while the tour is inactive, and nothing while the
        lazy bundle has not arrived (ready=false) except a plain waiting line.
*/
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { TourOverlay } from './TourOverlay.jsx';
import { TourController } from '../../utils/tour-controller.js';
import { TourDoneFlagStore } from '../../stores/app-flag-stores.js';

const nav = () => ({ goHome: vi.fn(), openLetter: vi.fn(), openBible: vi.fn(), goJournalHub: vi.fn(), openSettingsData: vi.fn() });
const rect = (x, y, w, h) => () => /** @type {any} */ ({ x, y, width: w, height: h, left: x, right: x + w, top: y, bottom: y + h });

beforeEach(() => {
  localStorage.clear();
  TourDoneFlagStore._resetForTests({ forceLoaded: true });
  TourController._resetForTests();
  /** @type {any} */ (globalThis).TourController = TourController;
  document.body.innerHTML = '';
  delete window.__loadScreensE;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

/* Walks the tour to a stop BY ID (a Listen stop stays once pressed, so a count is the wrong unit).
   It throws when it does not get there, and that throw is the point: without it the loop returns on
   whatever stop it happened to land on, so renaming or reordering a step would leave 28 callers here
   quietly asserting about the wrong card — a rename that breaks nothing and passes everything.
   Latent today (seven steps, every id reachable in six presses), which is exactly when to fix it. */
const startAt = (id) => {
  TourController.attachNav(nav());
  TourController.start('prompt');
  for (let i = 0; i < 12 && TourController.getState().step.id !== id; i++) TourController.targetPressed();
  const at = TourController.getState().step.id;
  if (at !== id) throw new Error(`startAt("${id}") never reached that stop: twelve presses from the start landed on "${at}". If a step was renamed or reordered, fix the id here rather than letting every case below assert about a different card.`);
};

describe('TourOverlay — dialog', () => {
  it('renders nothing while the tour is inactive', () => {
    const { container } = render(<TourOverlay />);
    expect(container.querySelector('.tour-card')).toBeNull();
  });

  it('is a labelled modal dialog with the text live and focus inside', () => {
    startAt('welcome');
    render(<TourOverlay />);
    const dlg = screen.getByRole('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(dlg.getAttribute('aria-labelledby'));
    expect(title.textContent).toMatch(/Welcome/);
    expect(dlg.querySelector('[aria-live="polite"]')).toBeTruthy();
    expect(dlg.contains(document.activeElement)).toBe(true);
  });

  it('Skip and Back are on the card; Back is disabled on the welcome card; the primary says Start', () => {
    startAt('welcome');
    render(<TourOverlay />);
    expect(screen.getByRole('button', { name: /leave the tour/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /previous stop/i }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
  });

  it('the primary says Next on a teaching stop and Done on the closing card; Back works', () => {
    startAt('listen');
    const r = render(<TourOverlay />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
    expect(screen.getByText(/2 of 6/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /previous stop/i }));
    expect(TourController.getState().step.id).toBe('letters');
    r.unmount();
    startAt('done');
    render(<TourOverlay />);
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it('Escape (the registry) means Skip, and the flag is recorded', () => {
    startAt('welcome');
    render(<TourOverlay />);
    expect(modalRegistry.isAnyOpen()).toBe(true);
    act(() => { modalRegistry.peek().dismiss(); });
    expect(TourController.getState().active).toBe(false);
    expect(TourDoneFlagStore.is()).toBe(true);
  });

  it('Tab from the last button wraps to the first (focus stays inside)', () => {
    startAt('listen');
    render(<TourOverlay />);
    const next = screen.getByRole('button', { name: 'Next' });
    next.focus();
    fireEvent.keyDown(document.activeElement, { key: 'Tab' });
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(next);
  });
});

describe('TourOverlay — ring and target', () => {
  it('draws four dims and one ring around the visible target, describes it, and a tap on it moves on', () => {
    document.body.innerHTML = '<div id="app"><button class="hero-play-pill">Listen</button></div>';
    const pill = document.querySelector('.hero-play-pill');
    pill.getBoundingClientRect = rect(133, 271, 94, 25);
    startAt('listen');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    expect(document.querySelectorAll('.tour-dim').length).toBe(4);
    const ring = /** @type {HTMLElement} */ (document.querySelector('.tour-ring'));
    expect(ring).toBeTruthy();
    expect(parseFloat(ring.style.left)).toBeLessThan(133);
    expect(parseFloat(ring.style.top)).toBeLessThan(271);
    expect(parseFloat(ring.style.width)).toBeGreaterThan(94);
    expect(pill.getAttribute('aria-describedby')).toBeTruthy();
    fireEvent.click(pill);
    expect(TourController.getState().step.id).toBe('listen');     // a Listen stop stays once pressed
    expect(TourController.getState().pressed).toBe(true);
    expect(screen.getByText(/Hear it\?/)).toBeTruthy();
  });

  it('with no target on the page: no ring, and an honest hint once the wait is over', async () => {
    startAt('listen');
    render(<TourOverlay waitMs={0} />);
    expect(document.querySelector('.tour-ring')).toBeNull();
    await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
    expect(screen.getByText(/could not find/i)).toBeTruthy();
  });

  it('shows a plain waiting line until the lazy bundle is ready', () => {
    window.__loadScreensE = () => new Promise(() => {});
    TourController.attachNav(nav());
    TourController.start('settings');
    render(<TourOverlay />);
    expect(screen.getByText(/one moment/i)).toBeTruthy();
    expect(document.querySelector('.tour-card')).toBeNull();
  });
});

/* Device run (emulator-5554, 393x699, 2026-09-04): the card was placed off the ring with no
   clamp, so a ring near the bottom edge (Export) or a tall one (the Letters tile at 1.8) pushed the
   card, Skip and Next off the screen; the only way out was Android Back. And the one-shot
   scrollIntoView lost to the new screen's scroll-memory reset, leaving the ring below the fold. */
describe('TourOverlay — the card never leaves the screen; the ring is kept on it', () => {
  const vh = () => window.innerHeight;
  it('a target past the bottom edge: the card is clamped inside the viewport, Skip and Next reachable', () => {
    // The Export button, the stop that found this on a 699 px phone (Listen stops dock now, so the
    // clamp is exercised on a beside-the-ring stop).
    document.body.innerHTML = '<div id="app"><div data-settings-group="data"><button>Export</button></div></div>';
    const pill = document.querySelector('[data-settings-group="data"] button');
    pill.getBoundingClientRect = rect(60, vh() + 120, 94, 25);      // below the fold, as Export was
    startAt('backup');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    const card = /** @type {HTMLElement} */ (document.querySelector('.tour-card'));
    const top = parseFloat(card.style.top);
    expect(Number.isFinite(top), `card top is "${card.style.top}"`).toBe(true);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top + 220).toBeLessThanOrEqual(vh());                      // the whole card, at its estimated height
  });

  it('a ring taller than the room below: the card sits inside the viewport, over the ring if it must', () => {
    document.body.innerHTML = '<div id="app"><button class="home-nav-item">The Volumes of Truth</button></div>';
    const tile = document.querySelector('.home-nav-item');
    tile.getBoundingClientRect = rect(12, vh() * 0.55, 330, 300);     // the Letters tile at 1.8
    startAt('letters');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    const card = /** @type {HTMLElement} */ (document.querySelector('.tour-card'));
    const top = parseFloat(card.style.top);
    expect(Number.isFinite(top)).toBe(true);
    expect(top + 220).toBeLessThanOrEqual(vh());
  });

  it('a card taller than the room beside the ring is capped to that room, so the ring stays visible', () => {
    // 1.8 on a 699 px phone: the Listen card was 603 px tall and lay over the ringed control. Listen
    // stops dock now; the same cap guards every beside-the-ring stop, here New Entry at the Journal.
    document.body.innerHTML = '<div id="app"><button class="jrn-fab-newentry">New Entry</button></div>';
    const pill = document.querySelector('.jrn-fab-newentry');
    pill.getBoundingClientRect = rect(60, Math.round(vh() * 0.4), 185, 59);
    startAt('journal');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    const card = /** @type {HTMLElement} */ (document.querySelector('.tour-card'));
    const ringH = 59 + 16;                                            // the pill plus the ring's 8 px pad
    expect(parseFloat(card.style.maxHeight)).toBe(vh() - ringH - 18 - 12);   // room below a ring at the top
  });

  it('a card that fits on neither side where the ring sits scrolls the ring to the top of its screen', async () => {
    // The tall Listen card at 1.8: the pill sits mid-screen, the card fits neither above nor below it,
    // but would below once the pill is at the top. Centre-scrolling cannot get there.
    document.body.innerHTML = '<div id="app"><button class="home-nav-item">The Volumes of Truth</button></div>';
    const tile = document.querySelector('.home-nav-item');
    tile.getBoundingClientRect = rect(12, 250, 330, 300);
    const scrolls = vi.fn();
    tile.scrollIntoView = scrolls;
    startAt('letters');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    await act(async () => { await new Promise((r) => setTimeout(r, 500)); });
    expect(scrolls.mock.calls.some((c) => c[0] && c[0].block === 'start')).toBe(true);
  });

  it('keeps the target on screen against a second writer of the scroll position (scroll memory)', async () => {
    // Two writers, one scroll position: the overlay scrolls the target into view, then the new
    // screen's scroll memory sets scrollTop = 0 a few frames later and the target is below the
    // fold again. The assertion is on the RESULTING position after both have run, not on the
    // number of scrollIntoView calls (the broken build called it once too).
    document.body.innerHTML = '<div id="app"><button class="hero-play-pill">Listen</button></div>';
    const pill = document.querySelector('.hero-play-pill');
    let y = vh() + 120;                                                // below the fold on arrival
    pill.getBoundingClientRect = () => rect(60, y, 94, 25)();
    pill.scrollIntoView = () => { y = 300; };                          // the overlay's scroll lands it on screen
    startAt('listen');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
    expect(y).toBe(300);
    y = vh() + 120;                                                    // scroll memory: scrollTop = 0, second writer wins
    await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
    expect(y).toBe(300);                                               // the overlay put it back
    const ring = /** @type {HTMLElement} */ (document.querySelector('.tour-ring'));
    expect(parseFloat(ring.style.top) + parseFloat(ring.style.height)).toBeLessThanOrEqual(vh());
  });

  it('brings the target back when a layout shift pushes it off screen after the re-scroll window, and leaves the reader’s own scroll alone', async () => {
    // Export at the backup stop, in a scroller whose content ABOVE it grows 456 px two seconds after
    // arrival (a Settings group finishing its mount, emulator at 1.8, 2026-09-04): the target leaves
    // the screen while scrollTop has not moved. A reader's scroll moves scrollTop; that is left alone.
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="app"><div class="screen-scroll" style="overflow-y:auto"><div data-settings-group="data"><button>Export</button></div></div></div>';
    const scroller = /** @type {any} */ (document.querySelector('.screen-scroll'));
    Object.defineProperty(scroller, 'scrollHeight', { value: 4000 });
    Object.defineProperty(scroller, 'clientHeight', { value: vh() - 56 });
    let scrollTop = 2959;
    Object.defineProperty(scroller, 'scrollTop', { get: () => scrollTop, set: (v) => { scrollTop = v; }, configurable: true });
    const btn = document.querySelector('[data-settings-group="data"] button');
    let y = 476;
    btn.getBoundingClientRect = () => rect(60, y, 94, 40)();
    const scrolls = vi.fn(() => { y = 300; });
    btn.scrollIntoView = scrolls;
    startAt('backup');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    await act(async () => { vi.advanceTimersByTime(3000); });                 // past RESCROLL_WINDOW_MS
    const before = scrolls.mock.calls.length;
    y = 932;                                                                   // layout shift: scrollTop unchanged
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(scrolls.mock.calls.length).toBeGreaterThan(before);
    expect(y).toBe(300);
    const after = scrolls.mock.calls.length;
    scrollTop = 3400; y = -200;                                                // the reader scrolled it away
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(scrolls.mock.calls.length).toBe(after);
    vi.useRealTimers();
  });

  it('after the press, the card says what to look for and Next moves on', () => {
    document.body.innerHTML = '<div id="app"><button class="hero-play-pill">Listen</button></div>';
    startAt('listen');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    fireEvent.click(screen.getByText('Next'));
    expect(TourController.getState().step.id).toBe('listen');
    expect(screen.getByText(/light up/i)).toBeTruthy();
    expect(screen.queryByText(/press Next and I will do it/i)).toBeNull();
    fireEvent.click(screen.getByText('Next'));
    expect(TourController.getState().step.id).toBe('bible');
  });
});

/* Corbin, on his phone (2026-09-04): at the Listen stops the lit sentence sat under the card and under
   the dim. The rule now: while the tour is showing a highlight, the highlight is the brightest thing on
   the screen and nothing sits over the text. */
describe('TourOverlay — Listen stops dock at the bottom and open the reading column once pressed', () => {
  const vh = () => window.innerHeight;
  const letterScreen = (barTop) => {
    document.body.innerHTML = '<div id="app"><div class="screen-scroll" style="overflow-y:auto"><main class="letter-body"><button class="hero-play-pill">Listen</button><p>Thus says The Lord…</p></main></div>'
      + (barTop != null ? '<div class="audio-bar"></div>' : '') + '</div>';
    const scroller = /** @type {HTMLElement} */ (document.querySelector('.screen-scroll'));
    scroller.getBoundingClientRect = rect(0, 56, 360, vh() - 56);
    Object.defineProperty(scroller, 'scrollHeight', { value: 4000 });
    Object.defineProperty(scroller, 'clientHeight', { value: vh() - 56 });
    const pill = /** @type {HTMLElement} */ (document.querySelector('.hero-play-pill'));
    pill.getBoundingClientRect = rect(133, 271, 94, 25);
    if (barTop != null) /** @type {HTMLElement} */ (document.querySelector('.audio-bar')).getBoundingClientRect = rect(8, barTop, 344, vh() - barTop);
    return pill;
  };
  const dims = () => [...document.querySelectorAll('.tour-dim')].map((d) => { const el = /** @type {HTMLElement} */ (d); return { top: parseFloat(el.style.top), height: parseFloat(el.style.height), width: parseFloat(el.style.width) }; });

  it('before the press: the card sits on the bottom edge, capped to 36 % of the screen, the pill ringed', () => {
    letterScreen(null);
    startAt('listen');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    const card = /** @type {HTMLElement} */ (document.querySelector('.tour-card'));
    expect(card.classList.contains('docked')).toBe(true);
    expect(card.style.top).toBe('');
    expect(parseFloat(card.style.bottom)).toBe(12);
    expect(parseFloat(card.style.maxHeight)).toBe(Math.round(vh() * 0.36));
    expect(document.querySelector('.tour-ring')).toBeTruthy();
    expect(document.querySelectorAll('.tour-dim').length).toBe(4);
  });

  /* A card whose words need more than the fraction takes what it needs, and stops at the room
     DOCK_OPEN_FRAC leaves. jsdom measures nothing, so `scrollHeight` is stubbed here on purpose:
     without it `cardNeed` is 0 at every viewport and the branch under test is unreachable — the
     other cap tests above pass whatever this code does, which is why this one exists.
     320x640 (Native Builder on device, 2026-09-06): 36 % is 230 px, the Listen words need 270, the
     room is 640 - 12 - 352 = 276. The card gets 270 and the sticky button row stops covering the
     last sentence. */
  it('a docked card whose content needs more than 36 % gets it, up to the open-space rule', () => {
    const vh0 = window.innerHeight;
    window.innerHeight = 640;
    try {
      letterScreen(null);
      startAt('listen');
      const proto = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return this.classList && this.classList.contains('tour-card') ? 270 : 0; } });
      // The measuring effect is gated on ResizeObserver, which jsdom does not have: without this
      // stub the effect returns before it measures and the branch under test never runs.
      const ro0 = globalThis.ResizeObserver;
      globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      try {
        render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
        const card = /** @type {HTMLElement} */ (document.querySelector('.tour-card'));
        expect(parseFloat(card.style.maxHeight)).toBe(270);            // not Math.round(640 * 0.36) = 230
        expect(640 - 12 - 270).toBeGreaterThanOrEqual(Math.floor(640 * 0.55));   // 358 open, the rule holds
      } finally { Object.defineProperty(HTMLElement.prototype, 'scrollHeight', proto || { configurable: true, get() { return 0; } }); globalThis.ResizeObserver = ro0; }
    } finally { window.innerHeight = vh0; }
  });

  it('a docked card that wants more than the room is still stopped by the open-space rule', () => {
    const vh0 = window.innerHeight;
    window.innerHeight = 640;
    try {
      letterScreen(null);
      startAt('listen');
      const proto = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return this.classList && this.classList.contains('tour-card') ? 900 : 0; } });
      const ro0 = globalThis.ResizeObserver;
      globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      try {
        render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
        const card = /** @type {HTMLElement} */ (document.querySelector('.tour-card'));
        expect(parseFloat(card.style.maxHeight)).toBe(Math.floor(640 - 12 - 640 * 0.55));   // 276, the room
      } finally { Object.defineProperty(HTMLElement.prototype, 'scrollHeight', proto || { configurable: true, get() { return 0; } }); globalThis.ResizeObserver = ro0; }
    } finally { window.innerHeight = vh0; }
  });

  /* THE SCROLL AFFORDANCE (Corbin, 2026-09-06, on "best and most professional"): when the card's
     content overflows, a soft fade above the sticky button row and a small centred chevron, both
     gone once the reader reaches the end. No scrollbar styling, no text. RED first: at 320x640 and
     text size 1.8 the LISTEN card holds 557 px of words in 276 px of room, and today it says
     nothing about the 283 px below the fold.
     Both stubs are needed for the same reason as the cap cases above: jsdom measures nothing and
     the effect that reads the card is gated on ResizeObserver. */
  const withCard = (scrollH, clientH, scrollTop, run) => {
    const proto = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    const protoC = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    const ro0 = globalThis.ResizeObserver;
    const isCard = (el) => el.classList && el.classList.contains('tour-card');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return isCard(this) ? scrollH : 0; } });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return isCard(this) ? clientH : 0; } });
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    try { run(); } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', proto || { configurable: true, get() { return 0; } });
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', protoC || { configurable: true, get() { return 0; } });
      globalThis.ResizeObserver = ro0;
    }
  };

  it('a card whose words overflow says so: the fade and the chevron', () => {
    letterScreen(null);
    startAt('listen');
    withCard(557, 276, 0, () => {
      render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
      const card = /** @type {HTMLElement} */ (document.querySelector('.tour-card'));
      expect(card.classList.contains('has-more')).toBe(true);
      const more = card.querySelector('.tour-more');
      expect(more).toBeTruthy();
      expect(more.getAttribute('aria-hidden')).toBe('true');   // decorative: the words are reachable
      expect(more.textContent).toBe('');                        // a chevron, not a word
    });
  });

  it('a card that fits says nothing', () => {
    letterScreen(null);
    startAt('listen');
    withCard(226, 226, 0, () => {
      render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
      const card = /** @type {HTMLElement} */ (document.querySelector('.tour-card'));
      expect(card.classList.contains('has-more')).toBe(false);
      expect(card.querySelector('.tour-more')).toBeNull();
    });
  });

  it('the affordance leaves once the reader reaches the end', () => {
    letterScreen(null);
    startAt('listen');
    withCard(557, 276, 0, () => {
      render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
      const card = /** @type {HTMLElement} */ (document.querySelector('.tour-card'));
      expect(card.classList.contains('has-more')).toBe(true);
      card.scrollTop = 557 - 276;                       // the reader scrolls to the end
      fireEvent.scroll(card);
      expect(card.classList.contains('has-more')).toBe(false);
      expect(card.querySelector('.tour-more')).toBeNull();
    });
  });

  it('with the player bar up, the card docks above the bar', () => {
    letterScreen(vh() - 80);
    startAt('listen');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    const card = /** @type {HTMLElement} */ (document.querySelector('.tour-card'));
    expect(parseFloat(card.style.bottom)).toBe(12 + 80);
  });

  it('after the press: no ring, and the dims leave the reading column open from its scroller down to the card', () => {
    const pill = letterScreen(vh() - 80);
    startAt('listen');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    fireEvent.click(pill);
    expect(TourController.getState().pressed).toBe(true);
    expect(document.querySelector('.tour-ring')).toBeNull();
    const d = dims();
    expect(d.length).toBe(4);
    const cardTop = vh() - (12 + 80) - 220;                 // CARD_EST_H before ResizeObserver reports
    expect(d[0]).toEqual({ top: 0, height: 56, width: window.innerWidth });   // the nav only
    expect(d[1].top).toBe(cardTop);                                     // dim resumes at the card
    expect(d[2].width).toBe(0); expect(d[3].width).toBe(0);            // nothing beside the column
    // The lit words, wherever read-along puts them between the nav and the card, sit under no pane.
    for (const y of [60, 200, cardTop - 1]) expect(d.some((p) => p.width > 0 && y >= p.top && y < p.top + p.height)).toBe(false);
  });

  it('on a 699 px phone with the bar up, the card shrinks so 55 % of the screen stays open above it', () => {
    const vh0 = window.innerHeight;
    window.innerHeight = 699;
    try {
      const pill = letterScreen(699 - 100);                             // the bar at 1.8x is ~100 px
      startAt('listen');
      render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
      const card = /** @type {HTMLElement} */ (document.querySelector('.tour-card'));
      expect(parseFloat(card.style.bottom)).toBe(112);
      expect(parseFloat(card.style.maxHeight)).toBe(Math.floor(699 - 112 - 699 * 0.55));   // 202, not 36 % = 252
      fireEvent.click(pill);
      const cardTop = dims()[1].top;
      expect(cardTop).toBeGreaterThanOrEqual(699 * 0.55);
    } finally { window.innerHeight = vh0; }
  });

  it('while docked, the reading column’s scroller carries the card as scroll-padding-bottom; gone with the tour', async () => {
    const pill = letterScreen(vh() - 80);
    startAt('listen');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    const scroller = /** @type {HTMLElement} */ (document.querySelector('.screen-scroll'));
    const cardTop = vh() - (12 + 80) - 220;
    expect(scroller.style.scrollPaddingBottom).toBe((vh() - cardTop) + 'px');
    fireEvent.click(pill);
    expect(scroller.style.scrollPaddingBottom).toBe((vh() - cardTop) + 'px');          // kept across the press
    await act(async () => { TourController.skip(); });
    expect(scroller.style.scrollPaddingBottom).toBe('');
  });

  it('a bar the previous stop raised does not lift the next stop’s card once it is gone', async () => {
    const pill = letterScreen(vh() - 80);
    startAt('listen');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    expect(parseFloat(/** @type {HTMLElement} */ (document.querySelector('.tour-card')).style.bottom)).toBe(92);
    fireEvent.click(pill);
    document.querySelector('.audio-bar').remove();                      // the tour stopped the playback
    await act(async () => { TourController.next(); });                   // → bible, on the same DOM
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    expect(TourController.getState().step.id).toBe('bible');
    expect(parseFloat(/** @type {HTMLElement} */ (document.querySelector('.tour-card')).style.bottom)).toBe(12);
  });

  it('the Bible stop docks the same way', () => {
    letterScreen(null);
    startAt('bible');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    expect(document.querySelector('.tour-card').classList.contains('docked')).toBe(true);
  });

  it('a stop that is not a Listen stop is placed beside its ring as before', () => {
    document.body.innerHTML = '<div id="app"><button class="jrn-fab-newentry">New Entry</button></div>';
    document.querySelector('.jrn-fab-newentry').getBoundingClientRect = rect(260, vh() - 120, 80, 56);
    startAt('journal');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    const card = /** @type {HTMLElement} */ (document.querySelector('.tour-card'));
    expect(card.classList.contains('docked')).toBe(false);
    expect(card.style.top).not.toBe('');
  });
});

