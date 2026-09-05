/* TourPrompt — the "New here?" strip at the foot of Home declares the room it takes.
   RED first (review-tutorial, 2026-09-04): on a 699 px phone the strip covered the last Home tile
   (Settings) and nothing could scroll it clear. Like the player bar, the strip marks the body while
   it is up and publishes its measured height, and app.css pads .screen-scroll by that much. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { TourPrompt } from './TourPrompt.jsx';
import { TourController } from '../../utils/tour-controller.js';
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

describe('TourPrompt — the strip declares the room it takes', () => {
  it('marks the body and publishes its height while it is up on Home', () => {
    const { container } = render(<TourPrompt screen="home" />);
    expect(container.querySelector('.tour-prompt')).toBeTruthy();
    expect(document.body.classList.contains('tour-prompt-open')).toBe(true);
  });

  it('measures into --tour-prompt-h when it has a height, and clears everything when it goes', () => {
    const real = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () { return this.classList && this.classList.contains('tour-prompt') ? /** @type {any} */ ({ height: 172, width: 336, top: 0, left: 0, right: 336, bottom: 172, x: 0, y: 0 }) : real.call(this); };
    try {
      render(<TourPrompt screen="home" />);
      expect(document.documentElement.style.getPropertyValue('--tour-prompt-h')).toBe('172px');
      expect(document.body.classList.contains('tour-prompt-open')).toBe(true);
      act(() => { TourController.dismissPrompt('later'); });        // Maybe later: the strip leaves
      expect(document.querySelector('.tour-prompt')).toBeNull();
      expect(document.body.classList.contains('tour-prompt-open')).toBe(false);
      expect(document.documentElement.style.getPropertyValue('--tour-prompt-h')).toBe('');
    } finally { HTMLElement.prototype.getBoundingClientRect = real; }
  });

  it('marks nothing off Home', () => {
    render(<TourPrompt screen="settings" />);
    expect(document.querySelector('.tour-prompt')).toBeNull();
    expect(document.body.classList.contains('tour-prompt-open')).toBe(false);
  });
});
