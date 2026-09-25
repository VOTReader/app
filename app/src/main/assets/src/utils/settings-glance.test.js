// @ts-nocheck
/* settings-glance — each Settings group's current values (the redesign, 2026-09-25). */
import { describe, it, expect } from 'vitest';
import { settingsGlance } from './settings-glance.js';

describe('settingsGlance', () => {
  it('a fresh profile reads as the defaults', () => {
    const g = settingsGlance({ settings: {}, theme: 'dark', textPercent: 100, fontLabel: 'System Serif' });
    expect(g.appearance).toBe('Dark · Standard text · System Serif');
    expect(g.reading).toBe('NKJV · Headings on · Restored names on');
    expect(g.listening).toBe('Default voice · Read-along on');
    expect(g.autoscroll).toBe('Off');
    expect(g.topnav).toBe('Compact bar with the ⋯ menu');
    expect(g.features).toBe('Search on · tabs off · history on');   // tabsEnabled is unset in this bare object
  });
  it('says what the reader changed', () => {
    const g = settingsGlance({
      settings: { translation: 'kjv', showSectionHeadings: false, restoredNames: false, readAlongHighlight: false,
        autoScroll: true, autoScrollLpm: '22', compactTopBar: false, tabsEnabled: true, markAsRead: true },
      theme: 'light', textPercent: 115, fontLabel: 'EB Garamond', readerLabel: 'Benjamin', gardenLabel: 'Native images',
    });
    expect(g.appearance).toBe('Light · Text 115% · EB Garamond');
    expect(g.reading).toBe('KJV · Headings off · Restored names off');
    expect(g.listening).toBe('Benjamin · Read-along off');
    expect(g.autoscroll).toBe('On · 22 lines a minute');
    expect(g.topnav).toBe('Every icon in the bar');
    expect(g.features).toBe('Search, tabs and history on');
    expect(g.garden).toBe('Native images');
    expect(g.progress).toBe('Marking chapters as read');
  });
  it('names each feature when some are off', () => {
    expect(settingsGlance({ settings: { searchEnabled: false, tabsEnabled: true } }).features).toBe('Search off · tabs on · history on');
    expect(settingsGlance({ settings: { searchEnabled: false, historyEnabled: false } }).features).toBe('Search, tabs and history off');
  });
});
