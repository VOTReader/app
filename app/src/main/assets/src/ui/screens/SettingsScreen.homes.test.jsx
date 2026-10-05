// @ts-nocheck
/* SettingsScreen — every setting has a home (rs2, the overhaul's Settings in the new look).
   ═══════════════════════════════════════════════════════════════════════
   The redesign regrouped the screen (eight pages from eleven accordion groups) and dropped the
   controls nothing reads any more. Nothing a reader could set before may be lost on the way:
   every key useSettings declares is either shown on the page named here, under the row named
   here, or listed as removed with the reason, and the reason is checked (no screen reads it).
   A new key in use-settings.js fails the first test until someone gives it a home. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  setupSettingsGlobals, teardownSettingsGlobals, renderSettings, groupRowLabels,
} from './settings-harness.jsx';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** key -> [page, row label] */
const HOMES = {
  fontScale: ['Appearance', 'Text Size'],
  fontStyle: ['Appearance', 'Reading Font'],
  compactTopBar: ['Appearance', 'Compact Top Bar'],
  translation: ['Reading', 'Bible Translation'],
  showChapterTitle: ['Reading', 'Chapter Titles'],
  showSectionHeadings: ['Reading', 'Section Headings'],
  restoredNames: ['Reading', 'Restored Names'],
  arrowLayout: ['Reading', 'Page Arrows'],
  scriptureLayout: ['Reading', 'Scripture Browser'],
  showReadingDot: ['Reading', 'Reading Position Marker'],
  markAsRead: ['Reading', 'Mark as Read'],
  dwellMs: ['Reading', 'Reading Streak Dwell Time'],
  tabsEnabled: ['Reading', 'Tabs'],
  showInlineEchoes: ['Reading', 'Inline Reference Echoes'],
  keepScreenOn: ['Reading', 'Keep Screen On While Reading'],
  doubleTapFullscreen: ['Reading', 'Double-Tap / Click Fullscreen'],
  showSurpriseButton: ['Reading', 'Surprise Me Button'],
  autoScroll: ['Reading', 'Auto-Scroll'],
  autoScrollLpm: ['Reading', 'Scroll Speed'],
  autoScrollNext: ['Reading', 'Auto-Continue'],
  autoScrollEndMs: ['Reading', 'Auto-Continue Pause'],
  bibleAudio: ['Listening', 'Bible Audio'],
  letterReader: ['Listening', 'Letter Voice'],
  readAlongHighlight: ['Listening', 'Read-Along Highlight'],
  readAlongFollow: ['Listening', 'Follow the Voice'],
  audioTurnPage: ['Listening', 'Turn the Page with the Audio'],
  showLetterSongs: ['Listening', 'Show songs on letter pages'],
  searchEnabled: ['Search & history', 'Search'],
  searchSynonyms: ['Search & history', 'Synonym Search'],
  searchUseStopWords: ['Search & history', 'Filter Stop Words in Search'],
  historyEnabled: ['Search & history', 'History'],
  shareLink: ['Copy & share', 'Share Includes'],
  linkHighlight: ['Copy & share', 'Highlight the Passage'],
  gardenTier: ['Downloads & storage', 'Garden Image Quality'],
};

/** Shown nowhere on purpose: bookkeeping the app writes for itself. */
const INTERNAL = {
  touched: 'which keys the reader set (default flips never overwrite them)',
  searchCorpus: 'the search screen scope chip, set there',
  fullscreenHintCount: 'how often the fullscreen hint has shown',
};

/** Dropped from the screen: no code outside Settings reads them. Saved values stay readable. */
const REMOVED = {
  haptic: 'dead since it shipped: nothing reads it',
  showSettingsGear: 'the old top-bar icon row; the overhaul tab bar replaced it',
  historyInNav: 'the old top-bar icon row; the overhaul tab bar replaced it',
  showThemeBtn: 'the old top-bar icon row; the overhaul tab bar replaced it',
  showBookmarkNav: 'the old top-bar icon row; the overhaul tab bar replaced it',
  showScrollNotch: 'the scrollbar notch it drew is gone',
};

/** The keys useSettings declares: the object literal between `return {` and `...savedS`. */
function declaredKeys() {
  const text = fs.readFileSync(path.join(SRC, 'hooks/use-settings.js'), 'utf8');
  const start = text.indexOf('return {', text.indexOf('export function useSettings'));
  // Comments out first: they mention `...savedS` themselves.
  const rest = text.slice(start).replace(/\/\/[^\n]*/g, '');
  const body = rest.slice(0, rest.indexOf('...savedS'));
  const keys = new Set();
  for (const m of body.matchAll(/(?:^|[\s,{])([A-Za-z][A-Za-z0-9]*)\s*:/g)) keys.add(m[1]);
  return [...keys];
}

/** Every .js/.jsx under src, tests and the Settings screen itself left out. */
function consumerSources() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'vendor') walk(p); continue; }
      if (!/\.(js|jsx)$/.test(e.name) || /\.test\./.test(e.name)) continue;
      if (/SettingsScreen\.jsx$|settings-harness\.jsx$|use-settings\.js$|settings-glance\.js$/.test(e.name)) continue;
      out.push([p, fs.readFileSync(p, 'utf8')]);
    }
  };
  walk(SRC);
  return out;
}

beforeEach(() => setupSettingsGlobals());
afterEach(() => { cleanup(); teardownSettingsGlobals(); });

describe('every setting has a home (rs2)', () => {
  it('every key useSettings declares is placed, internal, or removed with a reason', () => {
    const keys = declaredKeys();
    expect(keys.length).toBeGreaterThan(40);   // the parse found the object, not a fragment
    const unplaced = keys.filter((k) => !(k in HOMES) && !(k in INTERNAL) && !(k in REMOVED));
    expect(unplaced).toEqual([]);
  });

  it('each placed key shows its row on the page named for it', () => {
    // Every dependency on, so no dependent row is unmounted by its parent's value.
    renderSettings({ autoScroll: true, autoScrollNext: true, markAsRead: true, searchEnabled: true, readAlongHighlight: true });
    const missing = Object.entries(HOMES)
      .filter(([, [page, label]]) => !groupRowLabels(page).includes(label))
      .map(([key, [page, label]]) => `${key}: "${label}" not on ${page}`);
    expect(missing).toEqual([]);
  });

  it('a removed key really is unread outside Settings (so dropping its control loses nothing)', () => {
    const sources = consumerSources();
    expect(sources.length).toBeGreaterThan(100);
    const stillRead = Object.keys(REMOVED).flatMap((key) => sources
      .filter(([, text]) => new RegExp('\\b(?:settings|s|opts|o)\\??\\.' + key + '\\b|\\[[\'"]' + key + '[\'"]\\]').test(text))
      .map(([p]) => key + ' in ' + path.relative(SRC, p)));
    expect(stillRead).toEqual([]);
  });
});
