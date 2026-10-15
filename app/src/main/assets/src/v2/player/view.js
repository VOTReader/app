/* player/view.js - what the v2 player shows, worked out from the engine's state (rv1, 2026-10-14). Pure: no React, no
   storage; the corpus and the registries are read from globals (bundle-a/b/d) at call time, so a lazy volume that lands
   later is picked up on the next render. Words and numbers follow design's v2-step2 pictures 2b, 6a-6c, 0a, 2a, 2c. */

const g = /** @type {any} */ (globalThis);

/** A volume's cover numeral; any other collection draws its initials, smaller. */
const ROMAN = { one: 'I', two: 'II', three: 'III', four: 'IV', five: 'V', six: 'VI', seven: 'VII' };
/** BIBLE_AUDIO_BOOKS is in canonical order: Matthew, the first New Testament book, is the 40th. */
const FIRST_NT_INDEX = 39;
/** audio-track.js's AUDIO_READERS, for a page where bundle-d has not published it (tests, a failed load). */
const READERS = { B: 'Read by Benjamin', T: 'Read by Timothy', V: 'Text-to-speech', M: 'Read with music' };

/** The speed range the sheet's slider and 1 % steps cover. */
export const RATE_MIN = 0.5;
export const RATE_MAX = 3;
/** The sheet's six quick picks. */
export const RATE_PICKS = [0.75, 1, 1.25, 1.5, 1.75, 2];
/** The sleep sheet's rows: minutes, or 'off' / 'end'. */
export const SLEEP_OPTIONS = [
  { id: 'off', label: 'Off' },
  { id: 15, label: '15 minutes' },
  { id: 30, label: '30 minutes' },
  { id: 60, label: '1 hour' },
  { id: 'end', label: 'When this recording ends' },
];

const pad = (n) => (n < 10 ? '0' : '') + n;

/** "3:51", "1:02:05". @param {number} sec */
export function clock(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? h + ':' + pad(m) + ':' + pad(s % 60) : m + ':' + pad(s % 60);
}

/** "−6:17" (U+2212): the clock and the time left always add up to the length. */
export function timeLeft(time, duration) {
  return '−' + clock(Math.max(0, Math.floor(Number(duration) || 0) - Math.floor(Number(time) || 0)));
}

/** How far through, 0-100. */
export function progressPct(time, duration) {
  const d = Number(duration) || 0;
  if (d <= 0) return 0;
  return Math.round(Math.min(100, Math.max(0, ((Number(time) || 0) / d) * 100)) * 100) / 100;
}

/** "1×", "1.25×". @param {number} rate */
export function rateLabel(rate) {
  return String(Math.round((Number(rate) || 1) * 100) / 100) + '×';
}

/** @param {number} rate */
export function speedWords(rate) {
  const r = Number(rate) || 1;
  if (Math.abs(r - 1) < 0.005) return 'Normal speed';
  return r < 1 ? 'Slower than recorded' : 'Faster than recorded';
}

/** Where a rate sits on the 0.5x-3x slider, 0-100. */
export function ratePct(rate) {
  return Math.round(((Math.min(RATE_MAX, Math.max(RATE_MIN, Number(rate) || 1)) - RATE_MIN) / (RATE_MAX - RATE_MIN)) * 10000) / 100;
}

/** A rate clamped to the range and to 1 % steps. */
export function clampRate(rate) {
  return Math.round(Math.min(RATE_MAX, Math.max(RATE_MIN, Number(rate) || 1)) * 100) / 100;
}

/** The sleep timer's chip: what is running, else its name. @param {any} st @param {number} leftSec */
export function sleepChip(st, leftSec) {
  if (st && st.sleepAtTrackEnd) return 'End of recording';
  if (leftSec > 0) return Math.max(1, Math.ceil(leftSec / 60)) + ' min';
  return 'Sleep timer';
}

/** Which sleep row is ticked. @returns {number | 'off' | 'end'} */
export function sleepChoice(st, leftSec) {
  if (st && st.sleepAtTrackEnd) return 'end';
  if (leftSec > 0 && st && st.sleepMinutes) return st.sleepMinutes;
  return 'off';
}

/** "Read by Benjamin" for a reader code; null when unknown. */
export function readerLine(code) {
  const map = g.AUDIO_READERS || READERS;
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(map, code) ? map[code] : null;
}

/** "Benjamin" (the mini player's short form). */
export function readerName(code) {
  const line = readerLine(code);
  return line ? line.replace(/^Read by /, '') : null;
}

/** The Bible edition a 'bible-*' volKey streams. */
function editionOf(volKey) {
  const eds = g.BIBLE_AUDIO_EDITIONS;
  if (!eds) return null;
  return Object.keys(eds).map((k) => eds[k]).find((e) => e && e.volKey === volKey) || null;
}

/** Up to two capitals for a collection without a numeral ("Words to Live By" -> "WL"). */
export function initials(label) {
  const words = String(label || '').split(/\s+/).filter((w) => w && !/^(the|of|to|by|and|a|an)$/i.test(w));
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '•';
}

/**
 * Everything the player draws about one track.
 * @param {any} track  the engine's Track: { key 'volKey:id' | null, title, sub, url, readerCode, partLabel }
 * @returns {{ kind: 'letter' | 'bible' | 'other', title: string, overline: string, by: string, mini: string,
 *   cover: { cn: string, cl: string | null, sm: boolean }, date: string, collection: string | null, n: number | null }}
 */
export function trackInfo(track) {
  const t = track || {};
  const key = typeof t.key === 'string' ? t.key : '';
  const cut = key.indexOf(':');
  const volKey = cut > 0 ? key.slice(0, cut) : '';
  const id = cut > 0 ? key.slice(cut + 1) : '';
  const reader = readerLine(t.readerCode);
  if (volKey.lastIndexOf('bible-', 0) === 0) {
    const books = Array.isArray(g.BIBLE_AUDIO_BOOKS) ? g.BIBLE_AUDIO_BOOKS : [];
    const at = books.findIndex((b) => b && b[0] === id);
    const ed = editionOf(volKey);
    const tr = ed && ed.translation ? String(ed.translation).toUpperCase() : '';
    const sub = 'The Scriptures of Truth';
    return {
      kind: 'bible', title: t.title || '', overline: sub, by: reader || (ed && ed.label) || '',
      mini: tr ? sub + ' · ' + tr : sub,
      cover: { cn: at >= FIRST_NT_INDEX ? 'NT' : 'OT', cl: null, sm: true }, date: '', collection: null, n: null,
    };
  }
  const col = volKey && g.COL_BY_KEY && typeof g.COL_BY_KEY.get === 'function' ? g.COL_BY_KEY.get(volKey) : null;
  if (col) {
    const list = Array.isArray(g[col.globalName]) ? g[col.globalName] : null;
    const letter = list ? list.find((l) => l && l.id === id) : null;
    const n = letter && typeof letter.num === 'number' ? letter.num : null;
    const roman = ROMAN[/** @type {keyof typeof ROMAN} */ (volKey)];
    const short = readerName(t.readerCode);
    return {
      kind: 'letter', title: (letter && letter.title) || t.title || '', overline: n ? col.label + ' · Letter ' + n : col.label,
      by: reader || '', mini: short ? col.label + ' · ' + short : col.label,
      cover: roman ? { cn: roman, cl: col.label, sm: false } : { cn: initials(col.label), cl: col.label, sm: true },
      date: (letter && letter.date) || '', collection: volKey, n,
    };
  }
  const sub = t.sub || '';
  const short = readerName(t.readerCode);
  return {
    kind: 'other', title: t.title || '', overline: sub, by: reader || '', mini: [sub, short].filter(Boolean).join(' · '),
    cover: { cn: initials(sub || t.title), cl: null, sm: true }, date: '', collection: null, n: null,
  };
}

/** The mini player's second line: paused, it also says how long is left ("Volume One · Benjamin · 6 min left"). */
export function miniLine(info, st) {
  if (!st || st.status === 'playing' || st.status === 'loading' || !(st.duration > 0)) return info.mini;
  const left = Math.max(1, Math.floor((Math.floor(st.duration) - Math.floor(st.time || 0)) / 60));
  return info.mini + ' · ' + left + ' min left';
}

/** Up next: the playing item and everything after it, numbered by queue position. */
export function upNextRows(st) {
  const queue = (st && st.queue) || [];
  const qi = Math.max(0, Math.min(queue.length - 1, (st && st.qi) || 0));
  const rows = [];
  for (let i = qi; i < queue.length; i += 1) {
    const info = trackInfo(queue[i]);
    const current = i === qi;
    const now = st.status === 'playing' || st.status === 'loading' ? 'Playing now' : 'Paused';
    rows.push({ index: i, no: i + 1, title: info.title, current,
      sub: current ? [now, readerName(queue[i] && queue[i].readerCode)].filter(Boolean).join(' · ') : info.date });
  }
  return { rows, count: queue.length ? (qi + 1) + ' of ' + queue.length : '' };
}
