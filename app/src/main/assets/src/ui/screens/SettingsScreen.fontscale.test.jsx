// @ts-nocheck — the harness installs free-var globals for this screen
/* "Use my phone's text size" — the switch, and the write order behind it.
   ═══════════════════════════════════════════════════════════════════════
   R4 had no test on this branch (R8b, Design & Performance 2026-09-04), and
   the property it protects is an ORDER, which is exactly the kind of thing a
   later refactor reorders without noticing.

   Turning the switch OFF must write `fontScale` BEFORE `fontScaleSource`.
   The reader is looking at text at their phone's scale — say 2.0 — while the
   stored slider still says the legacy "1". Flip the source to 'reader' first
   and the very next render reads the slider instead of the phone, so the text
   they were reading snaps from 200% to 100% at the moment they take manual
   control. Pinning the slider to what is on screen first makes the switch a
   no-op visually, which is what "I'll take it from here" should mean.

   Turning it ON writes only the source: the phone's value is already the one
   being followed, and writing a slider value would strand a number that the
   system path never reads.

   Cases lifted from Design & Performance's probe rather than rewritten, so
   the cases that found the gap are the cases that hold it.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, within } from '@testing-library/react';
import { setupSettingsGlobals, teardownSettingsGlobals, renderSettings, row } from './settings-harness.jsx';

beforeEach(() => setupSettingsGlobals());
afterEach(() => { cleanup(); teardownSettingsGlobals(); });

describe("R4 — the phone-text-size switch writes in the order that keeps the page still", () => {
  it('system 2.0, stored "1": OFF pins fontScale "2" BEFORE fontScaleSource "reader"', () => {
    const onSetting = vi.fn();
    renderSettings({ fontScale: '1', systemFontScale: '2' }, { onSetting }, { expandGroups: true });
    const r = row("Use my phone's text size");
    expect(r).toBeTruthy();
    const sw = within(r).getByRole('switch');
    expect(sw.checked).toBe(true);
    fireEvent.click(sw);
    // The ORDER is the assertion, not just the pair.
    expect(onSetting.mock.calls).toEqual([['fontScale', '2'], ['fontScaleSource', 'reader']]);
  });

  it('reader 1.5 on a phone at 2.0: ON writes only the source', () => {
    const onSetting = vi.fn();
    renderSettings({ fontScale: '1.5', fontScaleSource: 'reader', systemFontScale: '2' }, { onSetting }, { expandGroups: true });
    const sw = within(row("Use my phone's text size")).getByRole('switch');
    expect(sw.checked).toBe(false);
    fireEvent.click(sw);
    expect(onSetting.mock.calls).toEqual([['fontScaleSource', 'system']]);
  });

  it('web (no systemFontScale cached): the row is not mounted at all', () => {
    // Presence is the availability signal (R2): the bridge only caches a value
    // on Android, so the absence of the key is what keeps this row off the web
    // build rather than a platform check that could drift.
    renderSettings({ fontScale: '1' }, {}, { expandGroups: true });
    expect(row("Use my phone's text size")).toBeUndefined();
  });
});
