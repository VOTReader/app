/* collection-facts.js - what a v2 collection page shows (mw5; picture 2a-collection): the heading, the preface and letters,
   and each row's state (playing, finished, minutes left).

   Saved data is re-shown, never migrated (v2-build-plan rule 5), from the same places main's volume index reads:
     finished        vot-state readItems[`v1:<readKey>:<id>`] (a completed read or a full listen; useReadProgress)
     minutes left    the player's saved place in the recording (AudioPlayer.listenResume, main's "Resume · N min left"),
                     else the read tracker's frontier inside the text (ReadingStatsStore.getProgress, ReadingMinChip)
     playing         the recording loaded in the player (its track key is `<volKey>:<letter id>`)
   A gate boot seeds the same shapes in memory (gate.js). Everything here is read only. */

const g = /** @type {any} */ (globalThis);

/**
 * One row of a collection page.
 * @typedef {{ key: string, id: string, n: number | null, no: string, title: string, date: string, preface: boolean, item: any }} Entry
 * @typedef {{ finished?: boolean, leftMin?: number }} RowProgress
 * @typedef {{ collection: string, n?: number, letterId?: string, paused: boolean }} NowPlaying
 */

/** Main's headings for the collections that are not volumes (screen-routes' VolumeLetterIndex titles and eyebrows). */
const HEADS = {
  timothy: { title: 'Letters from Timothy', eyebrow: 'The Volumes of Truth' },
  flock: { title: "Letters to The Lord's Little Flock", eyebrow: 'The Volumes of Truth' },
  rebuke: { title: "The Lord's Rebuke", eyebrow: 'A Testament Against The World' },
  wtlb1: { title: 'Words To Live By', eyebrow: 'Part One · Words of Wisdom' },
  wtlb2: { title: 'Words To Live By', eyebrow: 'Part Two · More Words of Wisdom' },
  blessed: { title: 'The Blessed', eyebrow: 'Blessings & Promises' },
  holydays: { title: 'Regarding The Holy Days', eyebrow: 'The Appointed Times' },
};

/** The page's overline and title: a volume is "The Volumes of Truth" / "Volume One". */
export function collectionHead(col) {
  const h = HEADS[col.volKey];
  if (h) return h;
  return { eyebrow: /^Volume /.test(col.label) ? 'The Volumes of Truth' : '', title: col.label };
}

/** The collection's preface (row "P") and letters in order, once its corpus is loaded; [] before. @returns {Entry[]} */
export function collectionEntries(col, gl = g) {
  if (!col) return [];
  const out = [];
  const pre = col.prefaceGlobal ? gl[col.prefaceGlobal] : null;
  if (pre && pre.id) {
    out.push({ key: col.volKey + '/P', id: String(pre.id), n: null, no: 'P', title: pre.title || '', date: '', preface: true, item: pre });
  }
  const list = Array.isArray(gl[col.globalName]) ? gl[col.globalName] : [];
  for (const l of list) {
    if (!l || !l.id) continue;
    const n = typeof l.num === 'number' ? l.num : null;
    out.push({ key: col.volKey + '/' + (n != null ? n : l.id), id: String(l.id), n, no: n != null ? String(n) : '', title: l.title || '',
      date: typeof l.date === 'string' ? l.date : '', preface: false, item: l });
  }
  return out;
}

/** A dated letter's year: "8/31/04" -> 2004, "March 3, 2007" -> 2007; null when it names none. @param {string} date */
export function yearOf(date) {
  const four = /\b(19|20)\d{2}\b/.exec(date || '');
  if (four) return Number(four[0]);
  const two = /\/(\d{2})\s*$/.exec(date || '');
  return two ? 2000 + Number(two[1]) : null;
}

/** "29 letters · 2004–2005" (a single year once; no years when the letters carry no dates). @param {Entry[]} entries */
export function collectionLede(col, entries) {
  const letters = entries.filter((e) => !e.preface);
  const noun = col.kind === 'letter' ? (letters.length === 1 ? 'letter' : 'letters') : (letters.length === 1 ? 'entry' : 'entries');
  const years = letters.map((e) => yearOf(e.date)).filter((y) => y != null);
  if (!years.length) return letters.length + ' ' + noun;
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  return letters.length + ' ' + noun + ' · ' + (lo === hi ? String(lo) : lo + '–' + hi);
}

/** "6 min left" from seconds, the nearest whole minute and never 0 (main's resume pill). @param {number} sec */
export const minutesLeft = (sec) => Math.max(1, Math.round(sec / 60));

/**
 * The words under a row's title (the playing row's bars are drawn in front of them):
 *   "Preface" · "Playing · 8/31/04" · "Paused · 8/31/04" · "10/6/04 · Finished" · "10/7/04 · 6 min left" · "10/16/04".
 * Minutes left outrank Finished: a letter heard before and part-heard again shows where the reader is.
 * @param {Entry} e @param {{ playing?: boolean, paused?: boolean, progress?: RowProgress | null }} state
 */
export function rowWords(e, { playing = false, paused = false, progress = null } = {}) {
  const parts = [];
  if (playing) parts.push(paused ? 'Paused' : 'Playing');
  if (e.preface) parts.push('Preface');
  else if (e.date) parts.push(e.date);
  if (!playing && progress) {
    if ((progress.leftMin || 0) > 0) parts.push(progress.leftMin + ' min left');
    else if (progress.finished) parts.push('Finished');
  }
  return parts.join(' · ');
}

/** Is `np` (the loaded recording) this row? @param {Entry} e @param {NowPlaying | null} np */
export function isPlayingRow(e, np, collection) {
  if (!np || np.collection !== collection) return false;
  if (np.letterId) return np.letterId === e.id;
  return np.n != null && !e.preface && np.n === e.n;
}

/** The loaded recording, from the player's state (null when nothing is loaded). @returns {NowPlaying | null} */
export function nowPlayingFromEngine(state) {
  if (!state || !Array.isArray(state.queue) || state.status === 'idle') return null;
  const t = state.queue[state.qi];
  const key = t && typeof t.key === 'string' ? t.key : '';
  const at = key.indexOf(':');
  if (at <= 0) return null;
  return { collection: key.slice(0, at), letterId: key.slice(at + 1), paused: state.status === 'paused' };
}

/** The gate's playing row (gate.js GatePlaying) in the same shape. @returns {NowPlaying | null} */
export function nowPlayingFromGate(p) {
  if (!p || !p.item || !p.item.collection) return null;
  return { collection: p.item.collection, n: p.item.n, letterId: p.item.letterId, paused: !!p.paused };
}

/**
 * The reader's saved progress for each row, read only: { '<volKey>/<n>': { finished, leftMin } }.
 * @param {any} col @param {Entry[]} entries @returns {Record<string, RowProgress>}
 */
export function savedProgress(col, entries, gl = g) {
  /** @type {Record<string, RowProgress>} */
  const out = {};
  let readItems = {};
  try {
    const store = gl.StateStore;
    const s = store && typeof store.isReady === 'function' && store.isReady() ? store.get() : null;
    if (s && s.readItems && typeof s.readItems === 'object') readItems = s.readItems;
  } catch (_e) { /* no saved state: nothing finished */ }
  const player = gl.AudioPlayer;
  const stats = gl.ReadingStatsStore;
  const wpm = stats && typeof stats.measuredWpm === 'function' ? safe(() => stats.measuredWpm()) : null;
  for (const e of entries) {
    const readKey = 'v1:' + col.readKey + ':' + e.id;
    /** @type {RowProgress} */
    const p = {};
    if (readItems[readKey]) p.finished = true;
    const heard = player && typeof player.listenResume === 'function'
      ? safe(() => player.listenResume({ volKey: col.volKey, letter: e.item, collectionLabel: col.label })) : null;
    if (heard && heard.left > 0) p.leftMin = minutesLeft(heard.left);
    else {
      const read = readLeftMin(stats, readKey, e.item, wpm, gl);
      if (read > 0) p.leftMin = read;
    }
    if (p.finished || p.leftMin) out[e.key] = p;
  }
  return out;
}

/** Minutes of text left past the read tracker's frontier (ReadingMinChip's in-progress rule), else 0. */
function readLeftMin(stats, key, item, wpm, gl) {
  if (!stats || typeof stats.getProgress !== 'function') return 0;
  if (typeof gl.countItemWords !== 'function' || typeof gl.readingMinutes !== 'function') return 0;
  const p = safe(() => stats.getProgress(key));
  if (!(p && p.b > 0 && p.c && p.c.length > 0 && p.c.length < p.b)) return 0;
  const words = safe(() => gl.countItemWords(item)) || 0;
  if (!(words > 0)) return 0;
  const weighted = p.tw > 0 && p.w >= 0 && p.w < p.tw;
  const left = weighted ? p.tw - p.w : Math.round(words * (1 - p.c.length / p.b));
  return safe(() => gl.readingMinutes(left, wpm)) || 0;
}

/** The collection's recordings to download (each row's tracks, main's OfflineCollectionAction list). @param {Entry[]} entries */
export function downloadList(col, entries, gl = g) {
  const player = gl.AudioPlayer;
  if (!player || typeof player.playbackTracks !== 'function') return [];
  const out = [];
  for (const e of entries) {
    const tracks = safe(() => player.playbackTracks(col.volKey, e.item, col.label)) || [];
    for (const t of tracks) {
      if (!t || typeof t.url !== 'string') continue;
      out.push({ url: t.url, key: t.key || '', title: e.title + (t.partLabel ? ' · ' + t.partLabel : '') });
    }
  }
  return out;
}

function safe(fn) {
  try { return fn(); } catch (_e) { return null; }
}
