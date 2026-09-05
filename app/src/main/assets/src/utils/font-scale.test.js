/* font-scale — the one formula, and the legacy shape it has to resolve.
   ────────────────────────────────────────────────────────────────────
   `settings.fontScale` defaults to the string "1", so the stored data cannot
   distinguish "never opened Text Size" from "deliberately chose 100%".
   `fontScaleSource` names the winner. These cases pin the two rules that are
   easy to get wrong, both of which cost a reader something real:

   1. HYDRATION AND IMPORT DISAGREE about what absent means. At hydration,
      "1" with no source means nobody chose — defer to the phone. At import it
      means the reader exported at 100% — restore 100%. One function, one
      parameter; the same rule in both places would break one of them.

   2. AN UNKNOWN VALUE IS NOT 'system'. A corrupt or hand-edited source in a
      backup must not silently adopt the device scale — that is the same
      restore-that-did-not-restore failure in different clothes. */

import { describe, it, expect } from 'vitest';
import {
  normalizeFontScaleSource, clampFontScale, resolveFontScale,
  FONT_SCALE_MIN, FONT_SCALE_MAX,
} from './font-scale.js';

describe('normalizeFontScaleSource', () => {
  it('F1: a stored scale other than 1 is unambiguous evidence the slider was used', () => {
    expect(normalizeFontScaleSource({ fontScale: '1.3' }, 'system')).toBe('reader');
  });

  it('F2: at hydration, exactly 1 is ambiguous and resolves toward the phone', () => {
    expect(normalizeFontScaleSource({ fontScale: '1' }, 'system')).toBe('system');
  });

  /* The case the original proposal got wrong, and the one with a reader
     behind it: they exported at 100%, restore on a phone set to 2.0, and
     without this their text triples. A restore that did not restore. */
  it('F3: at IMPORT, exactly 1 means the reader chose 100% — restore it', () => {
    expect(normalizeFontScaleSource({ fontScale: '1' }, 'reader')).toBe('reader');
  });

  it('F4: an unknown value behaves as ABSENT, never as system', () => {
    expect(normalizeFontScaleSource({ fontScale: '1.4', fontScaleSource: 'garbage' }, 'system')).toBe('reader');
    // ...and at import the legacy default still wins, rather than the device.
    expect(normalizeFontScaleSource({ fontScale: '1', fontScaleSource: 'garbage' }, 'reader')).toBe('reader');
  });

  it('an explicit source is taken as written, whatever the event', () => {
    expect(normalizeFontScaleSource({ fontScale: '1.5', fontScaleSource: 'system' }, 'reader')).toBe('system');
    expect(normalizeFontScaleSource({ fontScale: '1', fontScaleSource: 'reader' }, 'system')).toBe('reader');
  });

  it('survives absent settings and a non-numeric scale', () => {
    expect(normalizeFontScaleSource(null, 'system')).toBe('system');
    expect(normalizeFontScaleSource({ fontScale: 'wat' }, 'system')).toBe('system');
    expect(normalizeFontScaleSource({}, 'reader')).toBe('reader');
  });
});

describe('clampFontScale', () => {
  it('clamps to the slider range rather than rejecting', () => {
    expect(clampFontScale('9')).toBe(FONT_SCALE_MAX);
    expect(clampFontScale('0.1')).toBe(FONT_SCALE_MIN);
    expect(clampFontScale('1.3')).toBe(1.3);
  });

  /* Not a throw and not a NaN. A NaN reaching --font-scale gives an
     unreadable app rather than a crash, which is worse: nobody reports it. */
  it('a non-numeric or absent value is 1', () => {
    expect(clampFontScale(undefined)).toBe(1);
    expect(clampFontScale('')).toBe(1);
    expect(clampFontScale('abc')).toBe(1);
    expect(clampFontScale(null)).toBe(1);
  });
});

describe('resolveFontScale', () => {
  it("F5: 'reader' uses the slider, 'system' uses the cached device scale, both clamped", () => {
    const s = { fontScale: '1.3', systemFontScale: '2.0' };
    expect(resolveFontScale(s, 'reader')).toBe(1.3);
    expect(resolveFontScale(s, 'system')).toBe(2);
    expect(resolveFontScale({ fontScale: '9', systemFontScale: '9' }, 'reader')).toBe(FONT_SCALE_MAX);
    expect(resolveFontScale({ fontScale: '0.1', systemFontScale: '0.1' }, 'system')).toBe(FONT_SCALE_MIN);
  });

  it('a reader choice beats a larger system scale', () => {
    expect(resolveFontScale({ fontScale: '1.5', systemFontScale: '2.0', fontScaleSource: 'reader' })).toBe(1.5);
  });

  it('no cached system scale renders at 1, not NaN — a fresh install before React has written one', () => {
    expect(resolveFontScale({ fontScale: '1', fontScaleSource: 'system' })).toBe(1);
  });

  /* The web build has no bridge, so React never writes a systemFontScale and
     every reader sees 1 unless they moved the slider. Unchanged behaviour, and
     asserted so a future default cannot quietly scale the PWA. */
  it('the web build (no cached system scale) is unaffected', () => {
    expect(resolveFontScale({ fontScale: '1' }, undefined)).toBe(1);
    expect(resolveFontScale({ fontScale: '1.15' })).toBe(1.15);
  });
});
