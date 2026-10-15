/* reading-settings.js - what v2's Settings > Reading and Bible translation pages say and change (mw7, v2-gaps 14;
   pictures 7d-reading, 7e-translation).

   Both pages re-show main's own Reading settings (hooks/use-settings.js keys and defaults; SettingsScreen's Reading,
   Mark as Read, Copy & Share, Search and Auto-Scroll groups) and write them through writeSetting (settings-pages.js:
   main's updateSetting shape). The translations are main's TRANSLATION_OPTIONS (index.html), split the way design's
   7e draws them: the name, its code, what sets it apart. Reading history is main's HistoryStore. Pure but for the
   global object each reader takes, so tests hand it fakes; a gate boot never writes. */

import { clampLpm, clampEndDwell } from '../hooks/use-autoscroll.js';
import { savedSettings } from './settings-pages.js';

const g = /** @type {any} */ (globalThis);

/** @typedef {{ id: string, label: string, desc: string, lang?: string }} TranslationOption */
/** @typedef {{ id: string, name: string, code: string, s: string, lang: 'en' | 'es' }} TranslationRow */

/** main's registry (index.html's TRANSLATION_OPTIONS, a page-wide const), or NKJV alone where it is not loaded. */
export function translationOptions(gl = g) {
  const opts = gl.TRANSLATION_OPTIONS || (typeof TRANSLATION_OPTIONS !== 'undefined' ? TRANSLATION_OPTIONS : null);
  return Array.isArray(opts) && opts.length ? opts : [{ id: 'nkjv', label: 'NKJV', desc: 'New King James Version — default' }];
}

/**
 * One translation as 7e draws it: main's desc split at its dash into the name ("World English Bible", the language
 * note dropped: the group says it) and what sets it apart, capitalised ("Modern, public domain · ~2% shorter than
 * NKJV"; NKJV's "default" reads "The default").
 * @param {TranslationOption} o @returns {TranslationRow}
 */
export function translationRow(o) {
  const desc = String(o.desc || '');
  const cut = desc.search(/\s[—–]\s/);
  const name = (cut < 0 ? desc : desc.slice(0, cut)).replace(/\s*\((Español|Espanol|English)\)\s*$/i, '').trim() || String(o.label);
  let s = cut < 0 ? '' : desc.slice(cut + 3).trim();
  s = s === 'default' ? 'The default' : s.charAt(0).toUpperCase() + s.slice(1);
  return { id: o.id, name, code: String(o.label || o.id).trim(), s, lang: o.lang === 'es' ? 'es' : 'en' };
}

/** 7e's two groups, English then Español, each in main's order. */
export function translationGroups(gl = g) {
  const rows = translationOptions(gl).map(translationRow);
  return [
    { label: 'English', rows: rows.filter((r) => r.lang === 'en') },
    { label: 'Español', rows: rows.filter((r) => r.lang === 'es') },
  ].filter((x) => x.rows.length);
}

/** The Bible translation row's line: "NKJV · New King James Version". */
export function translationLine(id, gl = g) {
  const o = translationOptions(gl).find((x) => x.id === id) || translationOptions(gl)[0];
  const r = translationRow(o);
  return r.code + ' · ' + r.name;
}

/** main's Restored Name editions carry this note on 7e (they are the ids main restores the Name in). */
export const AI_NOTE = 'The Restored Name editions were prepared with AI assistance (Claude Fable 5, 2026).';

/**
 * 7d's switches by group: main's keys, and `def` what an unset key means (main's defaults, hooks/use-settings.js).
 * @type {Record<string, Array<{ key: string, t: string, s: string, def: boolean }>>}
 */
export const READING_SWITCHES = {
  bible: [
    { key: 'showChapterTitle', t: 'Chapter titles', s: '‘The Creation’ under the chapter number', def: true },
    { key: 'showSectionHeadings', t: 'Section headings', s: 'Topic breaks between the verses', def: true },
    { key: 'restoredNames', t: 'Restored Names', s: 'YAHUWAH and YahuShua in titles and headings; the verses never change', def: true },
    { key: 'showInlineEchoes', t: 'Reference echoes', s: 'Matthew Study Bible: a small pill leads back to its note', def: true },
  ],
  page: [
    { key: 'doubleTapFullscreen', t: 'Double-tap for full screen', s: 'Tap an open area twice; twice again to come back', def: true },
    { key: 'keepScreenOn', t: 'Keep the screen on', s: 'While VOTReader is open', def: true },
    { key: 'autoScroll', t: 'Auto-scroll', s: 'A play pill on letters and chapters scrolls the page for you', def: false },
  ],
  record: [
    { key: 'markAsRead', t: 'Mark as read', s: 'A check once you have read nearly all of it', def: true },
    { key: 'historyEnabled', t: 'Keep a reading history', s: 'Home’s Recent comes from it', def: true },
  ],
  share: [
    { key: 'linkHighlight', t: 'Highlight the passage', s: 'A website link opens at the words you copied', def: false },
  ],
  search: [
    { key: 'searchSynonyms', t: 'Similar words', s: '‘mercy’ also finds ‘compassion’', def: true },
    { key: 'searchUseStopWords', t: 'Skip filler words', s: 'the, of, and … in searches of five words or more', def: true },
  ],
};

/** main's Share Includes choices (SettingsScreen SHARE_LINK_OPTIONS), in v2's words. */
export const SHARE_OPTIONS = [
  { id: 'app', label: 'The app link', s: 'Opens the passage in VOTReader, even offline, for anyone who has the app',
    line: 'The app link · opens in VOTReader, even offline' },
  { id: 'site', label: 'The website link', s: 'Opens the letter on thevolumesoftruth.com, for anyone, with a connection',
    line: 'The website link · opens the letter on thevolumesoftruth.com' },
];

/** Scroll speed choices (main's slider runs 4-40 lines a minute, 16 by default), plus the saved one between them. */
const LPM = [4, 8, 12, 16, 20, 24, 30, 40];
/** Pause choices before the next page (main's slider: 0-15 s in half seconds, 2.5 s by default). */
const DWELL = [0, 1000, 2500, 5000, 10000, 15000];

/** "16 lines/min" */
export const lpmLabel = (lpm) => clampLpm(lpm) + ' lines/min';
/** "None", "2.5 s" (main's row: "None" / "2.5s") */
export const dwellLabel = (ms) => {
  const secs = Math.round(clampEndDwell(ms) / 100) / 10;
  return secs === 0 ? 'None' : secs + ' s';
};

/** @param {number} cur @param {number[]} list */
function withCurrent(cur, list) {
  return list.includes(cur) ? list : list.concat([cur]).sort((a, b) => a - b);
}
/** The speed sheet's rows. */
export function lpmOptions(current) {
  const cur = clampLpm(current);
  return withCurrent(cur, LPM).map((n) => ({ id: String(n), label: lpmLabel(n), s: n === 16 ? 'The default' : n < 16 ? 'Slower' : 'Faster' }));
}
/** The pause sheet's rows. */
export function dwellOptions(current) {
  const cur = clampEndDwell(current);
  return withCurrent(cur, DWELL).map((ms) => ({ id: String(ms), label: dwellLabel(ms), s: ms === 2500 ? 'The default' : ms === 0 ? 'Turns at once' : '' }));
}

/**
 * @typedef {{ translation: string, switches: Record<string, boolean>, shareLink: 'app' | 'site', lpm: number,
 *   autoNext: boolean, endMs: number, history: number | null }} ReadingFacts
 */

/** The page's facts from saved settings (vot-state.settings) and the history's length. @returns {ReadingFacts} */
export function readingFacts(s = {}, history = null) {
  /** @type {Record<string, boolean>} */
  const switches = {};
  Object.values(READING_SWITCHES).flat().forEach((x) => {
    switches[x.key] = x.def ? s[x.key] !== false : s[x.key] === true;
  });
  return {
    translation: typeof s.translation === 'string' ? s.translation : 'nkjv',
    switches,
    shareLink: s.shareLink === 'site' ? 'site' : 'app',
    lpm: clampLpm(s.autoScrollLpm || '16'),
    autoNext: s.autoScrollNext !== false,
    endMs: clampEndDwell(s.autoScrollEndMs || '2500'),
    history,
  };
}

/** How many places main's reading history holds; null before its store has loaded. */
export function historyCount(gl = g) {
  try {
    const hist = gl.HistoryStore;
    if (hist && typeof hist.isReady === 'function' && hist.isReady()) return (hist.list() || []).length;
  } catch (_e) { /* not known */ }
  return null;
}

/** Wipes main's reading history (main's clearHistory: HistoryStore.clear()). false when there is no store. */
export function clearHistory(gl = g) {
  const hist = gl.HistoryStore;
  if (!hist || typeof hist.clear !== 'function') return false;
  hist.clear();
  return true;
}

/** Reading facts for a real boot. */
export function liveReading(gl = g) {
  return readingFacts(savedSettings(gl), historyCount(gl));
}

/** 7d's facts (states.json 7d-reading): NKJV, the defaults, 42 places in the history. */
export function gateReading() {
  return readingFacts({}, 42);
}

/** "42 places", "1 place", "Nothing yet" */
export function placesLine(n) {
  if (n === null || n === undefined) return 'Home’s Recent and the places you have read';
  return n === 0 ? 'Nothing yet' : n + (n === 1 ? ' place' : ' places');
}
