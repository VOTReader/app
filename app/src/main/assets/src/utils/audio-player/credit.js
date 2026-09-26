// @ts-check
/* audio-player/credit — what listening earns: a recording heard to its end (read credit, the Listening
   Library's counters) and a listening decision (a play, the recent and songs shelves). */

import { songIdOfKey } from '../audio-track.js';
import { _chapterOfTrack } from './catalog.js';
import {
  _g,
  _isBibleVol,
  _isSong,
  _library,
  _state,
} from './core.js';
import { _creditSectionLetter, _secHeard, _secKey, _sectionTableFor } from './sections.js';

/** A song the listener put on waits here until it really plays, then goes on Recently played (device check 09-25:
 *  an offline skip over a song that never played put it on the shelf). */
let _songRecordPending = false;
/** Write from another module of the player (the binding is read-only outside this one). @param {typeof _songRecordPending} v */
export function _setSongRecordPending(v) { _songRecordPending = v; }
/**
 * A recording finished playing to its end (owner directive 2026-08-09: a full
 * listen counts like a full read — the item's read count increments). Fired
 * from 'ended' BEFORE next() advances; range-compilation sections carry key
 * null and never notify. The App-side bridge (useReadProgress) owns the
 * actual counting.
 *
 * TWO completion grains, because the corpus has two (2026-08-10):
 *   - a LETTER is one recording that may be split across parts, so it scores
 *     when its LAST part ends and the same-key guard is what waits for it;
 *   - a BIBLE CHAPTER is a whole recording of its own. Every shipped edition
 *     is per-chapter and a book's chapters all share one key, so applying the
 *     letter guard there credited a 50-chapter book exactly once — and only
 *     when the queue happened to hold the whole book. Bible tracks therefore
 *     notify PER TRACK, independent of queue shape.
 */
export function _notifyListened() {
  try {
    const track = _state.queue[_state.qi];
    // A SONG IS NOT A READING (README §1.1): a finished song marks no letter
    // read, feeds no streak or milestone, and is no "recording heard" in My
    // Progress. Its `song:` key would credit nothing at the bridge anyway;
    // returning here keeps the lifetime counter out of it too.
    if (_isSong(track)) return;
    if (track && track.key == null && _sectionTableFor(track)) {
      // A COMPILATION'S END (2026-09-22): its last letter is credited like any
      // other heard through (the follower's rule, spanning to the file's end),
      // and the file itself is one recording heard to the end.
      if (_secKey) _creditSectionLetter(track, _secKey, _secHeard);
      _countCompletion();
      return;
    }
    if (!track || !track.key) return;
    const divider = track.key.indexOf(':');
    if (divider <= 0) return;
    const volKey = track.key.slice(0, divider);
    const itemId = track.key.slice(divider + 1);
    const perTrack = _isBibleVol(volKey);
    if (!perTrack) {
      const following = _state.queue[_state.qi + 1];
      if (following && following.key === track.key) return;   // more parts remain
    }
    // One WHOLE recording finished. Counted before the bridge lookup below so
    // the tally does not depend on the App-side hook being mounted.
    _countCompletion();
    const g = _g();
    if (typeof g.__votAudioListened !== 'function') return;
    // The chapter rides along so the bridge can credit the BIBLE read-items key
    // space (bookId + chapter), which is where a chapter read is recorded.
    g.__votAudioListened(volKey, itemId, perTrack ? _chapterOfTrack(track) : 0);
  } catch (_e) { /* listen counting must never interfere with queue advance */ }
}

/**
 * Persist one "heard to the end" in the Listening Library. Same fail-quiet
 * contract as _countPlay: My Progress's listening block is an enhancement,
 * never something that may stand between a finished track and the advance.
 *
 * @returns {void}
 */
function _countCompletion() {
  try {
    const library = _library();
    if (library && typeof library.countCompletion === 'function') library.countCompletion();
  } catch (_e) { /* a counter must never interfere with the queue advance */ }
}

/**
 * One listening DECISION: one lifetime play (the Milestones tier reads this)
 * and one row at the top of the recent shelf. Called only from the four entry
 * points a listener actually taps — never from _start(), which also runs for
 * auto-advance, next/prev, playAt and the boot-resume rebuild.
 *
 * recordPlayed moved here on 2026-08-10 for exactly the reason countPlay was
 * never in _start(): the shelf is capped at 30 rows, so one Genesis evening of
 * auto-advance flushed every letter out of it AND repointed "Resume last" at a
 * chapter nobody chose. The shelf answers "what did I put on" — a decision,
 * not a track boundary.
 *
 * The two counters are isolated from each other: a failing shelf write must
 * not cost the play count, and neither may stand between a tap and audio.
 *
 * @returns {void}
 */
export function _countPlay() {
  try {
    const library = _library();
    if (!library) return;
    const track = _state.queue[_state.qi];
    // A song goes on the SONGS shelf, by id, and counts no lifetime play: the
    // 30-row recent shelf is where a reader finds the letter they were hearing,
    // and one evening of shuffle must not flush it or inflate My Progress.
    // The shelf takes it only once it plays (_recordSongStart, on 'playing').
    _songRecordPending = _isSong(track);
    if (_songRecordPending) return;
    try {
      if (track && typeof library.recordPlayed === 'function') library.recordPlayed(track);
    } catch (_e) { /* recent-history failures must not interfere with listening */ }
    try {
      if (typeof library.countPlay === 'function') library.countPlay();
    } catch (_e) { /* the milestones counter must never stand between a tap and audio */ }
  } catch (_e) { /* no library bridge at all — nothing to record */ }
}

/**
 * The song the listener put on, filed on the songs shelf when it first really plays: an offline skip over a song
 * that never played does not put it there, and the song that does play is the one filed. Once per tap.
 * @returns {void}
 */
export function _recordSongStart() {
  if (!_songRecordPending) return;
  const track = _state.queue[_state.qi];
  if (!_isSong(track)) return;
  _songRecordPending = false;
  try {
    const library = _library();
    if (library && typeof library.recordSongPlayed === 'function') library.recordSongPlayed(songIdOfKey(track.key));
  } catch (_e) { /* the shelf must never stand between a song and its sound */ }
}
