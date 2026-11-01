// @ts-nocheck — test-only (vitest)
/* SleepSheet's preset chips (#59's console-clean, found in the audio player): preset.map((m) => chip(...))
   rendered its four chips with no key, and React said so ("Each child in a list should have a unique key
   prop. Check the render method of SleepSheet"). Its own file: React says a key warning once per component
   per module load, so a case after another that rendered the sheet would pass for the wrong reason. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { SleepSheet } from './PlayerSheets.jsx';

// PlayerSheet portals through the ReactDOM global, as the bundle hands it over
beforeEach(() => { globalThis.ReactDOM = ReactDOM; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete globalThis.ReactDOM; });

describe('SleepSheet', () => {
  it('renders its chips with keys: React reports no missing key', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const state = { sleepEndsAt: 0, sleepMinutes: 0, sleepAtTrackEnd: false, sleepAtQueueEnd: false };
    render(<SleepSheet state={state} noun="letter" onClose={() => {}} />);
    expect(document.querySelectorAll('.np-sleep-sheet .np-grid button').length, 'PRECONDITION: the chips rendered').toBe(8);
    const keyWarnings = err.mock.calls.filter((c) => c.some((a) => typeof a === 'string' && /unique "key" prop/.test(a)));
    expect(keyWarnings).toEqual([]);
  });
});
