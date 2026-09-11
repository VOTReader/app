/* SettingsScreen — the Help note counts the tour's stops from the tour, not by hand.
   ─────────────────────────────────────────────────────────────────────────
   RED 2026-09-10 (settings-builder). "A short tour of the app: seven stops" was typed into this
   screen, a bundle away from the array it counts, and it was one of four such sentences (the
   Home strip said "six" the same night). The note now reads the word the steps module publishes
   through TourController — the only handle this classic-globals screen has on bundle-b — and
   says "a few" when no controller is on the page, because a number the page cannot read is a
   number it must not state. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { setupSettingsGlobals, teardownSettingsGlobals, renderSettings } from './settings-harness.jsx';
import { TourController } from '../../utils/tour-controller.js';
import { TOUR_STOPS_WORD } from '../../utils/tour-steps.js';

const note = () => /** @type {HTMLElement} */ (document.querySelector('.settings-help-note')).textContent;

beforeEach(() => { setupSettingsGlobals(); });
afterEach(() => { cleanup(); delete /** @type {any} */ (globalThis).TourController; teardownSettingsGlobals(); });

describe('SettingsScreen — the Help note counts the stops the tour actually has', () => {
  it('reads the count from the tour when the controller is on the page', () => {
    /** @type {any} */ (globalThis).TourController = TourController;
    renderSettings();
    expect(note()).toContain(`${TOUR_STOPS_WORD} stops, about two minutes`);
  });

  it('states no number at all when there is no controller to ask', () => {
    renderSettings();
    expect(note()).toContain('a few stops, about two minutes');
    expect(note()).not.toMatch(/\b(five|six|seven|eight|nine|ten) stops\b/);
  });
});
