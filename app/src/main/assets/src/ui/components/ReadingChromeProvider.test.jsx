// @ts-nocheck — free-var globals stubbed; only render-affecting props passed
/* ReadingChromeProvider — the config boundary for the floating reading chrome.
   ─────────────────────────────────────────────────────────────────
   App owns the settings; the reading dot and the auto-scroll pill consume
   them through here. Everything the pill trusts is clamped at this seam, so
   a corrupt or out-of-range persisted value (a hand-edited backup, a older
   build's preset, a stray string) can never reach the transport. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ReadingChromeProvider, clampEndDwell } from './ReadingChromeProvider.jsx';
import { AutoScrollContext } from './AutoScrollControl.jsx';

let seen;
const Probe = () => { seen = React.useContext(AutoScrollContext); return null; };

beforeEach(() => { seen = null; });
afterEach(() => cleanup());

const provide = (settings) => render(
  <ReadingChromeProvider screen="bible-ch" dotEnabled={false} onGo={() => {}} settings={settings} updateSetting={() => {}}>
    <Probe />
  </ReadingChromeProvider>
);

describe('clampEndDwell', () => {
  it('accepts the whole slider range, including no pause at all', () => {
    expect(clampEndDwell(0)).toBe(0);
    expect(clampEndDwell(2500)).toBe(2500);
    expect(clampEndDwell(15000)).toBe(15000);
  });

  it('keeps every legacy preset value valid', () => {
    // The dwell shipped as a 4-option select before it became a slider; those
    // stored values must survive the upgrade untouched.
    for (const v of ['1500', '2500', '4000', '6000']) {
      expect(clampEndDwell(v)).toBe(parseInt(v, 10));
    }
  });

  it('clamps out-of-range and falls back on junk', () => {
    expect(clampEndDwell(-5000)).toBe(0);
    expect(clampEndDwell(999999)).toBe(15000);
    expect(clampEndDwell('abc')).toBe(2500);
    expect(clampEndDwell(undefined)).toBe(2500);
  });
});

describe('auto-scroll config handed to the pill', () => {
  it('passes the reader’s settings through, clamped', () => {
    provide({ autoScroll: true, autoScrollLpm: '22', autoScrollNext: true, autoScrollEndMs: '4000' });
    expect(seen.enabled).toBe(true);
    expect(seen.speedLpm).toBe(22);
    expect(seen.autoNext).toBe(true);
    expect(seen.endDwellMs).toBe(4000);
  });

  it('clamps a corrupt persisted speed rather than handing it to the transport', () => {
    provide({ autoScroll: true, autoScrollLpm: '9999', autoScrollEndMs: '-1' });
    expect(seen.speedLpm).toBe(40);
    expect(seen.endDwellMs).toBe(0);
  });

  it('defaults to OFF with sane values when nothing is persisted', () => {
    provide({});
    expect(seen.enabled).toBe(false);
    expect(seen.speedLpm).toBe(16);
    expect(seen.autoNext).toBe(false);
    expect(seen.endDwellMs).toBe(2500);
  });

  it('survives a missing settings object entirely', () => {
    expect(() => provide(null)).not.toThrow();
    expect(seen.enabled).toBe(false);
  });

  it('treats keepScreenOn as opt-OUT so the wake lock release restores the user’s own preference', () => {
    provide({ autoScroll: true });
    expect(seen.keepScreenOnPref).toBe(true);
    provide({ autoScroll: true, keepScreenOn: false });
    expect(seen.keepScreenOnPref).toBe(false);
  });
});
