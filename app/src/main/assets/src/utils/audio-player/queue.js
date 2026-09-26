// @ts-check
/* audio-player/queue — building queues: the play* entry points, the forward-only horizon, the site
   order a spent unit continues into (w-audio-continue), and the listener's queue edits. */

import { normalizeAudioTrack, songIdOfKey } from '../audio-track.js';
import { songById } from '../song-catalog.js';
import {
  bibleChapterStart,
  _collectionItems,
  _locateTrack,
  _preferredReaderFor,
  _renditionByReader,
  sectionTracks,
  _studyOfChapter,
  _tracksFor,
  _volKeyOf,
} from './catalog.js';
import {
  _g,
  _isBibleVol,
  _isSong,
  LOAD_FAIL_MSG,
  _mapFor,
  _notify,
  OFFLINE_MSG,
  _state,
  _toast,
} from './core.js';
import { _countPlay } from './credit.js';
import { _seekOnMetadata, _start } from './engine.js';
import { _syncMediaSessionActions } from './media-session.js';
import { _offlineNotice, _offlineRefuses } from './offline.js';
import {
  _pendingRestore,
  _persist,
  _rememberOutgoingPosition,
  _resumeAt,
  _setPendingRestore,
  _setSource,
  _source,
} from './persist.js';
import { playSongs } from './songs.js';

/** @typedef {import('../audio-player.js').Track} Track */

/**
 * Play a recorded Bible book, queueing THAT BOOK's chapters from the one
 * tapped (the letters' album behavior, book-scoped). Book titles come from
 * BIBLE_AUDIO_BOOKS, which ships in the same lazy bundle as the Bible corpus —
 * any screen showing a Listen pill has it by construction.
 *
 * @param {{ volKey: string, bookId: string, label?: string | null, chapterNum?: number | null, noResume?: boolean }} opts
 * @returns {void}
 */
export function playBibleBook(opts) {
  const o = opts || /** @type {any} */ ({});
  const books = Array.isArray(_g().BIBLE_AUDIO_BOOKS) ? _g().BIBLE_AUDIO_BOOKS : [];
  // Queue scope is THE BOOK (owner directive 2026-08-10): a chapter tap
  // queues that book's remaining chapters, never the rest of the Bible up
  // front. Since w-audio-continue (2026-09-11) the queue EXTENDS into the next
  // book of the same edition as the last chapter ends (_extendQueue, _booksAfter)
  // — the horizon is a book at a time, the walk is the whole edition.
  const items = books.filter((b) => b[0] === o.bookId).map((b) => ({ id: b[0], title: b[1] }));
  if (!items.length) return;
  // Two edition SHAPES, and the branch is on the shape, not on the edition id
  // — every shipped edition (BRM, WOP, WEB) is PER-CHAPTER, carrying one
  // manifest part per chapter, so "play chapter N" is a queue POSITION. The
  // retired whole-book shape carries one part per book, so there it is a SEEK
  // into the book track via BIBLE_AUDIO_CHAPTERS (loadedmetadata timing — the
  // restore contract). A fourth edition of either shape needs no change here.
  const m = _mapFor(o.volKey);
  const parts = (m && m[o.volKey + ':' + o.bookId]) || [];
  const perChapter = parts.length > 1;
  const n = Number(o.chapterNum);
  const started = playCollection({
    volKey: o.volKey, items, collectionLabel: o.label || null, startId: o.bookId,
    startPartIndex: perChapter && Number.isInteger(n) && n >= 2 ? Math.min(n - 1, parts.length - 1) : 0,
    noResume: !!o.noResume,
  });
  if (perChapter || !started) return;
  // A whole-book edition seeks INTO the book track. The chapter the reader
  // actually tapped outranks a remembered position: playCollection queued its
  // resume listener first, so this one — added second — wins the assignment.
  _seekOnMetadata(bibleChapterStart(o.volKey, o.bookId, o.chapterNum));
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

/* ── playback entry points ────────────────────────────────────────────── */

/**
 * Play one letter (all of its parts, in order). `reader` picks a cross-reader
 * alternate rendition when the letter has one; with none named, the listener's
 * default voice (settings.letterReader) applies where this letter has a
 * reading by it. No-op when the letter has no audio; leaves state untouched
 * and toasts when offline.
 *
 * @param {{ volKey: string, letter: { id?: string, title?: string }, collectionLabel?: string, reader?: string }} opts
 * @returns {void}
 */
export function playLetter(opts) {
  const o = opts || /** @type {any} */ ({});
  let queue = _tracksFor(o.volKey, o.letter, o.collectionLabel);
  if (!queue.length) return;
  const reader = o.reader || _preferredReaderFor(o.volKey, o.letter, o.collectionLabel);
  // Album behavior (owner directive 2026-08-08): a hero Listen queues the
  // WHOLE collection positioned at this letter, so the bar's prev/next walk
  // neighboring letters and playback continues past the letter's end. The
  // registry globals live in index.html; when absent (tests, stripped
  // harnesses) the letter still plays alone.
  const items = o.letter && o.letter.id ? _collectionItems(o.volKey, o.letter.id) : null;
  if (items && items.some((item) => item && item.id === o.letter.id)) {
    playCollection({ volKey: o.volKey, items, collectionLabel: o.collectionLabel, startId: o.letter.id, startReader: reader });
    return;
  }
  const rendition = _renditionByReader(o.volKey, o.letter, o.collectionLabel, reader);
  if (rendition) queue = rendition.tracks;
  if (_offlineRefuses(queue)) { _toast(OFFLINE_MSG); return; }
  // R8b — a NEW queue replacing this one is a boundary like any other:
  // without this the outgoing recording loses up to five seconds (the
  // throttle window) every time the listener starts something else.
  _rememberOutgoingPosition();
  _setPendingRestore(null);
  _setSource({ mode: 'letter', volKey: o.volKey, label: o.collectionLabel || null });
  _state.queue = queue;
  _state.qi = 0;
  _countPlay();
  _start();
  _seekOnMetadata(_resumeAt(_state.queue[_state.qi]));
}

/**
 * Play a whole collection. `items` is caller-ordered (preface first where one
 * exists); items without a manifest entry are skipped, multi-part letters are
 * expanded in order. `startId` picks the starting track when present — and
 * (owner directive 2026-08-09) sets a FORWARD-ONLY horizon: the queue holds
 * the chosen letter and what follows it, never the letters behind it. A
 * reader stepping backward past where they began is disorienting; prev()
 * simply clamps at the chosen start. `startReader` swaps the START letter (and
 * only that letter) for another reader's complete rendition of it — the rest
 * of the collection keeps the manifest's primary reading.
 *
 * `startPartIndex` advances the horizon INTO the start item's parts (a
 * per-chapter Bible edition choosing chapter N) — same forward-only rule,
 * chapter-grained.
 *
 * @param {{ volKey: string, items: Array<{ id?: string, title?: string }>, collectionLabel?: string, startId?: string, startReader?: string, startPartIndex?: number, noResume?: boolean }} opts
 * @returns {boolean} false when nothing started (no recordings, or offline with none of them downloaded)
 */
export function playCollection(opts) {
  const o = opts || /** @type {any} */ ({});
  const items = Array.isArray(o.items) ? o.items : [];
  /** @type {Track[]} */
  let queue = [];
  for (const item of items) {
    const tracks = _tracksFor(o.volKey, item, o.collectionLabel);
    for (const t of tracks) queue.push(t);
  }
  if (!queue.length) return false;
  let startKey = null;
  if (o.startId) {
    const wanted = o.volKey + ':' + o.startId;
    const at = queue.findIndex((t) => t.key === wanted);
    if (at >= 0) { startKey = wanted; queue = queue.slice(at); }
  }
  let startReader = null;
  if (startKey) {
    const startItem = items.find((item) => item && item.id === o.startId);
    // No explicit voice = the listener's default one, where this letter has a
    // reading by it (settings.letterReader; 'auto' resolves to null here).
    const wanted = o.startReader || _preferredReaderFor(o.volKey, startItem, o.collectionLabel);
    const rendition = wanted ? _renditionByReader(o.volKey, startItem, o.collectionLabel, wanted) : null;
    if (rendition) {
      let end = 0;
      while (end < queue.length && queue[end].key === startKey) end++;
      queue = rendition.tracks.concat(queue.slice(end));
      startReader = wanted;
    }
    // Part/chapter-grained horizon, applied AFTER the voice swap (2026-08-10)
    // so a chosen READING and a chosen PART compose — a library row that names
    // "Part 2, read by Timothy" rebuilds to exactly that, where the older
    // order let the rendition swap re-grow the parts the index had trimmed.
    queue = _slicePartHorizon(queue, startKey, o.startPartIndex);
  }
  // A letter the listener CHOSE (startId) must itself be on the phone (or a reading of it): offline, it is never
  // silently swapped for a later downloaded one. Play all (no start) plays what is on the phone from the top.
  if (_offlineRefuses(startKey ? queue.filter((t) => t.key === startKey) : queue)) { _toast(OFFLINE_MSG); return false; }
  // R8b — a NEW queue replacing this one is a boundary like any other:
  // without this the outgoing recording loses up to five seconds (the
  // throttle window) every time the listener starts something else.
  _rememberOutgoingPosition();
  _setPendingRestore(null);
  _setSource({ mode: 'collection', volKey: o.volKey, label: o.collectionLabel || null, startKey, startReader,
    startPartIndex: startKey ? Math.floor(Number(o.startPartIndex) || 0) : 0 });
  _state.queue = queue;
  _state.qi = 0;
  _countPlay();
  _start();
  // Durable resume consults the STARTING track only: everything queued behind
  // it is being reached in order, from its beginning. `noResume` exists for
  // the desk's voice switch — its promise is "starts this again", and a
  // remembered position in the OTHER voice would drop the listener
  // mid-sentence in a recording with different pacing.
  if (!o.noResume) _seekOnMetadata(_resumeAt(_state.queue[_state.qi]));
  return true;
}

/**
 * Play a range-compilation section. The chosen section and the ones that
 * FOLLOW it are queued (the same forward-only horizon as playCollection);
 * next()/prev() walk between the remaining parts.
 *
 * @param {string} volKey
 * @param {number} index
 * @param {string} [collectionLabel]
 * @returns {void}
 */
export function playSection(volKey, index, collectionLabel) {
  const all = sectionTracks(volKey, collectionLabel);
  if (!all.length) return;
  const startIndex = Math.max(0, Math.min(index || 0, all.length - 1));
  const queue = all.slice(startIndex);
  if (_offlineRefuses(queue)) { _toast(OFFLINE_MSG); return; }
  // R8b — a NEW queue replacing this one is a boundary like any other:
  // without this the outgoing recording loses up to five seconds (the
  // throttle window) every time the listener starts something else.
  _rememberOutgoingPosition();
  _setPendingRestore(null);
  _setSource({ mode: 'section', volKey, label: collectionLabel || null, startIndex });
  _state.queue = queue;
  _state.qi = 0;
  _countPlay();
  _start();
  // Section compilations (the 2-hour WTLB parts) are the best resume case of
  // all — same consult as every other entry point.
  _seekOnMetadata(_resumeAt(_state.queue[0]));
}

/**
 * Play one previously-saved or recently-played recording. Only normalized VOT
 * release assets can become a queue, including after a backup import, so this
 * is not an arbitrary remote-audio loader.
 *
 * CONTINUATION (owner directive 2026-08-10). A library row is a PLACE in the
 * corpus, not an island: it rebuilds the queue AROUND the recording, so
 * listening carries on past its last second exactly as it would had the same
 * recording been started from its own screen —
 *   - a Bible chapter rebuilds its BOOK, positioned at that chapter;
 *   - a letter rebuilds its collection from that letter forward (the s4
 *     forward-only album queue), on the RENDITION the row actually names;
 *   - anything the manifests no longer carry — a legacy whole-book Bible
 *     asset, a range compilation, a letter whose registry has not landed —
 *     still plays alone, which is the only case where a queue of one is the
 *     truth rather than a dead end four minutes long.
 * Every branch consults the per-recording resume map (playBibleBook and
 * playCollection each do their own `_resumeAt`), so the position the row
 * promises is honored in all three. There is no explicit chapter TAP on this
 * path, so nothing outranks that resume.
 *
 * @param {unknown} track
 * @returns {void}
 */
export function playTrack(track) {
  // No blanket offline refusal (item 8): playBibleBook and playCollection check for themselves, and the lone
  // track below is checked before any state changes - "On this phone", the shelves and Resume last play through here.
  const normalized = normalizeAudioTrack(track);
  if (!normalized) return;
  if (_isSong(normalized)) {
    // A song row is a PLACE in its family: the versions from this one on. A
    // taken-down song (hid) never plays; a hidden duplicate plays its kept
    // twin. Without a catalog the row still plays alone, below.
    const own = songById(songIdOfKey(normalized.key));
    const song = own && own.hid && own.dup ? songById(own.dup) : own;
    if (song && song.hid) { _toast(LOAD_FAIL_MSG); return; }
    if (song && playSongs({ filter: { family: song.f }, startId: song.id, label: normalized.sub || undefined })) return;
  }
  const at = _locateTrack(normalized);
  if (at && at.bible) {
    // partIndex + 1 IS the chapter for a per-chapter edition, and 1 for a
    // whole-book one (whose chapter-start offset is 0, leaving resume to win).
    playBibleBook({ volKey: at.volKey, bookId: at.id, label: normalized.sub, chapterNum: at.partIndex + 1 });
    return;
  }
  if (at) {
    const items = _collectionItems(at.volKey, at.id);
    if (items && items.some((item) => item && item.id === at.id)) {
      playCollection({
        volKey: at.volKey, items, collectionLabel: normalized.sub, startId: at.id,
        // The row named a voice and a part; the rebuilt queue must open on
        // exactly those, not on the manifest's primary or the reader default.
        startReader: at.reader || undefined, startPartIndex: at.partIndex,
      });
      return;
    }
  }
  // R8b — a NEW queue replacing this one is a boundary like any other:
  // without this the outgoing recording loses up to five seconds (the
  // throttle window) every time the listener starts something else.
  if (_offlineRefuses([normalized])) { _offlineNotice(normalized); return; }
  _rememberOutgoingPosition();
  _setPendingRestore(null);
  _setSource({ mode: 'custom', volKey: '', label: normalized.sub });
  _state.queue = [normalized];
  _state.qi = 0;
  _countPlay();
  _start();
  // What makes every unresolvable Listening Library row still pick up where the
  // reader left off instead of restarting from zero.
  _seekOnMetadata(_resumeAt(normalized));
}

/* ── the site order (w-audio-continue, 2026-09-11) ──────────────────────────
   A reader who pressed Listen once never touches the phone again: a spent collection continues
   into the next one in catalogue order (COLLECTIONS, the Home cards' order — only entries WITH a
   card; Hidden Manna has none and is never entered uninvited), a spent Bible book into the next
   book of the same edition (BIBLE_AUDIO_BOOKS order); a carded collection with no recordings is
   passed over; the order ENDS at its last unit — no wrap. There is no switch on this: Pause is
   the off switch, and a setting nobody asked for is a setting to explain, test and maintain (the
   Orchestrator, 2026-09-11). Everything here is synchronous — the registries are in memory
   whenever anything from them is playing — so the seam stays inside the 'ended' task on the one
   element, which is what carries the Listen tap's activation across every boundary. Screen
   following is NOT this module's business: hooks/use-audio-follow.js watches the unit boundary.
   ─────────────────────────────────────────────────────────────────────────── */

/**
 * A track from another collection is starting: the descriptor follows it, with the horizon
 * cleared (the start key belonged to the collection being left). Bible books share one volKey
 * per edition, so a book boundary changes nothing here — the snapshot's `key` names the book.
 *
 * @param {Track} track
 * @returns {void}
 */
export function _crossInto(track) {
  if (!_source || _source.mode !== 'collection') return;
  const volKey = _volKeyOf(track.key);
  if (!volKey || volKey === _source.volKey) return;
  _setSource({ mode: 'collection', volKey, label: track.sub || null, startKey: null, startReader: null, startPartIndex: 0 });
}

/**
 * The carded collections after `volKey` in site order, each with its items — the same items a
 * hero Listen would queue (_collectionItems: preface first, then the letters).
 *
 * @param {string} volKey
 * @returns {{ volKey: string, label: string | null, items: any[] }[]}
 */
function _collectionsAfter(volKey) {
  const cols = Array.isArray(_g().COLLECTIONS) ? _g().COLLECTIONS : [];
  const at = cols.findIndex((c) => c && c.volKey === volKey);
  if (at < 0) return [];
  return cols.slice(at + 1)
    .filter((c) => c && c.cardId)
    .map((c) => ({ volKey: c.volKey, label: c.label || null, items: _collectionItems(c.volKey) || [] }));
}

/**
 * The studies after the one owning `chapterId`, in BIBLE_STUDIES order, each a unit of its own
 * chapters (ra1, 2026-09-21: Lamb of God 14 -> Purity 1, the way a book runs into the next book).
 * A study with no recording is passed over by _extendQueue's empty-tracks rule.
 *
 * @param {string} chapterId
 * @returns {{ volKey: string, label: string | null, items: any[] }[]}
 */
function _studiesAfter(chapterId) {
  const studies = Array.isArray(_g().BIBLE_STUDIES) ? _g().BIBLE_STUDIES : [];
  const at = studies.indexOf(_studyOfChapter(chapterId));
  if (at < 0) return [];
  return studies.slice(at + 1)
    .filter((st) => st && Array.isArray(st.chapters))
    .map((st) => ({ volKey: 'study', label: st.title || null, items: st.chapters }));
}

/**
 * The books after `bookId` that this edition recorded, in canonical order, as one-item units.
 *
 * @param {string} volKey
 * @param {string} bookId
 * @returns {{ volKey: string, label: string | null, items: any[] }[]}
 */
function _booksAfter(volKey, bookId) {
  const books = Array.isArray(_g().BIBLE_AUDIO_BOOKS) ? _g().BIBLE_AUDIO_BOOKS : [];
  const at = books.findIndex((b) => Array.isArray(b) && b[0] === bookId);
  if (at < 0) return [];
  const m = _mapFor(volKey);
  const label = _source ? _source.label : null;
  return books.slice(at + 1)
    .filter((b) => ((m && m[volKey + ':' + b[0]]) || []).length > 0)
    .map((b) => ({ volKey, label, items: [{ id: b[0], title: b[1] }] }));
}

/**
 * Append the next unit of the site order to the queue. False when there is none — a queue that
 * is neither a collection nor a section run (a saved track, a lone letter with no registry), a
 * key-less last track outside a section run, or the end of the order. Idempotent: refusing twice
 * is the designed path at the end.
 *
 * @returns {boolean}
 */
export function _extendQueue() {
  // A songs queue is refused here like a custom one: songs never continue into
  // letters (README §1.1) — a songs queue ends, or wraps under repeat 'all'.
  if (!_source || (_source.mode !== 'collection' && _source.mode !== 'section')) return false;
  const last = _state.queue[_state.queue.length - 1];
  // A section run's tracks carry key null (one file, many letters); the run
  // belongs to its collection, so the site order continues from THAT (2026-09-20).
  const volKey = _source.mode === 'section' ? (_source.volKey || '') : (last ? _volKeyOf(last.key) : '');
  if (!volKey) return false;
  const units = _isBibleVol(volKey)
    ? _booksAfter(volKey, /** @type {string} */ (last.key).slice(volKey.length + 1))
    : volKey === 'study'
      ? _studiesAfter(/** @type {string} */ (last.key).slice(volKey.length + 1))
      : _collectionsAfter(volKey);
  for (const unit of units) {
    /** @type {Track[]} */
    const tracks = [];
    for (const item of unit.items) for (const t of _tracksFor(unit.volKey, item, unit.label)) tracks.push(t);
    if (!tracks.length) continue;   // carded, but nothing recorded yet — pass over it
    _state.queue = _state.queue.concat(tracks);
    return true;
  }
  return false;
}

/** @param {Track[]} queue */
function _commitQueueEdit(queue) {
  _state.queue = queue;
  const current = queue[_state.qi];
  // An edited SONGS queue stays a songs descriptor — its explicit ids, in the
  // edited order — never a `custom` queue: a custom queue persists every track
  // on every tick, which is the hazard a 900-song shuffle cannot afford.
  if (_source && _source.mode === 'songs' && queue.every(_isSong)) {
    _setSource({ ..._source, ids: queue.map((t) => songIdOfKey(t.key)), filter: null, startKey: null });
  } else {
    _setSource({ mode: 'custom', volKey: '', label: current ? current.sub : null });
  }
  // A queue edit is the one queue-SHAPE change with no track start behind it,
  // so the host media card's skip handlers have to be re-decided here.
  _syncMediaSessionActions();
  _persist();
  _notify();
}

/**
 * Remove one future item. The playing item is intentionally protected so a
 * mistaken tap cannot tear down an active stream.
 *
 * @param {number} index
 * @returns {boolean}
 */
export function removeUpcoming(index) {
  if (_pendingRestore) return false;
  const at = Math.floor(Number(index));
  if (!Number.isFinite(at) || at <= _state.qi || at >= _state.queue.length) return false;
  const queue = _state.queue.slice();
  queue.splice(at, 1);
  _commitQueueEdit(queue);
  return true;
}

/**
 * Reorder only future items. Keeping the current track fixed makes the
 * operation stable while a recording is streaming.
 *
 * @param {number} from
 * @param {number} to
 * @returns {boolean}
 */
export function moveUpcoming(from, to) {
  if (_pendingRestore) return false;
  const fromIndex = Math.floor(Number(from));
  const toIndex = Math.floor(Number(to));
  if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex) ||
      fromIndex <= _state.qi || fromIndex >= _state.queue.length ||
      toIndex <= _state.qi || toIndex >= _state.queue.length || fromIndex === toIndex) return false;
  const queue = _state.queue.slice();
  const [track] = queue.splice(fromIndex, 1);
  queue.splice(toIndex, 0, track);
  _commitQueueEdit(queue);
  return true;
}

/** @returns {boolean} */
export function clearUpcoming() {
  if (_pendingRestore || _state.qi + 1 >= _state.queue.length) return false;
  _commitQueueEdit(_state.queue.slice(0, _state.qi + 1));
  return true;
}
