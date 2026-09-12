// @ts-nocheck — the derived case walks src/ with fs to collect every `settings.<key> !== false` read.
/* verifier-2 RED (2026-09-12, w-audio-continue-r2 cbc9392a), widened to the sibling the sweep found:
   a settings row read as `settings.<key> !== false` (absent = ON) and written by the REAL toggleSetting,
   `[key]: !prev[key]` (use-settings.js), has a DEAD FIRST TAP when the key has no entry in the defaults
   block — the tap goes `!undefined === true` and the row stays ON; only the second tap turns it off. That
   was "Turn the Page with the Audio" (audioTurnPage, new on this branch) and, on main since 2026-07-31,
   "Synonym Search" (searchSynonyms). Control: readAlongHighlight (defaulted true) flips on the first tap.

   The last case DERIVES the list from the source — every `settings.<key> !== false` read in src/ — so the
   next row written in this idiom without a default reddens here before it ships. */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../utils/platform-bridge.js', () => ({ PlatformBridge: { setLightStatusBar: vi.fn(), setKeepScreenOn: vi.fn() } }));
/** @type {any} */ (globalThis).GARDEN_DEFAULT_TIER = 2;
import { useSettings } from './use-settings.js';

const rowOn = (s, key) => s[key] !== false;   // SettingsScreen.jsx / app.jsx, the `!== false` idiom verbatim
const hook = (savedSettings) => renderHook((p) => useSettings(p), { initialProps: { savedSettings, theme: 'dark' } });
/** @type {Array<[string, any]>} */
const PROFILES = [
  ['a fresh profile', null],
  ['a persisted profile from before the row existed', { markAsRead: true, theme: 'dark', readAlongHighlight: true }],
];

describe('a row read as `!== false` turns OFF on ONE tap through the real toggleSetting', () => {
  for (const key of ['audioTurnPage', 'searchSynonyms']) {
    for (const [who, savedSettings] of PROFILES) {
      it(`${key} — ${who}: the row reads ON, one tap reads OFF`, () => {
        const { result } = hook(savedSettings);
        expect(rowOn(result.current.settings, key)).toBe(true);
        act(() => result.current.toggleSetting(key));
        expect(result.current.settings[key]).toBe(false);   // the tap the reader made
        expect(rowOn(result.current.settings, key)).toBe(false);
      });
    }
  }
  it('control — Follow the Voice (readAlongHighlight, defaulted true) turns OFF on one tap through the same path', () => {
    const { result } = hook(null);
    expect(result.current.settings.readAlongHighlight).toBe(true);
    act(() => result.current.toggleSetting('readAlongHighlight'));
    expect(result.current.settings.readAlongHighlight).toBe(false);
  });

  it('DERIVED: every key the app reads as `settings.<key> !== false` has a default, so its first tap is live', () => {
    // The set comes from the source, not from a hand list: walk src/ (tests excluded), collect the keys.
    const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const files = [];
    const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.jsx?$/.test(n) && !/\.test\.jsx?$/.test(n)) files.push(p); } };
    walk(SRC);
    const keys = new Set();
    for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/\bsettings\.([A-Za-z0-9_]+) !== false\b/g)) keys.add(m[1]);
    // Anti-vacuity: the scan must see the two rows this test is about and the control, or it read nothing.
    expect(files.length).toBeGreaterThan(50);
    for (const k of ['audioTurnPage', 'searchSynonyms', 'readAlongHighlight']) expect([...keys]).toContain(k);
    const { result } = hook(null);
    const missing = [...keys].filter((k) => !(k in result.current.settings)).sort();
    expect(missing).toEqual([]);   // each name here is a row whose first tap is dead
  });
});
