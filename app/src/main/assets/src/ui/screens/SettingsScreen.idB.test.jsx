// @ts-nocheck — the harness installs free-var globals for this screen
/* SettingsScreen — id-myweb group B (2026-10-23): the find box, the copy and the small a11y pieces the
   10-22 sweep approved (s23.3, L1.8, A09.9, A09.12, s23.8, A09.10). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, within } from '@testing-library/react';
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
    fireEvent.click(within(row('Reading Streak Dwell Time')).getByLabelText(/Show description/));
    expect(row('Reading Streak Dwell Time').textContent).toContain('A day counts toward your reading streak on My Progress after 45 seconds reading one chapter or letter.');
    cleanup();
    renderSettings({ dwellMs: '60000' });
    fireEvent.click(within(row('Reading Streak Dwell Time')).getByLabelText(/Show description/));
    expect(row('Reading Streak Dwell Time').textContent).toContain('after 1 minute reading');
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
