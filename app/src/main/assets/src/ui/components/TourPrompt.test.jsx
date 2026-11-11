/* TourPrompt — the "New here?" offer. Since the UI pass (U §4, 2026-11-11) it is an inline card at the end of the
   Read tab, in the page's flow: it never floats over a reader, a menu or a sheet (the old strip was fixed over the
   foot of Home and the first letter, and had to pad the scroller by its measured height). */
import 'fake-indexeddb/auto'; // the stores' real IDB write path, so no 'IndexedDB is not available' write failures (console-clean)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { TourPrompt } from './TourPrompt.jsx';
import { TourController } from '../../utils/tour-controller.js';
import * as steps from '../../utils/tour-steps.js';   // TOUR_MINUTES_WORD read off the module so this file loads on the base tree
import { AboutSeenFlagStore, TourDoneFlagStore } from '../../stores/app-flag-stores.js';

beforeEach(() => {
  localStorage.clear();
  AboutSeenFlagStore._resetForTests({ forceLoaded: true });
  TourDoneFlagStore._resetForTests({ forceLoaded: true });
  TourController._resetForTests();
  /** @type {any} */ (globalThis).TourController = TourController;
  /** @type {any} */ (globalThis).AboutSeenFlagStore = AboutSeenFlagStore;
  /** @type {any} */ (globalThis).TourDoneFlagStore = TourDoneFlagStore;
  AboutSeenFlagStore.set();
  document.body.className = '';
  document.documentElement.style.removeProperty('--tour-prompt-h');
});
afterEach(() => { cleanup(); });

describe('TourPrompt — an inline card at the end of the Read tab (the UI pass, U §4)', () => {
  it('shows on Home in the page flow: no float, no body class, no padding of the scroller', () => {
    const { container } = render(<TourPrompt screen="home" />);
    const card = container.querySelector('.tour-prompt');
    expect(card).toBeTruthy();
    expect(card.classList.contains('tour-inline')).toBe(true);
    expect(document.body.classList.contains('tour-prompt-open')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--tour-prompt-h')).toBe('');
  });

  it('leaves on Maybe later', () => {
    render(<TourPrompt screen="home" />);
    act(() => { TourController.dismissPrompt('later'); });
    expect(document.querySelector('.tour-prompt')).toBeNull();
  });

  it('shows nowhere off Home', () => {
    render(<TourPrompt screen="settings" />);
    expect(document.querySelector('.tour-prompt')).toBeNull();
  });

  /* RED 2026-09-10: the strip said "six short stops" after the highlight stop made the tour seven, the
     count hand-written a bundle away from the array it counts. The one-row strip (n115) names only the
     minutes, and reads them from the steps module through the controller, never typed here. */
  it('names the minutes the tour actually takes', () => {
    render(<TourPrompt screen="home" />);
    const text = document.querySelector('.tour-prompt-text').textContent;
    const stops = steps.TOUR_STOPS_WORD.charAt(0).toUpperCase() + steps.TOUR_STOPS_WORD.slice(1);
    expect(text).toBe(`Let me show you around${stops} short stops, about ${steps.TOUR_MINUTES_WORD} minutes.`);
  });

  /* n115/n351 (A07.6): the 215 px card is one slim row: words, Show me around, Later, and ×, which
     still means "Don't show this again" by name. */
  it('is one row: Show me around starts the tour, Later snoozes, × never again', () => {
    const { container, getByRole } = render(<TourPrompt screen="home" />);
    const strip = container.querySelector('.tour-prompt');
    expect(strip.querySelector('h2')).toBeNull();
    expect([...strip.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.textContent))
      .toEqual(['Show me around', 'Maybe later', 'Don’t show this again']);
    expect(getByRole('button', { name: 'Maybe later' }).textContent).toBe('Maybe later');
    act(() => { getByRole('button', { name: 'Don’t show this again' }).click(); });
    expect(TourDoneFlagStore.is()).toBe(true);
    expect(document.querySelector('.tour-prompt')).toBeNull();
  });

  it('never shows over a reader, the first letter included (it used to, n114)', () => {
    const first = TourController.firstLetter();
    render(<TourPrompt screen={first.screen} letterId={first.id} />);
    expect(document.querySelector('.tour-prompt')).toBeNull();
  });
});
