/* settings-facts.js - what v2's Settings list says under each of its six pages (mw4; picture 4a-settings).

   Facts are plain values (the gate hook seeds them; readFacts() takes them from the reader's saved settings), and
   settingsRows() turns them into the six rows. Pure: no storage writes, no DOM. Labels follow the design's copy
   (v2-step2/screens/ref-4a-settings.html): "Standard size · Slate · comfortable lines", "Benjamin first · KJV Bible audio · 1×". */

import { lookOf, sizeWord } from './look.js';
import { readingFontOf } from './reading-font.js';

const DAY = 24 * 3600 * 1000;

/** Reader codes (utils/audio-track.js AUDIO_READERS). 'auto' plays Benjamin's reading wherever one exists (the manifest's
 *  rule: Benjamin supersedes), so it reads "Benjamin first" too. */
const READER_FIRST = { auto: 'Benjamin first', B: 'Benjamin first', T: 'Timothy first', V: 'Spoken voice first', M: 'With music first' };
const PAGE_LABEL = { slate: 'Slate', paper: 'Paper', black: 'Black' };
const SIZE_LABEL = { smaller: 'Smaller size', standard: 'Standard size', larger: 'Larger size' };

/**
 * @typedef {{ textSize?: string, page?: string, lines?: string, translation?: string, readingFont?: string, doubleTapFullscreen?: boolean,
 *   showChapterTitle?: boolean, showSectionHeadings?: boolean, restoredNames?: boolean, showInlineEchoes?: boolean,
 *   keepScreenOn?: boolean,
 *   reader?: string, bibleAudio?: string, speed?: number, downloads?: { count: number, bytes: number } | null,
 *   readAlong?: boolean, readAlongFollow?: boolean, autoScroll?: boolean,
 *   lastExportAt?: number | null, now?: number }} SettingsFacts
 */

/** The facts the reader's saved settings give (vot-state.settings); unknown ones stay undefined. @returns {SettingsFacts} */
export function readFacts(saved, { theme, speed } = /** @type {{ theme?: string, speed?: number }} */ ({})) {
  const s = saved && typeof saved === 'object' ? saved : {};
  // the text and page as look.js reads them (main's theme + fontScale; trueBlack and lineSpacing are v2's Black / Relaxed)
  const look = lookOf({ theme, settings: s });
  return {
    textSize: sizeWord(look.scale), page: look.page, lines: look.lines,
    translation: typeof s.translation === 'string' ? s.translation : 'nkjv',
    // main's Reading font (fontStyle), as v2 reads it: chosen, else the kit's EB Garamond (reading-font.js)
    readingFont: readingFontOf(s),
    doubleTapFullscreen: s.doubleTapFullscreen !== false,
    // main's Bible chrome (Settings > Reading, The Bible; each on by default, hooks/use-settings.js): a chapter's title
    // under its number, its section headings, the Restored-Name chrome, the Matthew Study Bible's reference echoes
    showChapterTitle: s.showChapterTitle !== false, showSectionHeadings: s.showSectionHeadings !== false,
    restoredNames: s.restoredNames !== false, showInlineEchoes: s.showInlineEchoes !== false,
    keepScreenOn: s.keepScreenOn !== false,
    // main's read-along switches (Settings > Reading), read by the v2 letter's wash (rv1 1b)
    readAlong: s.readAlongHighlight !== false, readAlongFollow: s.readAlongFollow !== false,
    // main's Auto-scroll switch (off by default): on, the pill waits on every reading page, as main's
    autoScroll: s.autoScroll === true,
    reader: typeof s.letterReader === 'string' ? s.letterReader : 'auto',
    bibleAudio: typeof s.bibleAudio === 'string' ? s.bibleAudio : 'brm-kjv',
    speed: typeof speed === 'number' && speed > 0 ? speed : 1,
    downloads: null, lastExportAt: null, now: Date.now(),
  };
}

/**
 * The facts for a real (non-gate) boot, read only: vot-state from StateStore once HydrationGate has loaded it (the
 * localStorage copy is the boot script's shim and holds theme + font only), the reading speed from AudioLibraryStore.
 * @returns {SettingsFacts}
 */
export function savedFacts(g = /** @type {any} */ (globalThis)) {
  let state = null;
  try {
    const store = g.StateStore;
    state = store && typeof store.isReady === 'function' && store.isReady() ? store.get()
      : JSON.parse((g.localStorage && g.localStorage.getItem('vot-state')) || '{}');
  } catch (_e) { /* no storage (a private window): the defaults */ }
  let speed;
  try {
    const lib = g.AudioLibraryStore;
    if (lib && typeof lib.getPlaybackRate === 'function') speed = Number(lib.getPlaybackRate());
  } catch (_e) { /* the speed is a label here: 1x when unknown */ }
  return readFacts(state && state.settings, { theme: state ? state.theme : undefined, speed });
}

/**
 * The Downloads row's facts on a real boot: the recordings main's OfflineAudio keeps on this device and their bytes
 * (kept songs left out, as main's "On this phone" counts them). null where nothing can be kept (no store: a Safari tab, a
 * private window) or before the store has read what it holds, so the row keeps its plain line rather than flash "Nothing
 * saved". Read only.
 * @returns {{ count: number, bytes: number } | null}
 */
export function downloadFacts(g = /** @type {any} */ (globalThis)) {
  const off = g.OfflineAudio;
  try {
    if (!off || !off.available() || !off.loaded()) return null;
    return { count: off.items().length, bytes: Math.max(0, Number(off.totalBytes()) || 0) };
  } catch (_e) { return null; }
}

/** "1×", "1.25×" */
export function speedLabel(rate) {
  const r = Math.round((Number(rate) || 1) * 100) / 100;
  return String(r) + '×';
}

/** "KJV Bible audio" from an edition key ('brm-kjv'): the edition's translation, upper-cased. */
export function bibleAudioLabel(key, editions = /** @type {any} */ (globalThis).BIBLE_AUDIO_EDITIONS) {
  if (!key || key === 'off') return 'Bible audio off';
  const ed = editions && Object.prototype.hasOwnProperty.call(editions, key) ? editions[key] : null;
  const tr = ed && ed.translation ? ed.translation : String(key).split('-').pop();
  return String(tr).toUpperCase() + ' Bible audio';
}

/** "48 MB", "14.5 MB", "1.2 GB", "640 KB": the unit picked from the rounded figure (doctrine mw9); under 100 MB or GB a size
 *  keeps its tenth, so the Downloads page's rows add up to its total (7f: 9.6 + 8.4 + 7.9 + 14.5 = 40.4 MB). */
export function sizeLabel(bytes) {
  const units = ['KB', 'MB', 'GB'];
  let v = Math.max(0, Number(bytes) || 0) / 1024;
  let u = 0;
  while (u < units.length - 1 && Math.round(v) >= 1024) { v /= 1024; u += 1; }
  const shown = v >= 100 || u === 0 ? Math.round(v) : Math.round(v * 10) / 10;
  return shown + ' ' + units[u];
}

/** "today", "yesterday", "2 days ago", "3 weeks ago" */
export function agoLabel(at, now) {
  const days = Math.floor((now - at) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return days + ' days ago';
  if (days < 60) return Math.floor(days / 7) + ' weeks ago';
  return Math.floor(days / 30) + ' months ago';
}

/**
 * The six Settings rows: { id, title, sub }.
 * @param {SettingsFacts} f
 * @param {{ device?: 'phone' | 'computer' }} [opts]
 */
export function settingsRows(f, { device = 'phone' } = {}) {
  const text = [SIZE_LABEL[f.textSize] || SIZE_LABEL.standard, PAGE_LABEL[f.page] || PAGE_LABEL.slate, (f.lines || 'comfortable') + ' lines'];
  const reading = [String(f.translation || 'nkjv').toUpperCase()];
  if (f.doubleTapFullscreen !== false) reading.push('double-tap for full screen');
  const listening = [READER_FIRST[f.reader] || READER_FIRST.auto, bibleAudioLabel(f.bibleAudio), speedLabel(f.speed)];
  const dl = f.downloads;
  const downloads = !dl ? 'Recordings saved for listening offline'
    : dl.count === 0 ? 'Nothing saved on this ' + device + ' yet'
      : dl.count + (dl.count === 1 ? ' recording' : ' recordings') + ' on this ' + device + ' · ' + sizeLabel(dl.bytes);
  const data = typeof f.lastExportAt === 'number' ? 'Last exported ' + agoLabel(f.lastExportAt, f.now || Date.now())
    : 'Back up, restore and export';
  return [
    { id: 'text', title: 'Text and theme', sub: text.join(' · ') },
    { id: 'reading', title: 'Reading', sub: reading.join(' · ') },
    { id: 'listening', title: 'Listening', sub: listening.join(' · ') },
    { id: 'downloads', title: 'Downloads', sub: downloads },
    { id: 'data', title: 'Your data', sub: data },
    { id: 'help', title: 'Help and about', sub: 'Show me around · privacy · version' },
  ];
}
