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

const startAt = (id) => {
  TourController.attachNav(nav());
  TourController.start('prompt');
  // A Listen stop stays once pressed, so walk by id rather than by count.
  for (let i = 0; i < 12 && TourController.getState().step.id !== id; i++) TourController.targetPressed();
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
    document.body.innerHTML = '<div id="app"><button class="hero-play-pill">Listen</button></div>';
    const pill = document.querySelector('.hero-play-pill');
    pill.getBoundingClientRect = rect(60, vh() + 120, 94, 25);      // below the fold, as Export was
    startAt('listen');
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
