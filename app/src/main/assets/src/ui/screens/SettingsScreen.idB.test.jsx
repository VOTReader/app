// @ts-nocheck — the harness installs free-var globals for this screen
/* SettingsScreen — id-myweb group B (2026-10-23): the find box, the copy and the small a11y pieces the
   10-22 sweep approved (s23.3, L1.8, A09.9, A09.12, s23.8, A09.10). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, within, act } from '@testing-library/react';
import { setupSettingsGlobals, teardownSettingsGlobals, renderSettings, groupHeads, groupHead, row } from './settings-harness.jsx';

beforeEach(() => { setupSettingsGlobals(); });
afterEach(() => { cleanup(); teardownSettingsGlobals(); });

const find = (value) => fireEvent.change(screen.getByLabelText('Find settings'), { target: { value } });
const shownGroups = () => groupHeads().map((h) => h.closest('[data-settings-group]').getAttribute('data-settings-group'));

describe('the find box matches the start of a word (s23.3)', () => {
  it('"a" no longer lights every group', () => {
    renderSettings({}, {}, { expandGroups: false });
    const all = shownGroups().length;
    find('a');
    expect(shownGroups().length).toBeLessThan(all);
    expect(shownGroups()).not.toContain('topnav');
    expect(shownGroups()).toContain('appearance');
  });

  it('a word typed in part still finds its group, and the middle of a word does not', () => {
    renderSettings({}, {}, { expandGroups: false });
    find('back');
    expect(shownGroups()).toEqual(['data']);
    find('ackup');
    expect(shownGroups()).toEqual([]);
  });

  it('says "Find a setting" in the empty box', () => {
    renderSettings({}, {}, { expandGroups: false });
    expect(screen.getByLabelText('Find settings').getAttribute('placeholder')).toBe('Find a setting');
  });
});

describe('Your data > Growth', () => {
  const withSamples = async (samples) => {
    teardownSettingsGlobals();
    setupSettingsGlobals({
      measureUserData: () => Promise.resolve({ total: 2e6, structured: 2e6, media: 0, mediaCount: 0 }),
      recordUserDataSample: () => Promise.resolve(samples),
    });
    renderSettings();
    await act(async () => {});
  };

  it('is not drawn until two measurements exist, and never promises a later day', async () => {
    await withSamples([{ d: '2026-11-09', b: 2e6 }]);
    expect(row('Growth')).toBeFalsy();
    expect(document.body.textContent).not.toMatch(/First measurement|appears the next day/);
  });

  it('is drawn from two measurements on', async () => {
    await withSamples([{ d: '2026-11-09', b: 2e6 }, { d: '2026-11-10', b: 2.5e6 }]);
    expect(row('Growth')).toBeTruthy();
    expect(row('Growth').textContent).toMatch(/grown by .* across 2 measurements/);
  });
});

describe('small copy and a11y pieces', () => {
  it('the Scroll Speed slider speaks its unit (L1.8)', () => {
    renderSettings({ autoScroll: true, autoScrollLpm: '16' });
    const s = document.querySelector('input[type="range"][aria-label^="Auto-scroll speed"]');
    expect(s.getAttribute('aria-valuetext')).toBe('16 lines per minute');
  });

  it('Copy & Share has its own icon, not the Appearance sun (A09.9)', () => {
    renderSettings({}, {}, { expandGroups: false });
    const icon = (id) => document.querySelector(`[data-settings-group="${id}"] .settings-group-icon svg`).innerHTML;
    expect(icon('share')).not.toBe(icon('appearance'));
  });

  it('the streak row states the live dwell time (A09.12)', () => {
    renderSettings({ dwellMs: '45000' });
    fireEvent.click(within(row('Count a page as read after')).getByLabelText(/Show description/));
    expect(row('Count a page as read after').textContent).toContain('Reading one chapter or letter for 45 seconds counts that day toward your reading streak on My Progress.');
    cleanup();
    renderSettings({ dwellMs: '60000' });
    fireEvent.click(within(row('Count a page as read after')).getByLabelText(/Show description/));
    expect(row('Count a page as read after').textContent).toContain('for 1 minute counts that day');
  });

  it('the reading rows are named by what they do, and the old names still find them', () => {
    renderSettings();
    for (const name of ['Answers progress', 'Marks on the scrollbar', 'Verses shown inline (Matthew Study Bible)', 'Count a page as read after']) {
      expect(row(name)).toBeTruthy();
    }
    for (const old of ['Answers Reading Path', 'Scrollbar Content Marker', 'Inline Reference Echoes', 'Reading Streak Dwell Time']) {
      expect(screen.queryByText(old)).toBeNull();
    }
    cleanup();
    renderSettings({}, {}, { expandGroups: false });
    for (const [typed, group] of [['scrollbar content marker', 'reading'], ['answers reading path', 'reading'], ['inline reference echoes', 'reading'], ['dwell time', 'reading'], ['marks on the scrollbar', 'reading'], ['count a page', 'reading'], ['top nav buttons', 'topnav'], ['top bar buttons', 'topnav']]) {
      find(typed);
      expect(shownGroups(), typed).toContain(group);
    }
  });

  it('the Letter Voice description reads as plain sentences (s23.8)', () => {
    renderSettings();
    fireEvent.click(within(row('Letter Voice')).getByLabelText(/Show description/));
    const text = row('Letter Voice').textContent;
    expect(text).not.toMatch(/haven't keep/);
    expect(text).toContain('Letters they have not recorded play the primary reading.');
  });
});

describe('Help keeps the promise of its summary (A09.10)', () => {
  it('summary says About, and the group holds an About link that opens it', () => {
    const onAbout = vi.fn();
    renderSettings({}, { onAbout });
    expect(groupHead('Help').textContent).toContain('About');
    fireEvent.click(screen.getByRole('button', { name: 'About VOTReader' }));
    expect(onAbout).toHaveBeenCalledTimes(1);
  });
});

describe('Text Size reset (A01.8 / A09.11)', () => {
  it('is gone at 100%, and away from it says "Reset to 100%" and resets', () => {
    renderSettings({ fontScale: '1' });
    expect(row('Text Size').querySelector('.txtsize-reset')).toBeNull();
    cleanup();
    const onSetting = vi.fn();
    renderSettings({ fontScale: '1.5' }, { onSetting });
    const reset = within(row('Text Size')).getByRole('button', { name: 'Reset to 100%' });
    fireEvent.click(reset);
    expect(onSetting).toHaveBeenCalledWith('fontScale', '1');
  });
});

describe('Install VOTReader in Help (PO2 19)', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
  it('a browser that can install gets the row; one that cannot gets none', () => {
    renderSettings({}, {});
    expect(screen.queryByRole('button', { name: /Install VOTReader/ })).toBeNull();
    cleanup();
    const was = navigator.userAgent;
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, get: () => iphone });
    try {
      renderSettings({}, {});
      expect(screen.getByRole('button', { name: /Install VOTReader/ })).toBeTruthy();
    } finally {
      Object.defineProperty(window.navigator, 'userAgent', { configurable: true, get: () => was });
    }
  });
});
