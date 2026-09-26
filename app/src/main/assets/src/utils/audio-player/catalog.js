// @ts-check
/* audio-player/catalog — manifest queries: what has a recording, an item's tracks and renditions, the
   preferred reader, a collection's items, and where a stored recording sits in the live corpus. Pure over
   the lazy corpus globals except the preferred reader. */

import { audioReaderLabel, isSongKey } from '../audio-track.js';
import { songTrack } from '../song-catalog.js';
import {
  _alternates,
  _assetUrlFor,
  _bibleManifest,
  _g,
  _isBibleVol,
  _mapFor,
  _sections,
  trackUrl,
} from './core.js';

/** @typedef {import('../audio-player.js').Track} Track */
/** @typedef {import('../audio-player.js').Rendition} Rendition */

/** volKey → has-any-audio. The manifest is immutable once loaded. */
const _volHasAudio = new Map();

/**
 * The chapter a "Chapter N" part label names, or 0. Every shipped Bible
 * edition labels its parts that way (bible-audio-manifest.js expands them from
 * one loop), so the label IS the answer; a legacy whole-book recording carries
 * no part label and has no single chapter to name.
 *
 * @param {unknown} partLabel
 * @returns {number}
 */
function _chapterOfLabel(partLabel) {
  const match = typeof partLabel === 'string' ? partLabel.match(/^Chapter (\d+)$/) : null;
  return match ? Number(match[1]) : 0;
}

/** @param {Track | null | undefined} track @returns {number} */
export function _chapterOfTrack(track) {
  return _chapterOfLabel(track && track.partLabel);
}

/**
 * Which Bible chapter a track is, or 0 when it is not a per-chapter Bible
 * recording. Exported because read-along must answer the same question — a
 * book queues its whole remaining run, so the reader can be looking at
 * Genesis 3 while Genesis 1 plays, and painting then would be a confident lie.
 * Exported rather than re-parsed there: the label format is this module's, and
 * a second copy of the regex is a second thing to drift.
 *
 * @param {Track | null | undefined} track
 * @returns {number}
 */
export function bibleChapterOfTrack(track) {
  return _chapterOfTrack(track);
}

/* ── manifest queries ─────────────────────────────────────────────────── */

/**
 * Does this letter have a recording?
 *
 * @param {string} volKey
 * @param {string} letterId
 * @returns {boolean}
 */
export function hasAudio(volKey, letterId) {
  const m = _mapFor(volKey);
  return !!(m && m[volKey + ':' + letterId]);
}

/**
 * Reader code of a letter's FIRST track — what the hero button badges
 * ("Read by Benjamin" etc.) key off. Null when the manifest is absent or has
 * no entry for the letter.
 *
 * @param {string} volKey
 * @param {string} letterId
 * @returns {string | null}
 */
export function firstReaderCode(volKey, letterId) {
  const m = _mapFor(volKey);
  const parts = m && m[volKey + ':' + letterId];
  return (parts && parts[0] && parts[0][1]) || null;
}

/**
 * Does ANY letter in this collection have a recording? (Drives the
 * collection-level play button.) Cached per volKey after the first real
 * answer — the manifest never changes within a session.
 *
 * @param {string} volKey
 * @returns {boolean}
 */
export function collectionHasAudio(volKey) {
  if (_volHasAudio.has(volKey)) return _volHasAudio.get(volKey);
  const m = _mapFor(volKey);
  // Do NOT cache a pre-corpus "no": the manifest arrives lazily, and a poisoned
  // false would hide the play button for the rest of the session.
  if (!m) return false;
  const prefix = volKey + ':';
  let found = false;
  for (const k in m) {
    if (k.lastIndexOf(prefix, 0) === 0) { found = true; break; }
  }
  _volHasAudio.set(volKey, found);
  return found;
}

/**
 * Chapter-start offset (seconds) into a book's whole-book track, or 0 when
 * the chapter index doesn't cover it (chapter 1, unknown book, no scan row).
 *
 * @param {string} volKey
 * @param {string} bookId
 * @param {number | null | undefined} chapterNum
 * @returns {number}
 */
export function bibleChapterStart(volKey, bookId, chapterNum) {
  const n = Number(chapterNum);
  if (!Number.isInteger(n) || n < 2) return 0;   // ch1 = book start (keep the book intro)
  const map = _g().BIBLE_AUDIO_CHAPTERS;
  const secs = map && map[volKey + ':' + bookId];
  const at = Array.isArray(secs) ? Number(secs[n - 1]) : NaN;
  return Number.isFinite(at) && at > 0 ? at : 0;
}

/**
 * Range-compilation tracks for a collection (WTLB parts 1-7), or null.
 *
 * @param {string} volKey
 * @returns {Array<any[]> | null}
 */
export function sectionsFor(volKey) {
  const s = _sections();
  return (s && s[volKey]) || null;
}

/**
 * A volume's range compilations as the tracks they play: what playSection queues (from its start index) and what a
 * compilation's Download saves (item 8 follow-up), so the two can never name different files. One keyless track a
 * file (a section keeps key null: one file, one resume position).
 *
 * @param {string} volKey
 * @param {string | null} [collectionLabel]
 * @returns {Track[]}
 */
export function sectionTracks(volKey, collectionLabel) {
  return (sectionsFor(volKey) || []).map((s) => ({
    key: null,
    title: s[0] || '',
    sub: collectionLabel || null,
    url: trackUrl(s[1]),
    readerCode: s[2] || '',
    partLabel: null,
  }));
}

/**
 * Human label for a reader code, or null when unknown. The names live in
 * audio-track.js's AUDIO_READERS registry — one source of truth shared with the
 * listening desk's Voice chips and the Settings default-reader options.
 *
 * @param {string} code - 'B' | 'T' | 'V' | 'M'
 * @returns {string | null}
 */
export function readerLabel(code) {
  return audioReaderLabel(code);
}

/* ── preferred reader (settings.letterReader) ─────────────────────────────
   'auto' (the default) means the manifest's own choice — Benjamin supersedes,
   then reader rank. A listener who prefers one voice sets it once in Settings
   and every letter that HAS a reading by that reader starts with it; letters
   that don't simply keep the primary. App keeps this in step through
   AudioPlayer.setPreferredReader (screen-routes), so the player never reaches
   into React state. */

/** @type {string} '' = automatic. */
let _preferredReader = '';

/**
 * @param {unknown} code - a reader code, or 'auto'/'' for the manifest primary
 * @returns {void}
 */
export function setPreferredReader(code) {
  const next = typeof code === 'string' && code !== 'auto' && readerLabel(code) ? code : '';
  _preferredReader = next;
}

/**
 * The reader a start should use when the caller named none: the preference,
 * but only when this item actually HAS a reading by that reader. Null means
 * "leave the manifest's primary alone" — the one-line fallback.
 *
 * @param {string} volKey
 * @param {{ id?: string, title?: string } | null | undefined} item
 * @param {string | null | undefined} collectionLabel
 * @returns {string | null}
 */
export function _preferredReaderFor(volKey, item, collectionLabel) {
  if (!_preferredReader || !item) return null;
  return _renditionByReader(volKey, item, collectionLabel, _preferredReader) ? _preferredReader : null;
}

/**
 * Manifest parts for one corpus item → Tracks. Empty array when the item has
 * no audio (which is how playCollection skips it).
 *
 * @param {string} volKey
 * @param {{ id?: string, title?: string } | null | undefined} item
 * @param {string | null | undefined} collectionLabel
 * @returns {Track[]}
 */
export function _tracksFor(volKey, item, collectionLabel) {
  const m = _mapFor(volKey);
  if (!m || !item || !item.id) return [];
  const key = volKey + ':' + item.id;
  const parts = m[key];
  if (!parts || !parts.length) return [];
  // A per-chapter Bible edition titles by CHAPTER (owner directive
  // 2026-08-10): a book's parts share one item title, so 150 desk rows, 150
  // shelf rows, 150 bar titles and 150 native cards all read "Psalms" and told
  // the listener nothing about which one they were hearing. "Psalms 117" is
  // the recording's name; the chapter still rides partLabel as well, which is
  // where the desk's head line, the jump-to-text and the read credit read it.
  const byChapter = _isBibleVol(volKey) && parts.length > 1;
  const title = item.title || '';
  return parts.map((p) => {
    const partLabel = p[2] || null;
    const chapter = byChapter ? _chapterOfLabel(partLabel) : 0;
    return {
      key,
      title: chapter ? title + ' ' + chapter : title,
      sub: collectionLabel || null,
      url: _assetUrlFor(volKey, p[0]),
      readerCode: p[1] || '',
      partLabel,
    };
  });
}

/**
 * Every rendition of one letter, PRIMARY first. The manifest holds the single
 * reading the app picked (Benjamin supersedes, then reader rank); AUDIO_ALTERNATES
 * carries the other complete readings of the same letter so a listener can
 * choose a voice. Each entry is a standalone queue — never interleaved with
 * another reader's parts. Empty when the letter has no audio at all; Bible
 * editions have exactly one voice, so they return the primary alone.
 *
 * @param {string} volKey
 * @param {{ id?: string, title?: string } | null | undefined} item
 * @param {string | null | undefined} collectionLabel
 * @returns {Rendition[]}
 */
export function renditionsFor(volKey, item, collectionLabel) {
  const primary = _tracksFor(volKey, item, collectionLabel);
  if (!primary.length) return [];
  /** @type {Rendition[]} */
  const out = [{ reader: primary[0].readerCode || '', tracks: primary }];
  if (_isBibleVol(volKey)) return out;
  const alternates = _alternates();
  const key = volKey + ':' + (item && item.id);
  const pairs = alternates && item && item.id ? alternates[key] : null;
  if (!Array.isArray(pairs)) return out;
  for (const pair of pairs) {
    const reader = pair && pair[0];
    const rows = pair && pair[1];
    if (!reader || !Array.isArray(rows) || !rows.length) continue;
    out.push({
      reader,
      tracks: rows.map((row) => ({
        key,
        title: (item && item.title) || '',
        sub: collectionLabel || null,
        url: trackUrl(row[0]),
        readerCode: reader,
        partLabel: row[1] || null,
      })),
    });
  }
  return out;
}

/**
 * The rendition a listener asked for, or null when this letter has no reading
 * by that reader. Kept separate so every caller resolves a reader the same way.
 *
 * @param {string} volKey
 * @param {{ id?: string, title?: string } | null | undefined} item
 * @param {string | null | undefined} collectionLabel
 * @param {string | null | undefined} reader
 * @returns {Rendition | null}
 */
/**
 * The tracks a row's own Play starts with for `item`: the listener's chosen reader where that reader read it, else
 * the manifest's primary reading (the unit a download saves, item 8). [] when the item has no recording.
 *
 * @param {string} volKey
 * @param {{ id?: string, title?: string } | null | undefined} item
 * @param {string | null | undefined} collectionLabel
 * @returns {Track[]}
 */
export function playbackTracks(volKey, item, collectionLabel) {
  const reader = _preferredReaderFor(volKey, item, collectionLabel);
  const chosen = reader ? _renditionByReader(volKey, item, collectionLabel, reader) : null;
  return chosen ? chosen.tracks : _tracksFor(volKey, item, collectionLabel);
}

export function _renditionByReader(volKey, item, collectionLabel, reader) {
  if (!reader) return null;
  return renditionsFor(volKey, item, collectionLabel).find((r) => r.reader === reader) || null;
}

/**
 * Advance a queue INTO the start item's parts — the part-grained half of the
 * forward-only horizon.
 *
 * ONE definition, called by playCollection (which chooses the part) and by the
 * boot rebuild (which has to reproduce it). Two copies of this slice is exactly
 * how the two levels drifted apart: playCollection had the part logic, the
 * rebuild had only the key logic, and nothing made them agree.
 *
 * `spi` is clamped to the start item's own run of parts, so a snapshot claiming
 * a part the letter no longer has lands on its last one rather than slicing
 * past the letter into the next. A run of 0 means the key is not at the front
 * of this queue at all, and then there is no part horizon to apply — returning
 * the queue unchanged rather than `slice(-1)`, which would keep ONE track.
 *
 * @param {Track[]} queue
 * @param {string|null|undefined} startKey
 * @param {number|null|undefined} startPartIndex
 * @returns {Track[]}
 */
export function _slicePartHorizon(queue, startKey, startPartIndex) {
  const spi = Math.floor(Number(startPartIndex) || 0);
  if (!(spi > 0) || !startKey) return queue;
  let run = 0;
  while (run < queue.length && queue[run].key === startKey) run++;
  // A run of 0 means the startKey is not at the front of this queue at all —
  // in practice, absent from it. Return the queue UNCHANGED rather than
  // falling through to `slice(-1)`, which keeps exactly ONE track: a wrong
  // answer that looks like a horizon. Pinned by 'the run === 0 guard: a start
  // letter that is GONE' in audio-player.test.js. That case was impossible until
  // audio-player-5: the same condition used to leave _rebuildRestoredQueue's `qi`
  // at -1 (its fallback sat behind an `else` and could not run while `r.key` was
  // set), so the bar came back EMPTY whatever this line did. Both halves measured.
  if (run === 0) return queue;
  return queue.slice(Math.min(spi, run - 1));
}

/**
 * The study that owns a chapter id, from the lazy studies corpus
 * (bible-studies.js: BIBLE_STUDIES). Null until it lands or for an unknown id.
 *
 * @param {string | null | undefined} chapterId
 * @returns {any}
 */
export function _studyOfChapter(chapterId) {
  const studies = _g().BIBLE_STUDIES;
  if (!chapterId || !Array.isArray(studies)) return null;
  return studies.find((st) => st && Array.isArray(st.chapters) && st.chapters.some((c) => c && c.id === chapterId)) || null;
}

/**
 * A collection's caller-ordered items (preface first where one exists), read
 * from the lazy VOT registry globals. Null when that registry has not landed —
 * every caller then falls back to the smaller queue it can build alone.
 *
 * A STUDY'S CHAPTERS ARE ITS COLLECTION (2026-09-20). 'study' is no entry in
 * COL_BY_KEY — its recordings ride AUDIO_MANIFEST under "study:<chapterId>" —
 * so a study chapter's Listen built a queue of one and stop() dropped the bar
 * at the chapter's end, where a Bible chapter runs on into the next. The study
 * that owns the chapter is the collection; its chapters are the items
 * (recordings only, playCollection skips the rest). Needs the chapter id to
 * know WHICH study: without one there is nothing to answer.
 *
 * @param {string} volKey
 * @param {string} [itemId] the letter / chapter the caller holds (studies only)
 * @returns {Array<any> | null}
 */
export function _collectionItems(volKey, itemId) {
  const g = _g();
  if (volKey === 'study') {
    const study = _studyOfChapter(itemId);
    return study ? study.chapters : null;
  }
  const col = typeof g.COL_BY_KEY !== 'undefined' && g.COL_BY_KEY ? g.COL_BY_KEY.get(volKey) : null;
  if (!col || typeof g.colLetterArr !== 'function') return null;
  const preface = typeof g.colPreface === 'function' ? g.colPreface(col) : null;
  const letters = g.colLetterArr(col) || [];
  return preface ? [preface, ...letters] : letters;
}

/**
 * Where a stored recording sits in the LIVE corpus: the item it belongs to,
 * which of that item's renditions holds this exact asset, and which part or
 * chapter the asset is. Null when no manifest carries the URL at all — a
 * retired recording, or a legacy whole-book Bible asset whose edition now
 * ships per chapter — which is precisely when rebuilding a queue around it
 * would play something the listener never chose.
 *
 * Identity is the immutable URL, never the stored partLabel: the label is
 * display data a future manifest may reword, the URL cannot change.
 *
 * @param {{ key: string | null, title: string, sub: string | null, url: string }} track
 * @returns {{ volKey: string, id: string, bible: boolean, partIndex: number, reader: string } | null}
 */
export function _locateTrack(track) {
  const key = track && typeof track.key === 'string' ? track.key : '';
  const divider = key.indexOf(':');
  if (divider < 1 || divider >= key.length - 1) return null;
  const volKey = key.slice(0, divider);
  const id = key.slice(divider + 1);
  if (isSongKey(key)) return null;   // songs live in the catalog, not in any manifest (playTrack's song arm)
  if (_isBibleVol(volKey)) {
    const manifest = _bibleManifest();
    const parts = manifest && manifest[key];
    if (!Array.isArray(parts)) return null;
    const at = parts.findIndex((p) => p && _assetUrlFor(volKey, p[0]) === track.url);
    return at < 0 ? null : { volKey, id, bible: true, partIndex: at, reader: '' };
  }
  for (const rendition of renditionsFor(volKey, { id, title: track.title || '' }, track.sub)) {
    const at = rendition.tracks.findIndex((t) => t.url === track.url);
    if (at >= 0) return { volKey, id, bible: false, partIndex: at, reader: rendition.reader || '' };
  }
  return null;
}

/** @param {any[]} songs @returns {Track[]} */
export function _songTracks(songs) {
  /** @type {Track[]} */
  const out = [];
  for (const song of songs) { const t = songTrack(song); if (t) out.push(t); }
  return out;
}
/** volKey of a "volKey:id" track key, or '' (range-compilation sections carry no key). */
export function _volKeyOf(key) {
  if (typeof key !== 'string') return '';
  const at = key.indexOf(':');
  return at > 0 ? key.slice(0, at) : '';
}
