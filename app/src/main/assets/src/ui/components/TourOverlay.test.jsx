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
import { AnnotationStore } from '../../stores/annotation-store.js';

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
  for (let i = 0; i < 20 && TourController.getState().step.id !== id; i++) TourController.targetPressed();
  const at = TourController.getState().step.id;
  if (at !== id) throw new Error(`startAt("${id}") never reached that stop: twenty presses from the start landed on "${at}". If a step was renamed or reordered, fix the id here rather than letting every case below assert about a different card.`);
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
    expect(screen.getByText(/2 of 11/)).toBeTruthy();
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
    expect(TourController.getState().step.id).toBe('highlight');
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

  /* A SHORT FRAME (a phone in landscape, under 480 px tall — the Tour Reviewer's D3, 2026-09-13): 55 %
     of 360 leaves 150 px of room, so every docked card sat at its 160 px floor and hid its own words
     (the Listen promise cut in half, five of nine stops at Text Size 1). A fraction of the screen is
     the wrong unit there; what must stay open is the reading column — 120 px of it below the top bar,
     the same floor the highlight band keeps — and the card may take the rest. The fixture's scroller
     starts at 56, so the room is 360 - 12 - (56 + 120) = 172, not the floor. */
  it('in a frame under 480 px tall a docked card may take what leaves 120 px of column below the scroller\'s top', () => {
    const vh0 = window.innerHeight;
    window.innerHeight = 360;
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
        expect(parseFloat(card.style.maxHeight)).toBe(360 - 12 - (56 + 120));   // 172: the column keeps 120 px
        expect(parseFloat(card.style.maxHeight)).not.toBe(160);                 // not the floor the 55 % rule left
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
    /* The next DOCKED stop is now six on: the highlight stop and, since the Bible moved to the end
       (2026-09-13), the four ring stops after it sit between them, each placed beside its ring like
       any other (none of those rings is in this fixture, so each is simply walked). It is walked
       through rather than skipped to: the bar being gone has to survive the stops in between, which
       is the whole of what this case is about. This fixture's paragraph carries no .letter-para, so
       the demonstration finds nothing to paint and this case stays about the card's geometry. */
    await act(async () => { TourController.next(); });                   // → highlight
    await act(async () => { TourController.next(); });                   // shows the demonstration, stays
    for (const id of ['scripture-web', 'journal', 'backup', 'settings', 'bible']) {
      await act(async () => { TourController.next(); });                 // → the next stop, on the same DOM
      expect(TourController.getState().step.id).toBe(id);
    }
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
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


/* ═══════════════════════════════════════════════════════════════════════
   The highlight stop — a demonstration that writes nothing
   ═══════════════════════════════════════════════════════════════════════
   Corbin, 2026-09-10: "Make sure the introductory tutorial has a thing for
   highlighting text if it doesn't already." The stop shows the colour on a real
   paragraph so the reader knows what to look for under their own finger.

   THE PAINT IS NOT AN ANNOTATION. It is two classes on the paragraph the stop
   already rings, and nothing reaches AnnotationStore. Every case below carries the
   store assertion rather than one case owning it, because "the tour did not write"
   has to be true at each exit — Next, Skip, and the reader's own long press — and a
   single end-of-tour check would pass while an intermediate write was undone.
*/
describe('TourOverlay — the highlight stop paints a demonstration and never saves one', () => {
  const paras = () => [...document.querySelectorAll('.letter-para')].map((p) => /** @type {HTMLElement} */ (p));
  /** The letter screen the Listen stop leaves open: one visible paragraph and one the pager parks off-screen. */
  const letterWithParas = () => {
    document.body.innerHTML = '<div id="app"><main class="letter-body">'
      + '<p class="letter-para" id="off">A page the pager keeps beside this one.</p>'
      + '<p class="letter-para" id="on">Thus says The Lord: I AM calling out to My people.</p>'
      + '</main></div>';
    const [off, on] = paras();
    off.getBoundingClientRect = rect(-360, 120, 312, 96);
    on.getBoundingClientRect = rect(24, 120, 312, 96);
    return { off, on };
  };
  /** Every annotation segment in the store, flattened — the unit the "nothing was written" claim is about. */
  const annCount = () => Object.values(AnnotationStore.all() || {}).reduce((n, arr) => n + (arr ? arr.length : 0), 0);

  /* IT DOCKS, for the Listen stops' reason and for a second one of its own. The rule is that while
     the tour is showing something ON the text, nothing sits over the text — which is what this stop
     does. And the geometry insists: a letter paragraph measures 551–583 px on a 360x800 phone whose
     reading column starts at 67, so a card placed BESIDE that ring has nowhere to go (measured in
     the browser: ring at -5..562 with the card over its lower half). Docked, the paragraph has the
     room above the card. */
  it('the card docks, the way it does on the stops that show something on the text', () => {
    letterWithParas();
    startAt('highlight');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    const card = /** @type {HTMLElement} */ (document.querySelector('.tour-card'));
    expect(card.classList.contains('docked')).toBe(true);
    expect(card.style.top).toBe('');
    expect(parseFloat(card.style.bottom)).toBe(12);
    // Before the demonstration the paragraph is still ringed; the ring goes once the colour is on.
    expect(document.querySelector('.tour-ring')).toBeTruthy();
    fireEvent.click(screen.getByText('Next'));
    expect(document.querySelector('.tour-ring')).toBeNull();
    expect(document.querySelectorAll('.tour-dim').length).toBe(4);
  });

  it('Next paints the ringed paragraph, says what to look for, and stays on the stop', () => {
    const { off, on } = letterWithParas();
    const before = annCount();
    startAt('highlight');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    expect(on.classList.contains('hl-mark')).toBe(false);
    fireEvent.click(screen.getByText('Next'));
    expect(TourController.getState().step.id).toBe('highlight');
    expect(on.classList.contains('hl-mark')).toBe(true);
    expect(on.classList.contains('hl-yellow')).toBe(true);
    // The pager's off-screen copy is not the paragraph the reader is looking at.
    expect(off.classList.contains('hl-mark')).toBe(false);
    expect(screen.getByText(/See the colour/i)).toBeTruthy();
    expect(screen.queryByText(/press Next and I will show you/i)).toBeNull();
    expect(annCount()).toBe(before);
  });

  it('the next Next moves on and takes the colour with it', () => {
    const { on } = letterWithParas();
    const before = annCount();
    startAt('highlight');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    fireEvent.click(screen.getByText('Next'));
    expect(on.classList.contains('hl-mark')).toBe(true);
    fireEvent.click(screen.getByText('Next'));
    expect(TourController.getState().step.id).toBe('scripture-web');
    expect(on.classList.contains('hl-mark')).toBe(false);
    expect(on.classList.contains('hl-yellow')).toBe(false);
    expect(document.querySelectorAll('.tour-hl-demo').length).toBe(0);
    expect(annCount()).toBe(before);
  });

  it('Back takes the colour with it too', () => {
    const { on } = letterWithParas();
    startAt('highlight');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    fireEvent.click(screen.getByText('Next'));
    expect(on.classList.contains('hl-mark')).toBe(true);
    fireEvent.click(screen.getByText('Back'));
    expect(TourController.getState().step.id).toBe('listen');
    expect(on.classList.contains('hl-mark')).toBe(false);
  });

  it('leaving the tour mid-demonstration leaves no colour behind', () => {
    const { on } = letterWithParas();
    const before = annCount();
    startAt('highlight');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    fireEvent.click(screen.getByText('Next'));
    expect(on.classList.contains('hl-mark')).toBe(true);
    fireEvent.click(screen.getByText('Skip'));
    expect(TourController.getState().active).toBe(false);
    expect(on.classList.contains('hl-mark')).toBe(false);
    expect(document.querySelectorAll('.tour-hl-demo').length).toBe(0);
    expect(annCount()).toBe(before);
  });

  /* Same rule as the tap-through on Listen: the reader who does it themselves has already seen
     what the demonstration would have shown, so the tour moves on and paints nothing. The signal
     is the real selection bar being up — a long press does not raise a click, so the overlay's
     click listener cannot see this one. */
  it("the reader's own long press moves the tour on without painting anything", async () => {
    const { on } = letterWithParas();
    const before = annCount();
    startAt('highlight');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    expect(TourController.getState().step.id).toBe('highlight');
    await act(async () => {
      document.querySelector('#app').insertAdjacentHTML('beforeend', '<div class="sel-toolbar">Highlight</div>');
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(TourController.getState().pressed).toBe(true);
    expect(on.classList.contains('hl-mark')).toBe(false);
    expect(document.querySelectorAll('.tour-hl-demo').length).toBe(0);
    expect(annCount()).toBe(before);
  });

  /* The whole walk, because the claim Corbin cares about is about the tour and not about one
     stop: a reader who takes the tour end to end has nothing new in their Library. */
  it('a whole tour, demonstration included, writes not one annotation', () => {
    letterWithParas();
    const before = annCount();
    startAt('highlight');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    fireEvent.click(screen.getByText('Next'));            // paint
    fireEvent.click(screen.getByText('Next'));            // on to the Bible stop
    for (let i = 0; i < 12 && TourController.getState().active; i++) TourController.targetPressed();
    expect(TourController.getState().active).toBe(false);
    expect(annCount()).toBe(before);
    expect(document.querySelectorAll('.tour-hl-demo').length).toBe(0);
  });
});

/* The three exits the block above does not reach, and one arm that is about the SIGNAL rather
   than about the paint. Kept separate because each is a different mechanism: the registry's
   dismiss (Escape and Android Back share it), React unmounting the overlay under a live paint,
   and the difference between a selection bar that APPEARS and one that was already up. */
describe('TourOverlay — the demonstration leaves by every door', () => {
  const letterWithParas = () => {
    document.body.innerHTML = '<div id="app"><main class="letter-body">'
      + '<p class="letter-para" id="on">Thus says The Lord: I AM calling out to My people.</p>'
      + '</main></div>';
    const on = /** @type {HTMLElement} */ (document.querySelector('#on'));
    on.getBoundingClientRect = rect(24, 120, 312, 96);
    return on;
  };
  const annCount = () => Object.values(AnnotationStore.all() || {}).reduce((n, arr) => n + (arr ? arr.length : 0), 0);

  /* Escape and Android Back are the SAME exit — one dispatcher, use-android-back, reached through
     useModalRegistry — so the registry's dismiss is the faithful way to drive both. Driving a
     keydown here would test jsdom's key handling and leave the Android path unwitnessed. */
  it("the registry's dismiss (Escape, and Android Back) takes the colour with it", () => {
    const on = letterWithParas();
    const before = annCount();
    startAt('highlight');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    fireEvent.click(screen.getByText('Next'));
    expect(on.classList.contains('hl-mark')).toBe(true);
    act(() => { modalRegistry.peek().dismiss(); });
    expect(TourController.getState().active).toBe(false);
    expect(on.classList.contains('hl-mark')).toBe(false);
    expect(document.querySelectorAll('.tour-hl-demo').length).toBe(0);
    expect(annCount()).toBe(before);
  });

  /* The screen changing under a live paint. goTo and end cannot see this one — the tour has not
     moved and has not ended — so the overlay's own effect cleanup is what clears it. */
  it('the overlay unmounting under a live demonstration clears it', () => {
    const on = letterWithParas();
    const before = annCount();
    startAt('highlight');
    const r = render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    fireEvent.click(screen.getByText('Next'));
    expect(on.classList.contains('hl-mark')).toBe(true);
    r.unmount();
    expect(on.classList.contains('hl-mark')).toBe(false);
    expect(document.querySelectorAll('.tour-hl-demo').length).toBe(0);
    expect(annCount()).toBe(before);
  });

  /* THE SIGNAL IS AN EDGE, AND A LEVEL CHECK WOULD PASS EVERY OTHER CASE HERE. A selection the
     reader left up before this stop — from the Listen stop, or from before the tour — is not
     them doing the thing being taught, and advancing on it would skip the stop on its first
     frame with nothing shown. The bar must go from absent to present. */
  it('a selection bar already up when the stop opens does not advance it', async () => {
    letterWithParas();
    document.querySelector('#app').insertAdjacentHTML('beforeend', '<div class="sel-toolbar">Highlight</div>');
    startAt('highlight');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
    expect(TourController.getState().step.id).toBe('highlight');
    expect(TourController.getState().pressed).toBe(false);
    expect(screen.getByText(/Try it now/i)).toBeTruthy();
    // And it still answers the real gesture: the bar goes down, then comes back up.
    await act(async () => {
      document.querySelector('.sel-toolbar').remove();
      await new Promise((r) => setTimeout(r, 60));
    });
    await act(async () => {
      document.querySelector('#app').insertAdjacentHTML('beforeend', '<div class="sel-toolbar">Highlight</div>');
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(TourController.getState().pressed).toBe(true);
  });
});

/* THE PLAYER STOPS (Corbin, 2026-09-12). The player stop rings the bar's own button; once pressed the
   ring moves to the voice row inside the sheet (afterTarget), the column is NOT opened (the sheet is
   what the reader looks at), and a tap on the ringed row is not a step (a voice chip changes the
   voice; Next moves on). The back-to-words stop rings the sheet's ‹; once the sheet is gone the words
   are the window and the ring goes. `doneIf` reads the page: the sheet already open on the player stop,
   or already gone on the back-to-words stop, is the press done — by the reader, or by Back. The closing
   card docks over John 3 with the column open and no ring at all. */
describe('TourOverlay — the player stops ring the bar, then the voice row; the sheet\'s ‹; and the closing card is open over the words', () => {
  const vh = () => window.innerHeight;
  const bibleScreen = ({ bar = true, sheet = false } = {}) => {
    document.body.innerHTML = '<div id="app"><div class="screen-scroll" style="overflow-y:auto"><main class="bible-body"><button class="hero-play-pill">Listen</button><p>In the beginning…</p></main></div>'
      + (bar ? '<div class="audio-bar"><button class="audio-bar-summary">John 3</button></div>' : '')
      + (sheet ? '<div class="audio-manager-sheet" style="overflow-y:auto"><button class="sheet-handle-back">‹</button><div class="audio-manager-voice-top">Audio Bible</div><div class="audio-manager-transport">−15</div></div>' : '') + '</div>';
    const scroller = /** @type {HTMLElement} */ (document.querySelector('.screen-scroll'));
    scroller.getBoundingClientRect = rect(0, 56, 360, vh() - 56);
    Object.defineProperty(scroller, 'scrollHeight', { value: 4000 });
    Object.defineProperty(scroller, 'clientHeight', { value: vh() - 56 });
    /** @type {HTMLElement} */ (document.querySelector('.hero-play-pill')).getBoundingClientRect = rect(133, 271, 94, 25);
    if (bar) {
      /** @type {HTMLElement} */ (document.querySelector('.audio-bar')).getBoundingClientRect = rect(8, vh() - 80, 344, 80);
      /** @type {HTMLElement} */ (document.querySelector('.audio-bar-summary')).getBoundingClientRect = rect(60, vh() - 70, 240, 40);
    }
    if (sheet) {
      /** @type {HTMLElement} */ (document.querySelector('.audio-manager-sheet')).getBoundingClientRect = rect(0, 60, 360, vh() - 60);
      /** @type {HTMLElement} */ (document.querySelector('.sheet-handle-back')).getBoundingClientRect = rect(8, 64, 44, 44);
      /** @type {HTMLElement} */ (document.querySelector('.audio-manager-voice-top')).getBoundingClientRect = rect(16, 140, 328, 90);
      /** @type {HTMLElement} */ (document.querySelector('.audio-manager-transport')).getBoundingClientRect = rect(16, 300, 328, 60);
    }
  };
  const openSheet = () => {
    document.querySelector('#app').insertAdjacentHTML('beforeend', '<div class="audio-manager-sheet" style="overflow-y:auto"><button class="sheet-handle-back">‹</button><div class="audio-manager-voice-top">Audio Bible</div><div class="audio-manager-transport">−15</div></div>');
    /** @type {HTMLElement} */ (document.querySelector('.audio-manager-sheet')).getBoundingClientRect = rect(0, 60, 360, vh() - 60);
    /** @type {HTMLElement} */ (document.querySelector('.sheet-handle-back')).getBoundingClientRect = rect(8, 64, 44, 44);
    /** @type {HTMLElement} */ (document.querySelector('.audio-manager-voice-top')).getBoundingClientRect = rect(16, 140, 328, 90);
    /** @type {HTMLElement} */ (document.querySelector('.audio-manager-transport')).getBoundingClientRect = rect(16, 300, 328, 60);
  };
  const ringBox = () => { const r = /** @type {HTMLElement|null} */ (document.querySelector('.tour-ring')); return r ? { top: parseFloat(r.style.top), left: parseFloat(r.style.left), height: parseFloat(r.style.height) } : null; };
  const described = () => [...document.querySelectorAll('[aria-describedby="tour-desc"]')].map((e) => e.className);
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
  beforeEach(() => { /** @type {any} */ (globalThis).AudioPlayer = { stop: vi.fn(), syncKeepAlive: vi.fn(), getState: () => ({ status: 'playing', queue: [{ key: 'bible-brm-kjv:john' }], qi: 0 }) }; });

  it('the player stop: docked above the bar, the bar\'s button ringed and described, four dims', async () => {
    bibleScreen();
    startAt('player');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    await settle();
    const card = /** @type {HTMLElement} */ (document.querySelector('.tour-card'));
    expect(card.classList.contains('docked')).toBe(true);
    expect(parseFloat(card.style.bottom)).toBe(12 + 80);
    expect(ringBox()).toEqual({ top: vh() - 70 - 8, left: 60 - 8, height: 40 + 16 });
    expect(described()).toEqual(['audio-bar-summary']);
    expect(document.querySelectorAll('.tour-dim').length).toBe(4);
    expect(screen.getByText(/Tap it to open the player/)).toBeTruthy();
  });

  it('after the press the ring moves to the voice row, the card says the after-words, and the column is NOT opened', async () => {
    bibleScreen();
    startAt('player');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    await settle();
    act(() => { TourController.next(); });                   // the tour presses the bar (no click reaches a fake sheet)
    openSheet();                                             // …and the sheet opens
    await settle();
    expect(TourController.getState().pressed).toBe(true);
    expect(ringBox()).toEqual({ top: 140 - 8, left: 16 - 8, height: 90 + 16 });
    expect(described()).toEqual(['audio-manager-voice-top']);
    expect(screen.getByText(/Under Listening now/)).toBeTruthy();
    // Not opened: the dims still frame the ring, not the reading column.
    const d = [...document.querySelectorAll('.tour-dim')].map((x) => parseFloat(/** @type {HTMLElement} */ (x).style.height));
    expect(d[0]).toBe(140 - 8);                              // the pane above the ring ends at the ring
  });

  /* THE PRESSED CARD MUST NOT COVER WHAT IT POINTS AT (measured 2026-09-13, 800x360 at Text Size 1: the
     docked card sat at 118..278 over the voice row it ringed at 191..313 — the chips were under the
     card, only the sheet's note showed beneath it). Docked is the rule for a card over the words; once
     the press has moved the ring to the voice row, the card docks only if it clears that ring, and
     otherwise sits beside it like any ringed stop — above, here, where a 160 px card fits. */
  it('in a short frame the pressed player card sits ABOVE the voice row instead of docking over it', async () => {
    const vh0 = window.innerHeight;
    window.innerHeight = 360;
    try {
      bibleScreen();
      startAt('player');
      render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
      await settle();
      act(() => { TourController.next(); });
      openSheet();
      // The voice row where a landscape phone puts it: 200..290, ringed 192..298; the docked card
      // (360 - 92 - 160 = 108) would cover it, and 192 - 18 - 160 = 14 px is room above it.
      /** @type {HTMLElement} */ (document.querySelector('.audio-manager-voice-top')).getBoundingClientRect = rect(16, 200, 328, 90);
      await settle();
      expect(TourController.getState().pressed).toBe(true);
      expect(ringBox()).toEqual({ top: 200 - 8, left: 16 - 8, height: 90 + 16 });
      const card = /** @type {HTMLElement} */ (document.querySelector('.tour-card'));
      expect(card.classList.contains('docked')).toBe(false);
      expect(card.style.bottom).toBe('');
      expect(parseFloat(card.style.top) + parseFloat(card.style.maxHeight)).toBeLessThanOrEqual(192 - 18 + 1);   // wholly above the ring
    } finally { window.innerHeight = vh0; }
  });

  it('CONTROL: on a tall frame the pressed player card stays docked, clear of the ring below the bar', async () => {
    bibleScreen();
    startAt('player');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    await settle();
    act(() => { TourController.next(); });
    openSheet();
    await settle();
    const card = /** @type {HTMLElement} */ (document.querySelector('.tour-card'));
    expect(card.classList.contains('docked')).toBe(true);
    expect(parseFloat(card.style.bottom)).toBe(12 + 80);
    // The docked card's top clears the ring (140..230, ringed to 238) with the gap to spare.
    expect(vh() - (12 + 80) - parseFloat(card.style.maxHeight)).toBeGreaterThanOrEqual(238 + 18);
  });

  it('a recording with one voice: no voice row, so the transport is ringed instead (first on-screen match)', async () => {
    bibleScreen();
    startAt('player');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    await settle();
    act(() => { TourController.next(); });
    openSheet();
    document.querySelector('.audio-manager-voice-top').remove();
    await settle();
    expect(described()).toEqual(['audio-manager-transport']);
    expect(ringBox()).toEqual({ top: 300 - 8, left: 16 - 8, height: 60 + 16 });
  });

  it('a tap on the ringed voice row is not a step: the tour stays on the player stop', async () => {
    bibleScreen();
    startAt('player');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    await settle();
    act(() => { TourController.next(); });
    openSheet();
    await settle();
    fireEvent.click(document.querySelector('.audio-manager-voice-top'));
    await settle();
    expect(TourController.getState().step.id).toBe('player');
    expect(TourController.getState().pressed).toBe(true);
  });

  it('the sheet already open when the player stop shows (the reader tapped the bar; Back from the next stop) counts as pressed', async () => {
    bibleScreen({ sheet: true });
    startAt('player');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    await settle();
    expect(TourController.getState().pressed).toBe(true);
    expect(described()).toEqual(['audio-manager-voice-top']);
    expect(screen.getByText(/Under Listening now/)).toBeTruthy();
  });

  it('the back-to-words stop: the sheet\'s ‹ ringed; once the sheet is gone — by any door — the ring goes, the words are the window', async () => {
    bibleScreen({ sheet: true });
    startAt('back-to-words');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    await settle();
    expect(TourController.getState().pressed).toBe(false);
    expect(ringBox()).toEqual({ top: 64 - 8, left: 8 - 8, height: 44 + 16 });
    expect(described()).toEqual(['sheet-handle-back']);
    expect(screen.getByText(/Tap ‹ at the top of the player/)).toBeTruthy();
    // The reader taps the backdrop (no click on ‹): the sheet unmounts.
    document.querySelector('.audio-manager-sheet').remove();
    await settle();
    expect(TourController.getState().pressed).toBe(true);
    expect(document.querySelector('.tour-ring')).toBeNull();
    expect(screen.getByText(/You are back with the words/)).toBeTruthy();
    expect(screen.queryByText(/could not find it/)).toBeNull();
    // Opened: the dims leave the reading column open from its scroller (56) down to the card.
    const d = [...document.querySelectorAll('.tour-dim')].map((x) => ({ top: parseFloat(/** @type {HTMLElement} */ (x).style.top), height: parseFloat(/** @type {HTMLElement} */ (x).style.height), width: parseFloat(/** @type {HTMLElement} */ (x).style.width) }));
    expect(d[0]).toEqual({ top: 0, height: 56, width: window.innerWidth });
    expect(d[2].width).toBe(0); expect(d[3].width).toBe(0);
  });

  it('no sheet when the back-to-words stop shows (Back from the closing card) counts as pressed at once, with no "could not find it"', async () => {
    bibleScreen();
    startAt('back-to-words');
    render(<TourOverlay waitMs={30} />, { container: document.body.appendChild(document.createElement('div')) });
    await settle();
    expect(TourController.getState().pressed).toBe(true);
    expect(screen.getByText(/You are back with the words/)).toBeTruthy();
    expect(screen.queryByText(/could not find it/)).toBeNull();
    expect(document.querySelector('.tour-ring')).toBeNull();
  });

  it('the closing card docks over John 3 with the reading column open above it and nothing ringed', async () => {
    bibleScreen();
    startAt('done');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    await settle();
    const card = /** @type {HTMLElement} */ (document.querySelector('.tour-card'));
    expect(card.classList.contains('docked')).toBe(true);
    expect(parseFloat(card.style.bottom)).toBe(12 + 80);
    expect(document.querySelector('.tour-ring')).toBeNull();
    expect(screen.getByText(/The reading goes on/)).toBeTruthy();
    const d = [...document.querySelectorAll('.tour-dim')].map((x) => ({ top: parseFloat(/** @type {HTMLElement} */ (x).style.top), height: parseFloat(/** @type {HTMLElement} */ (x).style.height), width: parseFloat(/** @type {HTMLElement} */ (x).style.width) }));
    expect(d.length).toBe(4);
    expect(d[0]).toEqual({ top: 0, height: 56, width: window.innerWidth });
    expect(d[1].top).toBe(vh() - 92 - 220);                  // the dim resumes at the card (CARD_EST_H before ResizeObserver reports)
    expect(d[2].width).toBe(0); expect(d[3].width).toBe(0);
    // The column carries the card's height as scroll-padding, so read-along's band stays above the card.
    expect(/** @type {HTMLElement} */ (document.querySelector('.screen-scroll')).style.scrollPaddingBottom).toBe(Math.round(92 + 220) + 'px');
  });
});

/* THE DOCKED CARD IS OPAQUE, so "on screen" for a docked stop ends at its top edge.
   Found when 320x640 joined e2e-tour (2026-09-10): the Bible stop says "Press Listen" while its
   pill sits under the card at that frame. The pill was on screen by every measurement the overlay
   made — top >= 0, bottom <= innerHeight — and under the card to the reader. At 360x800 the same
   pill clears the card, which is why two viewports never saw it. */
describe('TourOverlay — a docked stop brings a target out from under its own card', () => {
  const vh = () => window.innerHeight;
  /** A letter screen whose Listen pill sits in the band a docked card owns, and a card that says so.
   *  jsdom measures nothing, so the CARD's rect is stubbed too: without it the overlay reads the
   *  card's top as 0, the guard below treats that as "no restriction", and this whole branch is
   *  unreachable — a case that could only ever print green. */
  const setUp = (pillTop) => {
    document.body.innerHTML = '<div id="app"><div class="screen-scroll" style="overflow-y:auto"><main class="letter-body">'
      + '<button class="hero-play-pill">Listen</button><p>Thus says The Lord…</p></main></div></div>';
    const scroller = /** @type {HTMLElement} */ (document.querySelector('.screen-scroll'));
    scroller.getBoundingClientRect = rect(0, 56, 360, vh() - 56);
    Object.defineProperty(scroller, 'scrollHeight', { value: 4000 });
    Object.defineProperty(scroller, 'clientHeight', { value: vh() - 56 });
    const pill = /** @type {HTMLElement} */ (document.querySelector('.hero-play-pill'));
    pill.getBoundingClientRect = rect(133, pillTop, 94, 25);
    const calls = [];
    // `opts` is `boolean | ScrollIntoViewOptions` in the DOM lib; the overlay always passes the
    // object form, and this reads the block off it without asserting that from the type.
    pill.scrollIntoView = (opts) => { calls.push(opts && typeof opts === 'object' ? opts.block : null); };
    return { pill, calls };
  };
  /** The docked card, occupying the bottom third — the band the reader cannot see through. */
  const stubCard = () => {
    const card = /** @type {HTMLElement} */ (document.querySelector('.tour-card'));
    card.getBoundingClientRect = rect(12, Math.round(vh() * 0.62), 336, Math.round(vh() * 0.38));
    return card;
  };

  it('scrolls a pill that is on screen but under the card to the top of its scroller', async () => {
    const { calls } = setUp(Math.round(vh() * 0.75));       // inside the viewport, inside the card's band
    startAt('listen');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    const card = stubCard();
    expect(card.classList.contains('docked')).toBe(true);
    // Past RESCROLL_EVERY_MS (300): the first tick's scroll is unconditional, a re-scroll is not.
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    // 'start', not 'center': centring in a viewport whose bottom the card owns can put the target
    // straight back underneath it. The first tick always scrolls (block null → 'center'), so this
    // asks whether a LATER tick, once the card has been measured, asked for 'start'.
    expect(calls).toContain('start');
  });

  /* CONTROL, and it is what stops the case above from being satisfied by "always scroll to start":
     the same docked stop with its pill high on the screen, clear of the card, is left alone. */
  it('leaves a pill that is already clear of the card where it is', async () => {
    const { calls } = setUp(120);                            // high, well above the docked card
    startAt('listen');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    stubCard();
    // Past RESCROLL_EVERY_MS (300): the first tick's scroll is unconditional, a re-scroll is not.
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    expect(calls).not.toContain('start');
  });
});

/* THE CONTROLLER CLEARS THE COLOUR WITHOUT AN OVERLAY, and until these two cases existed nothing
   said so: with an overlay mounted, its per-stop effect cleanup clears on the same events, so
   biting the controller's own clears reddened NOTHING. Two mechanisms, one witnessed. The overlay
   is always mounted while the tour runs, so this is defence in depth rather than a live path —
   which is exactly the kind of line that gets deleted later as dead. Driven with no overlay at all,
   so only the controller can be the thing that cleared it. */
describe('TourController — the demonstration is cleared by the controller itself', () => {
  const para = () => {
    document.body.innerHTML = '<main class="letter-body"><p class="letter-para" id="on">Thus says The Lord.</p></main>';
    const on = /** @type {HTMLElement} */ (document.querySelector('#on'));
    on.getBoundingClientRect = rect(24, 120, 312, 96);
    return on;
  };

  it('goTo takes it back on Next, with no overlay mounted', () => {
    const on = para();
    startAt('highlight');
    act(() => { TourController.next(); });               // paint
    expect(on.classList.contains('hl-mark')).toBe(true);
    act(() => { TourController.next(); });               // → scripture-web
    expect(TourController.getState().step.id).toBe('scripture-web');
    expect(on.classList.contains('hl-mark')).toBe(false);
    expect(document.querySelectorAll('.tour-hl-demo').length).toBe(0);
  });

  it('end takes it back on Skip, with no overlay mounted', () => {
    const on = para();
    startAt('highlight');
    act(() => { TourController.next(); });               // paint
    expect(on.classList.contains('hl-mark')).toBe(true);
    act(() => { TourController.skip(); });
    expect(TourController.getState().active).toBe(false);
    expect(on.classList.contains('hl-mark')).toBe(false);
    expect(document.querySelectorAll('.tour-hl-demo').length).toBe(0);
  });
});

/* The same rule, driven through the HIGHLIGHT stop. A bite proved this needed saying: reverting
   the effect-scope `docked` to press-only reddened nothing, because every case that exercises the
   dock floor uses the Listen stop — which is a press stop and stays docked either way. So the rule
   was witnessed and this stop's participation in it was not. */
describe('TourOverlay — the highlight stop obeys the dock floor too', () => {
  const vh = () => window.innerHeight;

  it('a paragraph sitting in the card’s band is scrolled to the top of its scroller', async () => {
    document.body.innerHTML = '<div id="app"><div class="screen-scroll" style="overflow-y:auto"><main class="letter-body">'
      + '<p class="letter-para" id="on">Thus says The Lord.</p></main></div></div>';
    const scroller = /** @type {HTMLElement} */ (document.querySelector('.screen-scroll'));
    scroller.getBoundingClientRect = rect(0, 56, 360, vh() - 56);
    Object.defineProperty(scroller, 'scrollHeight', { value: 4000 });
    Object.defineProperty(scroller, 'clientHeight', { value: vh() - 56 });
    const on = /** @type {HTMLElement} */ (document.querySelector('#on'));
    on.getBoundingClientRect = rect(24, Math.round(vh() * 0.72), 312, 90);   // low: inside the card's band
    const calls = [];
    on.scrollIntoView = (opts) => { calls.push(opts && typeof opts === 'object' ? opts.block : null); };
    startAt('highlight');
    render(<TourOverlay />, { container: document.body.appendChild(document.createElement('div')) });
    const card = /** @type {HTMLElement} */ (document.querySelector('.tour-card'));
    card.getBoundingClientRect = rect(12, Math.round(vh() * 0.62), 336, Math.round(vh() * 0.38));
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    expect(calls).toContain('start');
  });
});
