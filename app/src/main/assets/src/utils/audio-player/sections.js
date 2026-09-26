// @ts-check
/* audio-player/sections — WTLB compilations: one file, many letters. Which letter the clock is in, and
   the follower that names it and credits one heard through. */

import { loadAudioSyncSections } from '../sync-loaders.js';
import { _collectionItems } from './catalog.js';
import { _g, _sections, _state } from './core.js';
import { _refreshCardMetadata } from './media-session.js';

/* ── WTLB compilations: one file, many letters (2026-09-20) ─────────────────
   A range-compilation section (AUDIO_SECTIONS: WTLB Part 1-7, Section 1-7) is
   ONE recording of many entries. The queue item keeps `key: null` — one file,
   one resume position, one track — and the entry being read is a function of
   (asset, clock), answered HERE for every consumer: the read-along's rows, the
   follower's page turn, the desk's "Open the reading", the shelf's text icon.
   Shape (agreed with the align lane, D:/Swarm/lanes/align/wtlb-shape.md):
     AUDIO_SYNC_SECTIONS[assetId][volKey:letterId] = [[t, pi, cs, ce, 0], …]
   rows in the AUDIO_SYNC shape on the FILE's clock, inner keys in playback
   order; letter i is current while rows_i[0][0] <= t < rows_{i+1}[0][0]; the
   last runs to the end of the file; before the first row nothing is current
   (an intro silence paints and navigates nothing); a letter the belt could not
   prove is ABSENT, never a wrong highlight, so the page follows to the next
   PRESENT one. The table is its own lazy file (src/data/audio-sync-sections.js):
   asking for a section's letter before it lands kicks the fetch (idempotent)
   and answers null until it does. */

/** The section-table entry for a track, or null (keyed track, not a section asset, table not landed). */
export function _sectionTableFor(track) {
  if (!track || track.key != null || typeof track.url !== 'string') return null;
  const tail = track.url.slice(track.url.lastIndexOf('/') + 1);
  const id = tail.slice(-4).toLowerCase() === '.mp3' ? tail.slice(0, -4) : '';
  const sections = _sections();
  if (!id || !sections || !Object.keys(sections).some((vk) => (sections[vk] || []).some((sec) => sec && sec[1] === id))) return null;
  const all = _g().AUDIO_SYNC_SECTIONS;
  if (!all) { void loadAudioSyncSections(); return null; }   // idempotent kick; null until it lands
  return all[id] || null;
}

/**
 * The letter a range-compilation section is reading at `time` (seconds on the
 * file's clock), as a "volKey:letterId" key — or null before its first row, for
 * a keyed track, or until the section table lands.
 * @param {any} track
 * @param {number} time
 * @returns {string | null}
 */
export function sectionLetterKeyAt(track, time) {
  const table = _sectionTableFor(track);
  if (!table) return null;
  let cur = null;
  for (const k of Object.keys(table)) {
    const rows = table[k];
    if (!Array.isArray(rows) || !rows.length || !Array.isArray(rows[0]) || rows[0][0] > time) break;
    cur = k;
  }
  return cur;
}

/**
 * The FIRST letter of a range-compilation section — where "Open the reading"
 * lands during the intro silence, and what a shelf row of a section that is not
 * playing opens. Null on the same conditions as sectionLetterKeyAt.
 * @param {any} track
 * @returns {string | null}
 */
export function sectionOpeningKey(track) {
  const table = _sectionTableFor(track);
  const first = table ? Object.keys(table)[0] : null;
  return first || null;
}

/* ── THE LETTER A COMPILATION IS READING (2026-09-22) ─────────────────────
   A section track keeps key null (one file, one resume position), so every
   surface that names a recording by its track — the mini-player, the desk,
   the web Media Session, the Android card — said "Part 1 · Intro–19" for the
   whole 10-24 minute file, and _notifyListened returned on the null key: none
   of the 347 letters heard through a compilation was ever credited (owner rule
   2026-08-09: a full listen counts like a full read). The clock already knows
   the letter (sectionLetterKeyAt). _followSectionLetter walks with it on every
   timeupdate: it NAMES the letter (liveLetter, the card) and CREDITS one heard
   through — SECTION_HEARD_FRACTION of its span actually played, seeks excluded
   — when the clock walks on into the next letter, or at 'ended' for the last. */

/** Share of a letter's span that must actually play for it to count as heard. */
const SECTION_HEARD_FRACTION = 0.8;
/** The letter under the clock of the loaded compilation, as the follower last saw it. */
export let _secKey = /** @type {string | null} */ (null);
/** Seconds of that letter actually heard (forward playback steps only). */
export let _secHeard = 0;
/** The clock at the previous step; -1 after a start or a seek, so a jump never counts as heard. */
let _secLastT = -1;
/** Write from another module of the player (the binding is read-only outside this one). @param {typeof _secLastT} v */
export function _setSecLastT(v) { _secLastT = v; }
/** "volKey:id" → title. Titles are immutable once the lazy registry has landed. */
const _letterTitles = new Map();

/** @returns {void} */
export function _resetSectionFollow() {
  _secKey = null;
  _secHeard = 0;
  _secLastT = -1;
}

/**
 * A letter's title from the lazy VOT registry, or null until it lands.
 * @param {string | null} key - "volKey:id"
 * @returns {string | null}
 */
export function _letterTitleOf(key) {
  if (!key) return null;
  if (_letterTitles.has(key)) return /** @type {string} */ (_letterTitles.get(key));
  const divider = key.indexOf(':');
  if (divider <= 0) return null;
  const items = _collectionItems(key.slice(0, divider));
  const id = key.slice(divider + 1);
  const item = items ? items.find((it) => it && it.id === id) : null;
  const title = item && typeof item.title === 'string' && item.title ? item.title : null;
  if (title) _letterTitles.set(key, title);
  return title;
}

/**
 * The letter the loaded compilation is reading right now, or null — for a
 * keyed recording, before the file's first letter, or until the timings land.
 * `title` is null until the registry lands (callers fall back to the track).
 * @returns {{ key: string, title: string | null } | null}
 */
export function liveLetter() {
  const track = _state.queue[_state.qi];
  if (!track || track.key != null || _state.status === 'idle') return null;
  const key = sectionLetterKeyAt(track, Number(_state.time) || 0);
  return key ? { key, title: _letterTitleOf(key) } : null;
}

/**
 * A letter's span on the file clock: its first row to the next letter's first
 * row, or to the end of the file for the last one. 0 when unknown.
 * @param {any} track @param {string} key @returns {number}
 */
function _sectionSpan(track, key) {
  const table = _sectionTableFor(track);
  if (!table || !Array.isArray(table[key]) || !table[key].length) return 0;
  const keys = Object.keys(table);
  const at = keys.indexOf(key);
  const start = Number(table[key][0][0]) || 0;
  const nextRows = at >= 0 && at + 1 < keys.length ? table[keys[at + 1]] : null;
  const end = nextRows && nextRows.length ? Number(nextRows[0][0]) || 0 : Number(_state.duration) || 0;
  return Math.max(0, end - start);
}

/**
 * Credit one letter heard through a compilation — the same bridge a keyed
 * recording's end reaches (__votAudioListened), and never the recordings-heard
 * counter: a letter inside a file is not a recording.
 * @param {any} track @param {string} key @param {number} heard @returns {void}
 */
export function _creditSectionLetter(track, key, heard) {
  try {
    const span = _sectionSpan(track, key);
    if (!(span > 0) || heard < span * SECTION_HEARD_FRACTION) return;
    const divider = key.indexOf(':');
    if (divider <= 0) return;
    const g = _g();
    if (typeof g.__votAudioListened === 'function') g.__votAudioListened(key.slice(0, divider), key.slice(divider + 1), 0);
  } catch (_e) { /* listen counting must never interfere with playback */ }
}

/**
 * Walk with the clock of a playing compilation (called on every timeupdate):
 * add the forward step to the current letter's heard time, and at a letter
 * boundary credit the letter just left when the clock walked straight on from
 * it into the next, then re-send the media card under the new letter's name.
 * @returns {void}
 */
export function _followSectionLetter() {
  const track = _state.queue[_state.qi];
  if (!track || track.key != null) { if (_secKey) _resetSectionFollow(); return; }
  const t = Number(_state.time) || 0;
  const live = _state.status === 'playing' || _state.status === 'loading';
  if (_secKey && _secLastT >= 0 && live && t > _secLastT) _secHeard += t - _secLastT;
  _secLastT = t;
  const key = sectionLetterKeyAt(track, t);
  if (key === _secKey) return;
  const left = _secKey;
  const heard = _secHeard;
  _secKey = key;
  _secHeard = 0;
  if (left && key) {
    const table = _sectionTableFor(track);
    const keys = table ? Object.keys(table) : [];
    const at = keys.indexOf(left);
    if (at >= 0 && keys[at + 1] === key) _creditSectionLetter(track, left, heard);
  }
  _refreshCardMetadata(track);
}
