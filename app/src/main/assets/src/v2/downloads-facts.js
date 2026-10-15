/* downloads-facts.js - what Settings > Downloads says (v2lis B1; picture 7f-downloads, design's dz16).

   The page is main's "On this phone" shelf (ui/screens/AudioOfflineScreen.jsx) in v2's kit, with the download settings main
   kept elsewhere under it. Facts are plain values: a real boot reads them from bundle-d's OfflineAudio and SongKeep and the
   saved settings (liveShelf), a gate boot takes states.json's seed (gateShelf). shelfRows turns the saved recordings into
   the page's rows: a letter's parts and a Bible book's chapters are ONE row (main's groupShelf), the row last added to
   first, each saying where it is from ("Volume One · Letter 1", "Bible · 3 chapters") in the words Notes uses. */

import { recordingPlace, placeOfKey } from './notes-facts.js';
import { sizeLabel } from './settings-facts.js';
import { savedSettings } from './settings-pages.js';

const g = /** @type {any} */ (globalThis);

/**
 * @typedef {{ url: string, key: string, title: string, bytes: number, savedAt: number, stale: boolean }} SavedItem
 * @typedef {{ count: number, bytes: number, missing: number }} SongsKept
 * @typedef {{ available: boolean, loaded: boolean, items: SavedItem[], busy: number,
 *   failed: Array<{ url: string, key: string, title: string }>, waiting: boolean, updating: string[], canTell: boolean,
 *   songs: SongsKept | null, wifiOnly: boolean, gardenTier: string }} ShelfFacts
 * @typedef {{ id: string, title: string, sub: string, items: SavedItem[], urls: string[], bytes: number,
 *   stale: SavedItem[], updating: boolean }} ShelfRow
 */

/** "1 recording", "3 recordings" */
export const recordings = (n) => (n === 1 ? '1 recording' : n + ' recordings');

/** The words a group's titles share, cut at a " · " (main's _sharedTitle: "X · Part 1", "X · Part 2" -> "X"). */
function sharedTitle(titles) {
  const parts = titles.map((t) => String(t || '').split(' · '));
  const first = parts[0] || [];
  let n = first.length;
  for (const p of parts) { let i = 0; while (i < n && i < p.length && p[i] === first[i]) i++; n = i; }
  return first.slice(0, n).join(' · ');
}

/**
 * The page's rows from the saved recordings: grouped by recording (key, else url), a group's items in their own order
 * (chapter 2 before chapter 10), the group last added to first.
 * @param {SavedItem[]} items @param {{ updating?: string[] }} [opts] @param {any} [env] the globals the corpus lives in
 * @returns {ShelfRow[]}
 */
export function shelfRows(items, { updating = [] } = {}, env = g) {
  /** @type {Map<string, SavedItem[]>} */
  const byKey = new Map();
  for (const it of items) {
    const id = it.key || it.url;
    const list = byKey.get(id);
    if (list) list.push(it); else byKey.set(id, [it]);
  }
  const order = (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }) || a.url.localeCompare(b.url);
  const rows = [...byKey.entries()].map(([id, list]) => {
    list.sort(order);
    const first = list[0];
    const n = list.length;
    const bytes = list.reduce((s, x) => s + (x.bytes || 0), 0);
    const cut = first.key.indexOf(':');
    const volKey = cut > 0 ? first.key.slice(0, cut) : '';
    let title;
    let where;
    let count = '';
    if (volKey.lastIndexOf('bible-', 0) === 0) {
      // a book's chapters: the book ("John"); one chapter keeps its own name ("John 3")
      title = n > 1 ? placeOfKey('bible:' + first.key.slice(cut + 1), env).title : first.title || placeOfKey('bible:' + first.key.slice(cut + 1), env).title;
      where = 'Bible';
      if (n > 1) count = n + ' chapters';
    } else {
      const p = recordingPlace({ key: first.key, title: first.title, url: first.url }, env);
      title = p.title && p.title !== first.title ? p.title : n > 1 ? sharedTitle(list.map((x) => x.title)) || first.title : first.title;
      where = p.where;
      if (n > 1) count = n + ' parts';
    }
    const busy = list.some((x) => updating.includes(x.url));
    const stale = list.filter((x) => x.stale);
    const state = busy ? 'Updating' : stale.length ? 'Update available' : '';
    return {
      id, title, items: list, urls: list.map((x) => x.url), bytes, stale, updating: busy,
      sub: [where, count, sizeLabel(bytes), state].filter(Boolean).join(' · '),
      savedAt: list.reduce((m, x) => Math.max(m, x.savedAt || 0), 0),
    };
  });
  return rows.sort((a, b) => b.savedAt - a.savedAt).map(({ savedAt: _s, ...r }) => r);
}

/** The lede (main's words): "6 recordings · 40.4 MB. They play with no signal." */
export function ledeLine(f) {
  if (!f.available) return 'This browser cannot keep recordings, so here they play only with a signal.';
  if (!f.loaded || !f.items.length) return 'Recordings you download play with no signal.';
  const bytes = f.items.reduce((s, x) => s + (x.bytes || 0), 0);
  return recordings(f.items.length) + ' · ' + sizeLabel(bytes) + '. They play with no signal.';
}

/** Main's empty shelf, on this device. */
export const emptyLine = (here) => 'Nothing is on ' + here + ' yet. Download a recording from its row in a collection, or a whole collection at once, and it plays with no signal.';

/** The Wi-Fi switch's line: design's, or main's own where this browser cannot tell Wi-Fi from mobile data. */
export const wifiLine = (canTell) => (canTell ? 'Downloads wait for Wi-Fi, so they never use mobile data'
  : 'This browser cannot tell Wi-Fi from mobile data, so here downloads always go ahead');

/** Main's SongsKeptRow value: "2 · 7.6 MB", "3 to download again", "None yet". @param {SongsKept} s */
export function songsLine(s) {
  if (s.count) return s.count + ' · ' + sizeLabel(s.bytes);
  return s.missing ? s.missing + ' to download again' : 'None yet';
}

/** Main's Garden tiers (utils/garden.js, bundle-d's GARDEN_TIERS), [] before bundle-d is here. */
export function gardenTiers(gl = g) {
  return Array.isArray(gl.GARDEN_TIERS) ? gl.GARDEN_TIERS : [];
}

/** The Image quality row's line ("Standard · ~180 MB · 2880px"), or null when the tier is unknown. */
export function gardenLine(id, gl = g) {
  const t = gardenTiers(gl).find((x) => x && x.id === id);
  return t ? t.label + ' · ' + t.size + ' · ' + t.res : null;
}

/** Main's four tiers as the sheet's rows: label · size, res · desc (main's SelectField). */
export function gardenOptions(gl = g) {
  return gardenTiers(gl).map((t) => ({ id: t.id, label: t.label + ' · ' + t.size, s: t.res + ' · ' + t.desc }));
}

/** The songs of the letters kept on this device (main's SongKeep), or null where songs cannot be kept. @returns {SongsKept | null} */
export function liveSongs(gl = g) {
  const keep = gl.SongKeep;
  try {
    if (!keep || typeof keep.availability !== 'function' || keep.availability() === 'none') return null;
    const ids = keep.keptIds() || [];
    return { count: ids.length, bytes: ids.length ? Number(keep.bytesOf(ids)) || 0 : 0, missing: (keep.missing() || []).length };
  } catch (_e) { return null; }
}

/** The page's facts on a real boot, read only. @returns {ShelfFacts} */
export function liveShelf(gl = g) {
  const off = gl.OfflineAudio;
  const s = savedSettings(gl);
  const gate = gl.DownloadGate;
  /** @type {ShelfFacts} */
  const f = {
    available: false, loaded: false, items: [], busy: 0, failed: [], waiting: false, updating: [],
    canTell: !!(gate && typeof gate.canTell === 'function' && safe(() => gate.canTell())),
    songs: liveSongs(gl), wifiOnly: s.downloadWifiOnly === true,
    gardenTier: typeof s.gardenTier === 'string' ? s.gardenTier : (gl.GARDEN_DEFAULT_TIER || 'standard'),
  };
  try {
    if (!off || !off.available()) return f;
    f.available = true;
    if (!off.loaded()) return f;
    f.loaded = true;
    f.items = off.items();
    const p = off.pending();
    f.busy = p.busy;
    f.failed = p.failed;
    f.waiting = typeof off.waiting === 'function' && !!off.waiting();
    f.updating = typeof off.isUpdating === 'function' ? f.items.filter((it) => off.isUpdating(it.url)).map((it) => it.url) : [];
  } catch (_e) { /* what was read so far */ }
  return f;
}

function safe(fn) {
  try { return fn(); } catch (_e) { return null; }
}

/**
 * The 7f picture's facts (states.json 7f-downloads): Letters 1-3 of Volume One (9.6, 8.4 and 7.9 MB, Letter 3 with an
 * update) and John 1-3 as one row (14.5 MB), 6 recordings, 40.4 MB; 2 more on their way; Wi-Fi only off; 2 songs kept
 * (7.6 MB); the Garden at Standard.
 * @param {number} now @returns {ShelfFacts}
 */
export function gateShelf(now) {
  const MB = 1024 * 1024;
  const at = (h) => now - h * 3600 * 1000;
  const rec = (key, file, title, mb, h, stale = false) => ({
    url: 'https://github.com/votreader/gate/releases/download/7f/' + file + '.mp3', key, title, bytes: Math.round(mb * MB), savedAt: at(h), stale,
  });
  return {
    available: true, loaded: true, busy: 2, failed: [], waiting: false, updating: [], canTell: true,
    items: [
      rec('one:chosen-by-god', 'v1-01', 'Chosen by God', 9.6, 1),
      rec('one:honor-not-the-day-of-the-dead-honor-god', 'v1-02', 'Honor Not the Day of the Dead... Honor God', 8.4, 2),
      rec('one:christmas', 'v1-03', 'Christmas', 7.9, 3, true),
      rec('bible-brm-kjv:john', 'john-1', 'John 1', 4.9, 4),
      rec('bible-brm-kjv:john', 'john-2', 'John 2', 4.6, 4),
      rec('bible-brm-kjv:john', 'john-3', 'John 3', 5.0, 4),
    ],
    songs: { count: 2, bytes: Math.round(7.6 * MB), missing: 0 }, wifiOnly: false, gardenTier: 'standard',
  };
}

/** A gate boot with no shelf in its facts (another picture's Settings opening the page): an empty shelf. @returns {ShelfFacts} */
export function emptyGateShelf() {
  return { available: true, loaded: true, items: [], busy: 0, failed: [], waiting: false, updating: [], canTell: true, songs: null, wifiOnly: false, gardenTier: 'standard' };
}
