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
import { renderHook, render, act } from '@testing-library/react';

vi.mock('../utils/platform-bridge.js', () => ({
  PlatformBridge: {
    setLightStatusBar: vi.fn(),
    setKeepScreenOn: vi.fn(),
  },
}));
import { PlatformBridge } from '../utils/platform-bridge.js';

// The hook reads GARDEN_DEFAULT_TIER as a bare window global (bundle-d).
/** @type {any} */ (globalThis).GARDEN_DEFAULT_TIER = 2;

import { useSettings, defaultFlipsFor, legacyChromeFor, RETIRED_SETTINGS } from './use-settings.js';

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
    const { result } = mount({ savedSettings: { translation: 'kjv', keepScreenOn: false } });
    expect(result.current.settings.translation).toBe('kjv');
    expect(result.current.settings.keepScreenOn).toBe(false);
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

  it('migrates old showChapterSummary:false into showChapterTitle (a profile that never chose it)', () => {
    const { result } = mount({
      savedSettings: { showChapterSummary: false, showChapterTitle: true },
    });
    expect(result.current.settings.showChapterTitle).toBe(false);
  });
});

/* Settings hunt (2026-11-04): the two legacy chrome keys were translated on EVERY boot and never removed.
   The first boot persists the whole merged settings object, legacy key included, so `...migrated` put
   Chapter Titles and Section Headings back off at each reload: a reader whose old profile had
   showChrome:false could turn them on and see them gone again after the next launch. */
describe('useSettings — the legacy chrome keys translate once', () => {
  /** One launch: mount on what the last launch saved, let the reader act, return what this one saves. */
  function launch(saved, act_ = null) {
    const { result, unmount } = mount({ savedSettings: saved });
    if (act_) act(() => act_(result.current));
    const persisted = JSON.parse(JSON.stringify(result.current.settings));
    unmount();
    return persisted;
  }

  it('Chapter Titles and Section Headings turned back on stay on across a reload (showChrome:false profile)', () => {
    const first = launch({ showChrome: false });
    expect(first.showChapterTitle).toBe(false);
    expect(first.showSectionHeadings).toBe(false);
    const second = launch(first, (r) => { r.toggleSetting('showChapterTitle'); r.toggleSetting('showSectionHeadings'); });
    expect(second.showChapterTitle).toBe(true);
    const third = launch(second);
    expect(third.showChapterTitle).toBe(true);
    expect(third.showSectionHeadings).toBe(true);
  });

  it('Chapter Titles turned back on stays on across a reload (showChapterSummary:false profile)', () => {
    const first = launch({ showChapterSummary: false });
    expect(first.showChapterTitle).toBe(false);
    const second = launch(first, (r) => r.toggleSetting('showChapterTitle'));
    expect(launch(second).showChapterTitle).toBe(true);
  });

  it('a key the reader set themselves is never overwritten by a legacy key still in the profile', () => {
    const s = launch({ showChrome: false, showChapterTitle: true, showSectionHeadings: true,
      touched: { showChapterTitle: true, showSectionHeadings: true } });
    expect(s.showChapterTitle).toBe(true);
    expect(s.showSectionHeadings).toBe(true);
  });

  it('the legacy keys leave the profile once translated', () => {
    const s = launch({ showChrome: false, showChapterSummary: false });
    expect('showChrome' in s).toBe(false);
    expect('showChapterSummary' in s).toBe(false);
  });

  it('legacyChromeFor: only the false case carries intent, and touched keys are the reader\'s', () => {
    expect(legacyChromeFor({})).toEqual({});
    expect(legacyChromeFor({ showChrome: true, showChapterSummary: true })).toEqual({});
    expect(legacyChromeFor({ showChrome: false })).toEqual({ showChapterTitle: false, showSectionHeadings: false });
    expect(legacyChromeFor({ showChapterSummary: false })).toEqual({ showChapterTitle: false });
    expect(legacyChromeFor({ showChrome: false, touched: { showSectionHeadings: true } })).toEqual({ showChapterTitle: false });
  });
});

/* Settings hunt (2026-11-04): keys no code reads any more used to ride in every profile forever. */
describe('useSettings — retired keys leave the profile', () => {
  it.each(RETIRED_SETTINGS.map((k) => [k]))('%s is dropped as the settings load', (key) => {
    const { result } = mount({ savedSettings: { [key]: true, translation: 'kjv' } });
    expect(key in result.current.settings).toBe(false);
    expect(result.current.settings.translation).toBe('kjv');
  });

  it('a first launch saves no retired key (haptic was a default nothing read)', () => {
    const { result } = mount();
    for (const key of RETIRED_SETTINGS) expect(key in result.current.settings).toBe(false);
  });

  it('no retired key is a live default or the name of a settings row', () => {
    const { result } = mount();
    const live = new Set(Object.keys(result.current.settings));
    expect(RETIRED_SETTINGS.filter((k) => live.has(k))).toEqual([]);
  });
});

describe('useSettings — mutators', () => {
  it('toggleSetting flips a boolean; updateSetting sets a value', () => {
    const { result } = mount();
    act(() => result.current.toggleSetting('keepScreenOn'));
    expect(result.current.settings.keepScreenOn).toBe(false);
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

  /* The compact top bar (the redesign, 2026-09-25): a NEW key, so a profile saved before it
     existed (every settings key but this one present) still gets the calmer bar, and only an
     explicit false brings the old icon row back. */
  it('compactTopBar is on for a profile saved before it existed, and off only when set off', () => {
    document.body.className = '';
    const { unmount } = mount({ savedSettings: { showSettingsGear: true, historyInNav: true, showThemeBtn: true } });
    expect(cls().contains('compact-topbar')).toBe(true);
    unmount();
    document.body.className = '';
    mount({ savedSettings: { compactTopBar: false } });
    expect(cls().contains('compact-topbar')).toBe(false);
  });

  /* Settings hunt (2026-11-04): the mirror ran as a PASSIVE effect, i.e. after the App's first paint.
     The body classes decide what that paint shows: the compact bar hides three icons only through
     body.compact-topbar, `body:not(.arrows-nav):not(.arrows-off) .letter-body` adds 4rem of padding,
     vot-large-text re-lays the large sizes. So each launch painted the default bar and arrows first,
     and the scroll restore (a layout effect later in App) measured that wrong page. Probe: a layout
     effect after useSettings in the same component, which runs before any passive effect. */
  it('the classes are on before the first paint (a later layout effect already sees them)', () => {
    /** @type {Record<string, boolean>} */ const seen = {};
    function Probe() {
      useSettings({ savedSettings: { arrowLayout: 'off', fontScale: '2', showScrollNotch: true }, theme: 'light' });
      React.useLayoutEffect(() => {
        seen.compact = cls().contains('compact-topbar');
        seen.arrowsOff = cls().contains('arrows-off');
        seen.notch = cls().contains('scroll-notch');
        seen.light = cls().contains('light');
        seen.large = document.documentElement.classList.contains('vot-large-text');
        seen.scale = document.documentElement.style.getPropertyValue('--font-scale') === '2';
      }, []);
      return null;
    }
    render(React.createElement(Probe));
    expect(seen).toEqual({ compact: true, arrowsOff: true, notch: true, light: true, large: true, scale: true });
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

  it.each([['1.7', false], ['1.8', true], ['3', true], ['9', true], ['abc', false]])(
    'fontScale %j sets the large-text root class: %j (J-w3g1.1)', (input, on) => {
      mount({ savedSettings: { fontScale: input } });
      expect(document.documentElement.classList.contains('vot-large-text')).toBe(on);
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
/** How many default-flip rounds have shipped: a booted profile is stamped with it. */
const ROUNDS = 2;

describe('useSettings — the 2026-09-10 default flips reach every profile that never chose', () => {
  const FLIPPED = { showSurpriseButton: true, showReadingDot: true, autoScrollNext: true };

  it('a fresh profile reads the dice, the reading marker and Auto-Continue ON, stamped with the round', () => {
    const s = mount().result.current.settings;
    for (const [k, v] of Object.entries(FLIPPED)) expect(s[k], k).toBe(v);
    expect(s.defaultsRev).toBe(ROUNDS);
    expect(s.touched).toEqual({});
  });

  it('a profile saved before tonight, still carrying the OLD defaults, is flipped once and stamped; nothing else moves', () => {
    const s = mount({ savedSettings: { showSurpriseButton: false, showReadingDot: false, autoScrollNext: false, translation: 'kjv', autoScroll: false } }).result.current.settings;
    for (const [k, v] of Object.entries(FLIPPED)) expect(s[k], k).toBe(v);
    expect(s.defaultsRev).toBe(ROUNDS);
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
    expect(s.defaultsRev).toBe(ROUNDS);
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
    expect(s.defaultsRev).toBe(ROUNDS);
  });
});

/* Round 2 (share-fn, Corbin 2026-10-25: "Make the share settings in VOTReader share the website
   link the default one"). Share Includes was 'app' for everyone since cp3 (09-27) and every
   profile saved it; it moves to 'site' unless the reader picked App Link (touched). */
describe('useSettings — the 2026-10-25 flip makes the website link the default for Share', () => {
  it('a fresh profile shares the website link', () => {
    expect(mount().result.current.settings.shareLink).toBe('site');
  });
  it('a saved profile still at the old default (app, never chosen) moves to the website link, once', () => {
    const s = mount({ savedSettings: { shareLink: 'app', defaultsRev: 1, translation: 'kjv' } }).result.current.settings;
    expect(s.shareLink).toBe('site');
    expect(s.defaultsRev).toBe(2);
    expect(s.translation).toBe('kjv');
  });
  it('a reader who chose App Link keeps it', () => {
    const s = mount({ savedSettings: { shareLink: 'app', defaultsRev: 1, touched: { shareLink: true } } }).result.current.settings;
    expect(s.shareLink).toBe('app');
  });
  it('a profile through round 2 that is set back to App Link is not flipped again', () => {
    expect(mount({ savedSettings: { shareLink: 'app', defaultsRev: 2 } }).result.current.settings.shareLink).toBe('app');
  });
});
