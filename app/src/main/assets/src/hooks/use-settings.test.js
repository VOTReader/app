/* useSettings — the settings container hook: defaults + migration merge,
   the body-class/CSS-var/PlatformBridge mirror effect, and the SEC-3
   font-scale clamp.
   ─────────────────────────────────────────────────────────────────────
   This hook is a trust boundary: settings are restorable wholesale from
   an imported .votbak, so every value must be treated as hostile. The
   clamp matrix below RED-proves the SEC-3 guard — reverting :199 to the
   old Math.min(1.6, …) cap, or dropping the Number.isFinite branch,
   fails it.
   PlatformBridge is mocked (native mirror is a call-contract assertion);
   the DOM side (body classes, #custom-fonts, CSS vars) is real jsdom. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../utils/platform-bridge.js', () => ({
  PlatformBridge: {
    setLightStatusBar: vi.fn(),
    setKeepScreenOn: vi.fn(),
  },
}));
import { PlatformBridge } from '../utils/platform-bridge.js';

// The hook reads GARDEN_DEFAULT_TIER as a bare window global (bundle-d).
/** @type {any} */ (globalThis).GARDEN_DEFAULT_TIER = 2;

import { useSettings, defaultFlipsFor } from './use-settings.js';

/** Render the hook with props, defaulting to a fresh first launch. */
function mount({ savedSettings = null, theme = 'dark' } = {}) {
  return renderHook(
    (props) => useSettings(props),
    { initialProps: { savedSettings, theme } }
  );
}

beforeEach(() => {
  // Fresh #custom-fonts style element per test — the effect flips .disabled.
  const style = document.createElement('style');
  style.id = 'custom-fonts';
  document.head.appendChild(style);
});

afterEach(() => {
  document.getElementById('custom-fonts')?.remove();
  document.body.className = '';
  document.documentElement.style.cssText = '';
  vi.clearAllMocks();
});

describe('useSettings — defaults + migration', () => {
  it('first launch (null saved) lands the documented defaults', () => {
    const { result } = mount();
    const s = result.current.settings;
    expect(s.markAsRead).toBe(true);
    expect(s.translation).toBe('nkjv');
    expect(s.fontStyle).toBe('classic');
    expect(s.fontScale).toBe('1');
    expect(s.arrowLayout).toBe('off');
    expect(s.autoScroll).toBe(false);
    expect(s.doubleTapFullscreen).toBe(true);
    expect(s.fullscreenHintCount).toBe(0);
    expect(s.gardenTier).toBe(2); // GARDEN_DEFAULT_TIER global
    // Corbin, 2026-09-10: the dice and the reading marker are on out of the box.
    expect(s.showReadingDot).toBe(true);
    expect(s.showSurpriseButton).toBe(true);
    expect(s.autoScrollNext).toBe(true);
  });

  it('saved settings override defaults', () => {
    const { result } = mount({ savedSettings: { translation: 'kjv', haptic: false } });
    expect(result.current.settings.translation).toBe('kjv');
    expect(result.current.settings.haptic).toBe(false);
    // untouched defaults survive
    expect(result.current.settings.markAsRead).toBe(true);
  });

  it('migrates old showChrome:false into both new masters', () => {
    const { result } = mount({ savedSettings: { showChrome: false } });
    expect(result.current.settings.showChapterTitle).toBe(false);
    expect(result.current.settings.showSectionHeadings).toBe(false);
  });

  it('showChrome:true migrates nothing (only the false case carries intent)', () => {
    const { result } = mount({ savedSettings: { showChrome: true } });
    expect(result.current.settings.showChapterTitle).toBe(true);
    expect(result.current.settings.showSectionHeadings).toBe(true);
  });

  it('migrates old showChapterSummary:false and the migration WINS over a stale saved value', () => {
    const { result } = mount({
      savedSettings: { showChapterSummary: false, showChapterTitle: true },
    });
    // ...migrated spread comes after ...savedS
    expect(result.current.settings.showChapterTitle).toBe(false);
  });
});

describe('useSettings — mutators', () => {
  it('toggleSetting flips a boolean; updateSetting sets a value', () => {
    const { result } = mount();
    act(() => result.current.toggleSetting('haptic'));
    expect(result.current.settings.haptic).toBe(false);
    act(() => result.current.updateSetting('arrowLayout', 'split'));
    expect(result.current.settings.arrowLayout).toBe('split');
  });
});

describe('useSettings — body-class mirror', () => {
  const cls = () => document.body.classList;

  it('theme drives .light and re-renders track it', () => {
    const { rerender } = mount({ theme: 'dark' });
    expect(cls().contains('light')).toBe(false);
    rerender({ savedSettings: null, theme: 'light' });
    expect(cls().contains('light')).toBe(true);
  });

  it('TOMBSTONE: .amoled is never applied — True Black IS the dark theme (owner call 2026-08-03)', () => {
    // The [10] trueBlack modifier was retired: pure-black surfaces are the
    // dark theme's own tokens now. A persisted trueBlack key must be an
    // ignored orphan — no body class, ever.
    mount({ savedSettings: { trueBlack: true }, theme: 'dark' });
    expect(cls().contains('amoled')).toBe(false);
  });

  it('feature-off flags map to their no-* classes', () => {
    mount({
      savedSettings: {
        showSettingsGear: false, searchEnabled: false, historyEnabled: false,
        showBookmarkNav: false, showThemeBtn: false,
      },
    });
    for (const c of ['no-gear', 'no-search', 'no-history', 'no-bookmark-nav', 'no-theme-nav']) {
      expect(cls().contains(c)).toBe(true);
    }
  });

  it('arrowLayout maps to exactly one arrows-* class', () => {
    for (const layout of ['right', 'left', 'nav', 'off']) {
      document.body.className = '';
      const { unmount } = mount({ savedSettings: { arrowLayout: layout } });
      const on = ['arrows-right', 'arrows-left', 'arrows-nav', 'arrows-off']
        .filter((c) => cls().contains(c));
      expect(on).toEqual([`arrows-${layout}`]);
      unmount();
    }
  });
});

describe('useSettings — SEC-3 font-scale clamp (hostile .votbak values)', () => {
  const scaleVar = () => document.documentElement.style.getPropertyValue('--font-scale');

  it.each([
    ['1',    '1'],    // default
    ['1.5',  '1.5'],  // legacy 4-step value passes through
    ['2.5',  '2.5'],  // 300%-era in-range value
    ['3',    '3'],    // cap value exact
    ['9',    '3'],    // over cap clamps DOWN (RED: Math.min(1.6,…) fails here)
    ['0.5',  '0.8'],  // under floor clamps UP
    ['-2',   '0.8'],  // negative clamps to floor
    ['abc',  '1'],    // NaN degrades to 1 (RED: dropping isFinite fails here)
    ['',     '1'],    // empty string degrades to 1
  ])('fontScale %j lands --font-scale %j', (input, expected) => {
    mount({ savedSettings: { fontScale: input } });
    expect(scaleVar()).toBe(expected);
  });

  it('Infinity degrades to 1 (isFinite branch, not just NaN)', () => {
    mount({ savedSettings: { fontScale: 'Infinity' } });
    expect(scaleVar()).toBe('1');
  });
});

describe('useSettings — reading-font routing', () => {
  const fontsEl = () => /** @type {HTMLStyleElement} */ (document.getElementById('custom-fonts'));
  const bodyVar = () => document.documentElement.style.getPropertyValue('--font-body');

  it('classic disables the #custom-fonts block (system-serif look)', () => {
    mount({ savedSettings: { fontStyle: 'classic' } });
    expect(fontsEl().disabled).toBe(true);
  });

  it('a registry font enables the block and routes --font-body', () => {
    mount({ savedSettings: { fontStyle: 'cardo' } });
    expect(fontsEl().disabled).toBe(false);
    expect(bodyVar()).toContain('Cardo');
  });

  it('an unknown id (newer-version backup) degrades to the classic look, default stack', () => {
    mount({ savedSettings: { fontStyle: 'font-from-the-future' } });
    expect(fontsEl().disabled).toBe(true);
    expect(bodyVar()).toContain('EB Garamond'); // readingFontCss fallback
  });
});

describe('useSettings — PlatformBridge mirror', () => {
  it('light theme → setLightStatusBar(true); dark → false', () => {
    mount({ theme: 'light' });
    expect(PlatformBridge.setLightStatusBar).toHaveBeenLastCalledWith(true);
    mount({ theme: 'dark' });
    expect(PlatformBridge.setLightStatusBar).toHaveBeenLastCalledWith(false);
  });

  it('keepScreenOn defaults on; only an explicit false turns it off', () => {
    mount();
    expect(PlatformBridge.setKeepScreenOn).toHaveBeenLastCalledWith(true);
    mount({ savedSettings: { keepScreenOn: false } });
    expect(PlatformBridge.setKeepScreenOn).toHaveBeenLastCalledWith(false);
  });
});

/* THE 2026-09-10 DEFAULT FLIPS ARE A MIGRATION, NOT A NEW LITERAL (Corbin: "make surprise me
   dice button and reading dot on by default"). A default that changes in the defaults block
   reaches nobody who has opened the app before: the first boot persists the WHOLE merged
   settings object into vot-state (use-persisted-state.js, prev === null → immediate write), and
   `...savedS` puts those bytes back over any new default on every boot after. So every existing
   profile carries showSurpriseButton:false as a SAVED value whether or not the reader ever
   touched it. The flip therefore runs as a round keyed on `defaultsRev`: a key still at its OLD
   default that the reader never set (`touched`) takes the new one, once; an explicit choice is
   never overwritten. Nothing recorded `touched` before tonight, so for older profiles "switched
   off" and "never touched" are the same bytes and both flip — stated, not hidden. */
describe('useSettings — the 2026-09-10 default flips reach every profile that never chose', () => {
  const FLIPPED = { showSurpriseButton: true, showReadingDot: true, autoScrollNext: true };

  it('a fresh profile reads the dice, the reading marker and Auto-Continue ON, stamped with the round', () => {
    const s = mount().result.current.settings;
    for (const [k, v] of Object.entries(FLIPPED)) expect(s[k], k).toBe(v);
    expect(s.defaultsRev).toBe(1);
    expect(s.touched).toEqual({});
  });

  it('a profile saved before tonight, still carrying the OLD defaults, is flipped once and stamped; nothing else moves', () => {
    const s = mount({ savedSettings: { showSurpriseButton: false, showReadingDot: false, autoScrollNext: false, translation: 'kjv', autoScroll: false } }).result.current.settings;
    for (const [k, v] of Object.entries(FLIPPED)) expect(s[k], k).toBe(v);
    expect(s.defaultsRev).toBe(1);
    expect(s.translation).toBe('kjv');
    expect(s.autoScroll).toBe(false);
  });

  it('a key the old profile never wrote flips too — absence is the old default', () => {
    const s = mount({ savedSettings: { translation: 'kjv' } }).result.current.settings;
    expect(s.showSurpriseButton).toBe(true);
    expect(s.showReadingDot).toBe(true);
  });

  it("an OFF the reader chose (touched) keeps OFF across the flip; the untouched sibling still flips", () => {
    const s = mount({ savedSettings: { showSurpriseButton: false, showReadingDot: false, touched: { showSurpriseButton: true } } }).result.current.settings;
    expect(s.showSurpriseButton).toBe(false);
    expect(s.showReadingDot).toBe(true);
    expect(s.touched).toEqual({ showSurpriseButton: true });
  });

  /* The next two are green on the code BEFORE the flip (nothing flips, so nothing over-flips);
     they exist to go red if a round ever ignores the stamp or rewrites a value already at the
     new default. Their teeth are the bite, not the RED. */
  it('the round runs once: a stamped profile is never re-flipped, touched record or not', () => {
    const s = mount({ savedSettings: { defaultsRev: 1, showSurpriseButton: false } }).result.current.settings;
    expect(s.showSurpriseButton).toBe(false);
    expect(s.defaultsRev).toBe(1);
  });

  it('a profile already at the NEW value is left exactly as it is', () => {
    const s = mount({ savedSettings: { showSurpriseButton: true, showReadingDot: true, autoScrollNext: true } }).result.current.settings;
    expect(s.showSurpriseButton).toBe(true);
    expect(s.showReadingDot).toBe(true);
    expect(s.autoScrollNext).toBe(true);
  });

  it("toggleSetting and updateSetting record the key as the reader's own choice", () => {
    const { result } = mount();
    act(() => result.current.toggleSetting('showSurpriseButton'));
    act(() => result.current.updateSetting('arrowLayout', 'split'));
    expect(result.current.settings.showSurpriseButton).toBe(false);
    expect(result.current.settings.touched).toEqual({ showSurpriseButton: true, arrowLayout: true });
  });

  /* Round 1 is all booleans, and for a boolean "still at its old default" and "not already at
     the new one" are the same test — a bite that drops the old-default clause survives every
     case above (B7, 2026-09-10). The clause is for the round that flips a SELECT: a profile
     from before the touched record that chose a third value must keep it. Witnessed here on the
     pure rule with a synthetic round, since no shipped round can show it. */
  it('a pre-round choice that is neither the old nor the new default is never touched (a select round)', () => {
    const round = [{ arrowLayout: ['off', 'nav'] }];
    expect(defaultFlipsFor({ arrowLayout: 'split' }, round)).toEqual({ defaultsRev: 1 });
    expect(defaultFlipsFor({ arrowLayout: 'off' }, round)).toEqual({ arrowLayout: 'nav', defaultsRev: 1 });
    expect(defaultFlipsFor({}, round)).toEqual({ arrowLayout: 'nav', defaultsRev: 1 });
    expect(defaultFlipsFor({ arrowLayout: 'off', touched: { arrowLayout: true } }, round)).toEqual({ defaultsRev: 1 });
    expect(defaultFlipsFor({ arrowLayout: 'off', defaultsRev: 1 }, round)).toEqual({ defaultsRev: 1 });
  });

  it('flipped, switched off by the reader, saved, booted again: still off, and the sibling still on', () => {
    const first = mount();
    act(() => first.result.current.toggleSetting('showSurpriseButton'));
    // What vot-state carries between the two boots — a JSON round trip, as IDB's structured clone is.
    const saved = JSON.parse(JSON.stringify(first.result.current.settings));
    const s = mount({ savedSettings: saved }).result.current.settings;
    expect(s.showSurpriseButton).toBe(false);
    expect(s.showReadingDot).toBe(true);
    expect(s.defaultsRev).toBe(1);
  });
});
