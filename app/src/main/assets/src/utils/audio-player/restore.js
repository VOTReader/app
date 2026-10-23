// @ts-check
/* audio-player/restore — the restored bar's real queue, rebuilt on its first tap; and resuming across
   the update's self-reload and a close (the snapshot flushed on hide). */

import { AUDIO_BIBLE_RELEASE_PREFIX, normalizeAudioTrack } from '../audio-track.js';
import { loadSongCatalog, songQueue } from '../song-catalog.js';
import {
  playbackTracks,
  _renditionByReader,
  renditionsFor,
  sectionsFor,
  _slicePartHorizon,
  _songTracks,
} from './catalog.js';
import {
  _bibleManifest,
  _el,
  _g,
  _isBibleVol,
  late,
  _manifest,
  _notify,
  _pendingRestore,
  _setPendingRestore,
  _setSource,
  _state,
  trackUrl,
} from './core.js';
import { getPreciseTime, _markPaused, _startAt } from './engine.js';
import { _offlineNotice, _unreachable } from './offline.js';
import { _persist, _setLastPersistSec } from './persist.js';

/** @typedef {import('../audio-player.js').Track} Track */

/**
 * Reader-alternate restore fidelity: the saved letter's run in the rebuilt
 * queue becomes the rendition whose tracks include the saved URL, whichever
 * reader that is. Every lookup that doesn't line up returns the queue
 * untouched, so a missing corpus or a retired alternate simply resumes on the
 * primary rendition rather than losing the position.
 *
 * @param {any} restore - the pending-restore descriptor
 * @param {Track[]} queue
 * @returns {Track[]}
 */
function _withRestoredAlternate(restore, queue) {
  try {
    if (!restore.key || !restore.url) return queue;
    const at = queue.findIndex((t) => t.key === restore.key);
    if (at < 0) return queue;
    const divider = restore.key.indexOf(':');
    if (divider <= 0) return queue;
    const item = { id: restore.key.slice(divider + 1), title: queue[at].title };
    // The rendition that HOLDS the saved recording, whoever reads it. The saved URL is the one fact about what was
    // playing; the descriptor's startReader can name another voice (offline, a downloaded reading plays in place of
    // the chosen one), and trusting it resumed that voice at the other one's clock (the refutation of 2026-09-24, M2).
    const rendition = renditionsFor(restore.volKey, item, restore.label)
      .find((rd) => rd.tracks.some((t) => t.url === restore.url));
    if (!rendition) return queue;
    let end = at;
    while (end < queue.length && queue[end].key === restore.key) end++;
    return queue.slice(0, at).concat(rendition.tracks, queue.slice(end));
  } catch (_e) { return queue; }
}

/**
 * One item's tracks in the rebuilt queue, in the reading the play that built the queue gave it: the start letter in
 * the voice it was started in (startReader), every other letter in the listener's Letter Voice where that reader
 * recorded it, else its primary reading (playbackTracks, as playCollection and _extendQueue queue; ra5).
 *
 * @param {any} r - the pending-restore descriptor
 * @param {{ id: string, title?: string }} item
 * @returns {Track[]}
 */
function _rebuiltTracks(r, item) {
  const start = r.startReader && r.startKey === r.volKey + ':' + item.id
    ? _renditionByReader(r.volKey, item, r.label, r.startReader) : null;
  return start ? start.tracks : playbackTracks(r.volKey, item, r.label);
}

/**
 * Whole-book → per-chapter resume migration (2026-08-09, the BRM switch).
 *
 * A snapshot written before an edition moved to per-chapter tracks holds a
 * whole-book audio-bible-v1 URL and a clock measured against the WHOLE BOOK —
 * e.g. 9,000s into Genesis. The rebuilt queue is now one track per chapter, so
 * replaying that clock verbatim would seek 9,000s into a ~300s file: the
 * element reports 'ended' immediately and the listener's place is gone. Map
 * the book-relative time through BIBLE_AUDIO_CHAPTERS instead — the LAST
 * chapter start <= the saved time is the chapter, and the remainder is the
 * offset INSIDE that chapter.
 *
 * Every degradation lands on chapter 1 at 0. A deep seek into a short file is
 * the one outcome worth ruling out, so an absent/short index never guesses.
 *
 * @param {any} r - the pending-restore descriptor
 * @param {Track[]} queue - the rebuilt queue
 * @returns {{ qi: number, time: number } | null} null when nothing to migrate
 */
function _migrateWholeBookResume(r, queue) {
  if (!r || typeof r.url !== 'string' || typeof r.key !== 'string' || !r.key) return null;
  // Whole-book tracks exist on exactly one release, and only there.
  if (r.url.lastIndexOf(AUDIO_BIBLE_RELEASE_PREFIX, 0) !== 0) return null;
  if (queue.some((t) => t.url === r.url)) return null;   // still a whole-book queue
  const first = queue.findIndex((t) => t.key === r.key);
  if (first < 0) return null;
  let last = first;
  while (last + 1 < queue.length && queue[last + 1].key === r.key) last++;
  if (last === first) return null;   // one part = not per-chapter; nothing to map
  const map = _g().BIBLE_AUDIO_CHAPTERS;
  const secs = map && map[r.key];
  const saved = Math.max(0, Number(r.time) || 0);
  if (!Array.isArray(secs) || !secs.length) return { qi: first, time: 0 };
  let chapter = 0;
  for (let i = 0; i < secs.length; i++) {
    const at = Number(secs[i]);
    if (!Number.isFinite(at) || at > saved) break;
    chapter = i;
  }
  // An index longer than the queue's chapters means the two disagree — take
  // the last real chapter from its start rather than an unbacked offset.
  if (chapter > last - first) return { qi: last, time: 0 };
  return { qi: first + chapter, time: Math.max(0, saved - (Number(secs[chapter]) || 0)) };
}

/* THE PLACEHOLDER OUTLIVES ITS DESCRIPTOR while a rebuild waits for the lazy corpus or the song catalog. The
   descriptor is consumed before that wait, so a second tap cannot start a second rebuild; but until the real queue
   lands, the bar still holds its ONE placeholder track. A Next tapped in that window read the placeholder as the end
   of a queue of one and stopped the session (sweep v021). `_rebuilding` is that window, for the transport to wait
   on: set only while a rebuild is waiting, cleared once it has installed the queue or given up. A rebuild that
   needs no wait (the corpus already in memory, a custom queue) finishes inside the call and never opens it. */
/** What a rebuild did: 'queue' installed the real queue; 'placeholder' found nothing to rebuild from (the corpus
 *  failed to load, or the saved letter is gone) and resumed the bar's own one track; false started nothing.
 *  @typedef {'queue' | 'placeholder' | false} RebuildOutcome */
let _rebuilding = /** @type {Promise<RebuildOutcome> | null} */ (null);
let _waiting = false;
/* s32.1: the bar says Loading while the rebuild waits, so its button is Pause; a Pause tapped then takes the Play
   back. The rebuild then starts nothing and hands the bar its descriptor again (still the restored one, at its
   place), and the next Play starts at once from the corpus now in memory. */
let _startWanted = true;

/** The rebuild a restored bar's tap started, while it still waits for a corpus; null otherwise. @returns {Promise<RebuildOutcome> | null} */
export function _rebuildInFlight() { return _rebuilding; }

/** A Play/Pause tap while a rebuild waits for its corpus: whether it starts once the corpus lands flips (s32.1). */
export function _toggleRebuildStart() {
  _startWanted = !_startWanted;
  _state.status = _startWanted ? 'loading' : 'paused';
  _notify();
}

/**
 * Rebuild the full queue a _restoreFromSaved() bar stands in for, then start
 * at the saved track + position. Loads the lazy VOT corpus first when needed
 * (index.html's __loadVotCorpus is idempotent). True when it started; false when there was nothing to rebuild or,
 * offline, the saved recording is not on the phone (the bar stays the restored one: a caller that would act on the
 * rebuilt queue must not ask again, or it asks forever - W5). Called again while a rebuild still waits for its
 * corpus, it answers with that same rebuild.
 * @returns {Promise<boolean>}
 */
export function _rebuildRestoredQueue() {
  return _rebuildRestored().then((outcome) => outcome !== false);
}

/**
 * The same rebuild, saying WHICH queue it started. A caller that would step through the rebuilt queue (Next) needs
 * that: the placeholder fallback is the saved recording alone, and stepping past its one track ends the session and
 * erases the resume snapshot, so one Next with no corpus lost the listener's place (sweep v021's refutation).
 * @returns {Promise<RebuildOutcome>}
 */
export function _rebuildRestored() {
  if (_rebuilding) return _rebuilding;
  const p = _rebuild();
  if (_waiting) {
    _rebuilding = p;
    // Registered before any caller's own .then, so a caller acting on the result finds the window closed.
    const done = () => { if (_rebuilding === p) _rebuilding = null; };
    p.then(done, done);
  }
  return p;
}

/** @returns {Promise<RebuildOutcome>} */
async function _rebuild() {
  const r = _pendingRestore;
  if (!r) return false;
  // Offline, the saved recording itself must be on the phone (item 8): downloaded, or a song kept on it (W5: the
  // gate asked only for downloads, so a kept song was refused on the web). Refused, the bar stays the restored one.
  const saved = { key: typeof r.key === 'string' ? r.key : '', url: r.url };
  if (_unreachable(/** @type {any} */ (saved))) { _offlineNotice(saved); return false; }
  _setPendingRestore(null);
  // The bar this rebuild stands in for. Every queue change makes a new array (stop()'s ✕, any new play; a Next
  // in the wait joins this rebuild instead, sweep v021), so a different one after the awaits below means the reader
  // has moved on while the corpus loaded: the rebuild is void, never a resurrection of a bar they closed (sweep v82).
  const placeholder = _state.queue;
  const g = _g();
  // Only the awaits below can open the window: the wrapper reads `_waiting` the moment this returns to it. While
  // it is open the bar is still the restored one, so it keeps saying so: Next stays shown on the bar and live on
  // the desk, not hidden again by the one-track placeholder for as long as the corpus takes (sweep v021).
  _waiting = true;
  _state.restoring = true;
  _startWanted = true;
  _state.status = 'loading';
  _notify();
  try {
    if (r.mode === 'songs') {
      try { await loadSongCatalog(); } catch (_e) { /* no catalog — fall through to the placeholder track */ }
    } else if (r.mode !== 'custom') {
      try {
        if (_isBibleVol(r.volKey)) {
          if (!_bibleManifest() && typeof g.__loadBibleCorpus === 'function') await g.__loadBibleCorpus();
        } else if (!_manifest() && typeof g.__loadVotCorpus === 'function') await g.__loadVotCorpus();
      } catch (_e) { /* corpus load failed — fall through to the placeholder track */ }
    } else if (r.volKey) {
      // s31.1: an edited run goes on into the next unit of the site order, which needs the corpus by the time its
      // last track starts. Its own queue does not, so the load is asked for here and not waited on.
      const load = _isBibleVol(r.volKey) ? (_bibleManifest() ? null : g.__loadBibleCorpus) : (_manifest() ? null : g.__loadVotCorpus);
      if (typeof load === 'function') {
        try { void Promise.resolve(load()).catch(() => {}); } catch (_e) { /* no corpus: the run ends where it is */ }
      }
    }
  } finally {
    _waiting = false;
    _state.restoring = !!_pendingRestore;
  }
  if (_state.queue !== placeholder) return false;
  if (!_startWanted) { _setPendingRestore(r); _notify(); return false; }
  /** @type {Track[]} */
  let queue = [];
  if (r.mode === 'custom') {
    queue = Array.isArray(r.queue) ? r.queue.map(normalizeAudioTrack).filter(Boolean) : [];
  } else if (r.mode === 'songs') {
    // The same pure order a fresh playSongs used, replayed from the descriptor.
    queue = _songTracks(songQueue(r));
  } else if (r.mode === 'section') {
    // Forward-only horizon: rebuild only from the section the listener chose.
    const sections = (sectionsFor(r.volKey) || []).slice(r.startIndex || 0);
    queue = sections.map((s) => ({ key: null, title: s[0] || '', sub: r.label, url: trackUrl(s[1]), readerCode: s[2] || '', partLabel: null }));
  } else if (_isBibleVol(r.volKey)) {
    // Bible editions have no COL_BY_KEY registry — canonical book order ships
    // in the manifest bundle as BIBLE_AUDIO_BOOKS [[id, title], …]. Queue
    // scope is THE BOOK (owner directive 2026-08-10): whatever mode the
    // snapshot carries, only the saved track's book is rebuilt. Legacy
    // whole-Bible snapshots degrade to the same book scope via r.key.
    const books = Array.isArray(g.BIBLE_AUDIO_BOOKS) ? g.BIBLE_AUDIO_BOOKS : [];
    const items = books
      .filter((b) => r.key === r.volKey + ':' + b[0])
      .map((b) => ({ id: b[0], title: b[1] }));
    for (const item of items) {
      for (const t of _rebuiltTracks(r, item)) queue.push(t);
    }
  } else {
    const col = (typeof g.COL_BY_KEY !== 'undefined') ? g.COL_BY_KEY.get(r.volKey) : null;
    const pref = (col && typeof g.colPreface === 'function') ? g.colPreface(col) : null;
    const arr = (col && typeof g.colLetterArr === 'function') ? g.colLetterArr(col) : [];
    const items = r.mode === 'letter'
      ? [pref, ...arr].filter((i) => i && (r.key === r.volKey + ':' + i.id))
      : (pref ? [pref, ...arr] : arr);
    for (const item of items) {
      for (const t of _rebuiltTracks(r, item)) queue.push(t);
    }
  }
  // Forward-only horizon (owner directive 2026-08-09): a queue that began at
  // a chosen letter must rebuild from that letter, never regrowing the tracks
  // deliberately left behind it. Legacy snapshots without a startKey keep the
  // full rebuilt queue (a one-time transition; the next fresh queue records it).
  if (r.startKey && r.mode !== 'custom' && r.mode !== 'section' && r.mode !== 'songs') {
    const horizon = queue.findIndex((item) => item.key === r.startKey);
    if (horizon > 0) queue = queue.slice(horizon);
    // …and INTO its parts, which is the level this rebuild used to lose. The
    // slice above lands on part 1 because a multi-part letter shares one key,
    // so a listener who started at part 2 was handed part 1 again every boot.
    queue = _slicePartHorizon(queue, r.startKey, r.startPartIndex);
  }
  let resumeAt = r.time || 0;
  const fellBack = !queue.length;
  if (fellBack) {
    // Corpus/manifest unavailable (or the letter vanished) — play the
    // placeholder track the bar is already showing; it has a real URL.
    queue = _state.queue.slice();
  }
  // A pre-per-chapter snapshot's URL is gone from this queue and its clock is
  // book-relative — translate both before the url/key search below, which
  // would otherwise land on chapter 1 and seek the whole book's time into it.
  const migrated = _migrateWholeBookResume(r, queue);
  if (migrated) resumeAt = migrated.time;
  let qi = migrated ? migrated.qi : (r.url ? queue.findIndex((item) => item.url === r.url) : -1);
  if (qi < 0 && r.key) {
    // A rebuilt queue holds each letter in the reading a fresh play would queue
    // (_rebuiltTracks), so a listener resuming another reading of it (a voice
    // switch, a Letter Voice changed since, an offline swap) finds no url match.
    // Swap that one letter for the rendition that actually contains the saved track.
    queue = _withRestoredAlternate(r, queue);
    qi = r.url ? queue.findIndex((item) => item.url === r.url) : -1;
  }
  if (qi < 0 && r.key) {
    const hits = queue.map((t, i) => ({ t, i })).filter((x) => x.t.key === r.key);
    if (hits.length) {
      // Multi-part letters share a key; land on the saved part when possible.
      const withinKey = Math.max(0, Math.min(hits.length - 1, (r.qi || 0) - hits[0].i));
      qi = hits[withinKey].i;
    }
  }
  if (qi < 0) {
    // Nothing in this queue IS the saved track — the corpus dropped or renamed
    // the letter between sessions. This clamp has always existed for exactly that
    // case, and behind an `else` it could never run for a snapshot carrying a key,
    // which is every snapshot the app writes. qi stayed at -1, _start() read
    // queue[-1] and stop() threw away a queue that had just rebuilt correctly.
    // The floor is a shape guard, not a correctness guard, and a bite says so:
    // _restoreFromSaved already clamps r.qi at 0, and an empty queue ends in
    // stop() through queue[0] exactly as it would through queue[-1]. Only the
    // Math.min is load-bearing here (1 RED, on the shrunken-collection case).
    qi = Math.max(0, Math.min(r.qi || 0, queue.length - 1));
    // The saved clock is an offset into a recording that is NOT in this queue.
    // Carrying it across seeks an arbitrary distance into whatever the clamp
    // lands on — past the end, for a long position, which ends the track at once
    // and skips it. No position is the honest answer here; another recording's
    // position is not.
    resumeAt = 0;
  }
  // startPartIndex rides along, or the first persist after a restore drops the
  // horizon it just replayed and the SECOND boot regrows part 1.
  // A songs source keeps the session's repeat (_applySnapshot restored it).
  _setSource(r.mode === 'songs'
    ? { mode: 'songs', volKey: 'song', label: r.label, startKey: r.startKey || null, filter: r.filter, one: !!r.one, seed: r.seed, shuffle: !!r.shuffle, ids: r.ids, wrap: !!r.wrap, swaps: r.swaps || null }
    : { mode: r.mode, volKey: r.volKey, label: r.label, startKey: r.startKey || null, startIndex: r.startIndex, startReader: r.startReader || null, startPartIndex: r.startPartIndex || null });
  _state.queue = queue;
  _state.qi = qi;
  // The snapshot's own clock is authoritative here — it is the freshest thing
  // known about this exact track — so the boot restore does NOT consult the
  // per-recording map. Unchanged behavior; only the seek call is now shared.
  _startAt(() => resumeAt);
  return fellBack ? 'placeholder' : 'queue';
}

/* ── resume across the update's self-reload (Corbin, 2026-09-10) ──────────
   "reload should be seamless, instant, with a toast indicating what happened,
   and should otherwise land reader back exactly where they were before the
   update." For a listener that is the same recording at the EXACT clock,
   playing again.

   The periodic snapshot above is whole-second and up to ~5 s late, and the
   boot restore it feeds is a PAUSED bar. So: sw-register fires
   `vot:before-update-reload` right before reload(); while playing we refresh
   the snapshot and write a small sessionStorage record with the element's own
   currentTime (sessionStorage: this tab, this reload, gone with the tab — a
   flag that outlived its reload would resume a recording nobody asked for).
   The boot after the reload consumes the record, seeks the restored bar to
   that clock and tries play() without a gesture. Android's WebView allows it
   (mediaPlaybackRequiresUserGesture=false); a browser that refuses answers
   NotAllowedError — tried ONCE more 300 ms later when the reader's sticky
   activation says the tap already happened (the activation race, below) —
   and the update toast then carries the tap
   (utils/update-toast.js, reached through window.__votUpdateToastResume —
   bundle-d cannot import bundle-b). Paused or idle at the reload: no record. */
const RESUME_AFTER_UPDATE_KEY = 'vot-audio-resume-after-update';
const RESUME_AFTER_UPDATE_MAX_AGE_MS = 2 * 60 * 1000;
let _resumeAfterUpdateArmed = false;
/** Write from another module of the player (the binding is read-only outside this one). @param {typeof _resumeAfterUpdateArmed} v */
export function _setResumeAfterUpdateArmed(v) { _resumeAfterUpdateArmed = v; }

export function _onBeforeUpdateReload() {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const track = _state.queue[_state.qi];
    if (_state.status !== 'playing' || !_el || !track) { sessionStorage.removeItem(RESUME_AFTER_UPDATE_KEY); return; }
    const time = _el.currentTime || 0;
    _state.time = time;
    _setLastPersistSec(Math.floor(time));
    _persist();
    sessionStorage.setItem(RESUME_AFTER_UPDATE_KEY, JSON.stringify({ url: track.url, time, at: Date.now() }));
  } catch (_e) { /* storage blocked — the periodic snapshot is what remains */ }
}

/* ── the CLOSE with no reload event (2026-09-11, audio-clock-close-gap-1) ──
   A closed tab is not an update: nothing fires vot:before-update-reload, and
   what the next boot found was the periodic snapshot — up to ~5 s late (the
   Verifier read the restored bar ~14 s behind after a browser close). pagehide
   is the last event a document gets — tab close, navigation away, the Android
   WebView's destroy — and the element is still live in it: write the snapshot
   then, with the clock getPreciseTime() defines (the element from
   HAVE_METADATA on, else the intent — never an unloaded element's 0).
   visibilitychange → hidden is the phone's
   background, where the audio keeps playing and the periodic writer keeps
   running: one more point, so a kill soon after backgrounding loses less.
   Only while PLAYING: a paused bar's clock is the pause's, already written;
   re-reading a stopped element would let a stray value overwrite it. */
export function _flushOnHide() {
  if (_state.status !== 'playing' || !_el) return;
  _state.time = getPreciseTime();   // the one definition of the clock right now
  _setLastPersistSec(Math.floor(_state.time));
  _persist();
}
/* ── the activation race (update-resume-activation-race-1, 2026-09-11) ────
   The document reloaded for an update has the reader's STICKY activation from
   its first instant (navigator.userActivation.hasBeenActive — the tap that
   started the recording, kept across the reload) but its TRANSIENT activation
   arrives ~90–175 ms after document start, and a boot play() that lands before
   it is refused on the same boot that allows it 300 ms later (the Verifier's
   probe on 95's tree: play() held to +166 ms REFUSED, to +443 ms ALLOWED; 11 of
   11 local arms refused, 3 of 4 live arms resumed by themselves). So a refused
   resume with the sticky bit set is retried ONCE, RESUME_RETRY_MS later; a
   second refusal takes the toast path. An absent API is not "true" (older
   WebViews, jsdom): no retry. The retry is the same element at the same
   intended seek — no clock moves — and it stands down if anything else asked
   the element to play meanwhile, so audio is never asked to start twice. */
const RESUME_RETRY_MS = 300;
let _resumeRetried = false;

function _stickyActivation() {
  try { const u = navigator.userActivation; return !!u && u.hasBeenActive === true; } catch (_e) { return false; }
}

function _retryResumePlay() {
  if (!_resumeAfterUpdateArmed || !_el) return;                 // the toast path already ran, or the bar is gone
  if (!_el.paused) { _resumeAfterUpdateArmed = false; return; } // the reader's own tap asked for sound: nothing to add
  const p = _el.play();
  if (p && typeof p.then === 'function') p.then(() => { _resumeAfterUpdateArmed = false; }, (err) => { _playRefused(err); });
}

/** A play() the browser refused. NotAllowedError is the autoplay policy: the
 *  bar shows Play instead of a spinner, and if this was the update resume the
 *  update toast offers the tap — after the one retry above, when the reader's
 *  sticky activation says the tap already happened. Anything else is the
 *  element's 'error' path. */
function _playRefused(err) {
  if (!err || err.name !== 'NotAllowedError') return;
  _markPaused();
  if (!_resumeAfterUpdateArmed) return;
  if (!_resumeRetried && _stickyActivation()) {
    _resumeRetried = true;
    setTimeout(_retryResumePlay, RESUME_RETRY_MS);
    return;
  }
  _resumeAfterUpdateArmed = false;
  const offer = _g().__votUpdateToastResume;
  if (typeof offer === 'function') offer(() => { late.toggle(); });
}

export function _resumeAfterUpdate() {
  let rec = null;
  try {
    if (typeof sessionStorage === 'undefined') return;
    const raw = sessionStorage.getItem(RESUME_AFTER_UPDATE_KEY);
    if (!raw) return;
    sessionStorage.removeItem(RESUME_AFTER_UPDATE_KEY);         // consumed: never replayed
    rec = JSON.parse(raw);
  } catch (_e) { return; }
  if (!rec || !_pendingRestore || rec.url !== _pendingRestore.url) return;
  if (!(typeof rec.at === 'number' && Date.now() - rec.at < RESUME_AFTER_UPDATE_MAX_AGE_MS)) return;
  const time = Number(rec.time);
  if (Number.isFinite(time) && time >= 0) { _pendingRestore.time = time; _state.time = time; }
  _resumeAfterUpdateArmed = true;
  void _rebuildRestoredQueue();
}

// This module's verbs that the modules below it call (core.js `late`).
Object.assign(late, { _playRefused, _rebuildRestoredQueue, _setResumeAfterUpdateArmed });
