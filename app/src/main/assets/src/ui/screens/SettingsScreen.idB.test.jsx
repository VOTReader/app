// @ts-nocheck — the harness installs free-var globals for this screen
/* SettingsScreen — id-myweb group B (2026-10-23): the find box, the copy and the small a11y pieces the
   10-22 sweep approved (s23.3, L1.8, A09.9, A09.12, s23.8, A09.10). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, fireEvent } from '@testing-library/react';
import { setupSettingsGlobals, teardownSettingsGlobals, renderSettings, groupHeads, groupHead, row } from './settings-harness.jsx';

beforeEach(() => { setupSettingsGlobals(); });
afterEach(() => { cleanup(); teardownSettingsGlobals(); });

const find = (value) => fireEvent.change(screen.getByLabelText('Find settings'), { target: { value } });
// WS2 settings (st-find): the find draws found ROWS, each with its place, not whole groups.
const foundPlaces = () => [...document.querySelectorAll('[data-found] .ws2-place')].map((p) => p.textContent);

describe('the find box matches the start of a word (s23.3)', () => {
  it('"a" no longer lights every row', () => {
    renderSettings();
    const all = document.querySelectorAll('.settings-row').length;   // every group's screen at once
    cleanup();
    renderSettings({}, {}, { expandGroups: false });
    find('a');
    expect(groupHeads()).toHaveLength(0);   // no group heads while finding
    expect(foundPlaces().length).toBeGreaterThan(0);
    expect(foundPlaces().length).toBeLessThan(all);
    expect(row('Answers reading path')).toBeTruthy();
    expect(row('Search')).toBeUndefined();
  });

  it('a word typed in part still finds its rows, and the middle of a word does not', () => {
    renderSettings({}, {}, { expandGroups: false });
    find('backu');
    expect(foundPlaces().length).toBeGreaterThan(0);
    for (const place of foundPlaces()) expect(place).toMatch(/^Your data/);
    expect(row('Check a backup file')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(foundPlaces().length + ' settings');
    find('ackup');
    expect(foundPlaces()).toEqual([]);
    expect(screen.getByRole('status').textContent).toContain('No matching settings');
  });

  it('says "Find a setting" in the empty box', () => {
    renderSettings({}, {}, { expandGroups: false });
    expect(screen.getByLabelText('Find settings').getAttribute('placeholder')).toBe('Find a setting');
  });
});

describe('small copy and a11y pieces', () => {
  it('the Scroll Speed slider speaks its unit (L1.8)', () => {
    renderSettings({ autoScroll: true, autoScrollLpm: '16' });
    const s = document.querySelector('input[type="range"][aria-label^="Auto-scroll speed"]');
    expect(s.getAttribute('aria-valuetext')).toBe('16 lines per minute');
  });

  it('Sharing has its own icon, not the Appearance sun (A09.9)', () => {
    renderSettings({}, {}, { expandGroups: false });
    const icon = (id) => document.querySelector(`[data-settings-group="${id}"] .ui-row-lead svg`).innerHTML;
    expect(icon('share')).not.toBe(icon('appearance'));
  });

  // WS2 settings: the line is the design's short one; the live dwell time is the row's value beside it.
  it('the streak row states the live dwell time (A09.12)', () => {
    renderSettings({ dwellMs: '45000' });
    expect(row('Reading streak').textContent).toContain('A day counts after this long on one chapter or letter');
    expect(screen.getByRole('button', { name: 'Reading streak: 45 seconds' })).toBeTruthy();
    cleanup();
    renderSettings({ dwellMs: '60000' });
    expect(screen.getByRole('button', { name: 'Reading streak: 60 seconds' })).toBeTruthy();
  });

  it('the Letter voice description reads as plain sentences (s23.8)', () => {
    renderSettings();
    const text = row('Letter voice').textContent;
    expect(text).not.toMatch(/haven't keep/);
    // WS2 settings: the row carries the design's short line (U 8.7)
    expect(row('Letter voice').querySelector('.settings-row-desc').textContent).toBe('The reader you prefer for the Letters');
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
    expect(document.querySelector('.ws1-txtsize .txtsize-reset')).toBeNull();
    cleanup();
    const onSetting = vi.fn();
    renderSettings({ fontScale: '1.5' }, { onSetting });
    const reset = screen.getByRole('button', { name: 'Reset to 100%' });
    fireEvent.click(reset);
    expect(onSetting).toHaveBeenCalledWith('fontScale', '1');
  });
});
