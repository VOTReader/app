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
    // fontScaleSource: the real bridge gains getSystemFontScale with the
    // native text-zoom batch (Android passthrough, web returns 1). Both
    // platform shapes are driven per-test below.
    isAndroid: false,
    getSystemFontScale: vi.fn(() => 1),
  },
}));
import { PlatformBridge } from '../utils/platform-bridge.js';

// The hook reads GARDEN_DEFAULT_TIER as a bare window global (bundle-d).
/** @type {any} */ (globalThis).GARDEN_DEFAULT_TIER = 2;

import { useSettings } from './use-settings.js';

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
    expect(s.showReadingDot).toBe(false);
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

/* fontScaleSource — the derive, and the cache that keeps the bridge off the
   boot path.
   ────────────────────────────────────────────────────────────────────
   The reader's scale comes from `fontScaleSource`, not from `fontScale`
   directly. React is the ONLY place that talks to the bridge; what it reads is
   written back as `settings.systemFontScale` so index.html's pre-bundle writer
   never has to call an interface it cannot prove exists yet.

   ANDROID ONLY (R2). The web bridge answers 1 by design, so caching it there
   would write systemFontScale:"1" into every web reader's state and light up
   an Android-only Settings row on a platform with no phone text size to
   follow. Absence of the cached value IS the availability signal that row
   reads, so it has to stay absent where the feature does not apply. */
describe('useSettings — fontScaleSource', () => {
  const scaleVar = () => document.documentElement.style.getPropertyValue('--font-scale');
  const bridge = /** @type {any} */ (PlatformBridge);

  afterEach(() => { bridge.isAndroid = false; bridge.getSystemFontScale = vi.fn(() => 1); });

  it('on Android, an untouched slider follows the phone', () => {
    bridge.isAndroid = true;
    bridge.getSystemFontScale = vi.fn(() => 1.8);
    mount({ savedSettings: { fontScale: '1' } });
    expect(scaleVar()).toBe('1.8');
  });

  it('a reader choice beats a larger phone scale', () => {
    bridge.isAndroid = true;
    bridge.getSystemFontScale = vi.fn(() => 2);
    mount({ savedSettings: { fontScale: '1.5', fontScaleSource: 'reader' } });
    expect(scaleVar()).toBe('1.5');
  });

  /* The migration, from the other end: a legacy install with a NON-1 scale and
     no source is unambiguous evidence the slider was used, so the phone must
     not override it. */
  it('a legacy 1.4 with no source is a reader choice, not a system one', () => {
    bridge.isAndroid = true;
    bridge.getSystemFontScale = vi.fn(() => 2);
    mount({ savedSettings: { fontScale: '1.4' } });
    expect(scaleVar()).toBe('1.4');
  });

  it('caches what the bridge said, so the boot writer never has to ask', () => {
    bridge.isAndroid = true;
    bridge.getSystemFontScale = vi.fn(() => 1.8);
    const { result } = mount({ savedSettings: { fontScale: '1' } });
    expect(result.current.settings.systemFontScale).toBe('1.8');
  });

  it('R2: on web it does not read the bridge, cache a value, or leave the row a signal', () => {
    bridge.isAndroid = false;
    bridge.getSystemFontScale = vi.fn(() => 1);
    const { result } = mount({ savedSettings: { fontScale: '1' } });
    expect(bridge.getSystemFontScale).not.toHaveBeenCalled();
    expect(result.current.settings.systemFontScale).toBeUndefined();
    expect(scaleVar()).toBe('1');
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
