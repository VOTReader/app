/* A group screen is one group (PL-SETTINGS 1): the tour's stops and "Open Your Data" swap the screen,
   they never stack a second group under the first one's title. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, act } from '@testing-library/react';
import { setupSettingsGlobals, teardownSettingsGlobals, renderSettings } from './settings-harness.jsx';
import { openYourData } from '../../utils/your-data-link.js';

const openIds = () => [...document.querySelectorAll('[data-settings-group].open')].map((s) => s.getAttribute('data-settings-group'));

/** A tour whose current stop the test sets. */
function fakeTour() {
  let step = null; let v = 0; const subs = new Set();
  return {
    subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); },
    getVersion: () => v,
    getState: () => ({ active: !!step, step }),
    stopsWord: () => 'a few', minutesWord: () => 'a few', start: () => {},
    at(group) { step = group ? { settingsGroup: group } : null; v++; subs.forEach((cb) => cb()); },
  };
}

beforeEach(() => { setupSettingsGlobals(); });
afterEach(() => {
  cleanup(); delete /** @type {any} */ (globalThis).TourController; delete (/** @type {any} */ (window)).__votOpenYourData;
  teardownSettingsGlobals();
});

describe('Settings shows one group screen at a time', () => {
  it('the tour moving from the backup stop to the settings stop swaps Your data for Reading', () => {
    const tour = fakeTour();
    /** @type {any} */ (globalThis).TourController = tour;
    act(() => { tour.at('data'); });
    renderSettings({}, {}, { expandGroups: false });
    expect(openIds()).toEqual(['data']);
    act(() => { tour.at('reading'); });
    expect(openIds()).toEqual(['reading']);
  });

  it('Open Your Data on another group screen swaps to Your data', () => {
    renderSettings({}, { initialGroups: ['reading'] });
    expect(openIds()).toEqual(['reading']);
    act(() => { openYourData(); });
    expect(openIds()).toEqual(['data']);
  });
});
