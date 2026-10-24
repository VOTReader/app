/* The write-failure toast names a real place in Settings (A08.6 / s40.1).
   ─────────────────────────────────────────────────────────────────────────
   It said "Open Settings → Storage": no such group ever existed. The path it names now is read
   step by step against the rendered screen, so renaming the group or the button breaks this
   test instead of quietly sending a reader with a full disk to a place that is not there. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, act } from '@testing-library/react';
import { setupSettingsGlobals, teardownSettingsGlobals, renderSettings } from './settings-harness.jsx';
import { WRITE_FAIL_TOAST_TEXT } from '../../utils/storage-health.js';
import { openYourData } from '../../utils/your-data-link.js';

beforeEach(() => { setupSettingsGlobals(); });
afterEach(() => { cleanup(); teardownSettingsGlobals(); });

describe('the write-failure toast names the Settings path the screen really has', () => {
  it('Settings → <group> → <button>: the group label and its button both exist', () => {
    const m = /Settings → ([^→]+?) → ([A-Za-z]+)/.exec(WRITE_FAIL_TOAST_TEXT);
    expect(m, 'the toast names a Settings path').toBeTruthy();
    const [, group, button] = m;
    renderSettings();
    const section = [...document.querySelectorAll('[data-settings-group]')]
      .find((s) => s.querySelector('.settings-section-label').textContent.trim() === group.trim());
    expect(section, 'a Settings group labelled "' + group + '"').toBeTruthy();
    const btn = [...section.querySelectorAll('button')].find((b) => b.textContent.trim() === button);
    expect(btn, 'a "' + button + '" button inside ' + group).toBeTruthy();
  });

  it('never names the Storage section that does not exist', () => {
    expect(WRITE_FAIL_TOAST_TEXT).not.toMatch(/Settings → Storage/);
  });
});

/* id-datasafe2 171: the toast's Open Your Data lands on Settings with the group open. */
describe('Open Your Data opens the Your Data group', () => {
  const dataOpen = () => /** @type {HTMLElement} */ (document.querySelector('[data-settings-group="data"]')).classList.contains('open');
  afterEach(() => { delete (/** @type {any} */ (window)).__votOpenYourData; });

  it('Settings mounting for the ask opens it, once', () => {
    openYourData();
    renderSettings({}, {}, { expandGroups: false });
    expect(dataOpen()).toBe(true);
    expect(/** @type {any} */ (window).__votOpenYourData).toBe(false);
  });

  it('Settings already on screen opens it at the ask', () => {
    renderSettings({}, {}, { expandGroups: false });
    expect(dataOpen()).toBe(false);
    act(() => { openYourData(); });
    expect(dataOpen()).toBe(true);
  });
});
