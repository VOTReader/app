// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   audio-coverage — Cluster D (esbuild bundle-d.js, with the library screens)
   ═══════════════════════════════════════════════════════════════════════

   ONE law for the question every library screen asks about a work: can I read
   along with it, can I only listen, or is there no recording at all?

   The three states are the listener's, not the pipeline's:

     'read-along'      a recording ships AND its words are timed, so the text
                       lights as it is read.
     'listening-only'  a recording ships with no timings, by declaration — the
                       Gospel of John film's narration is a translation this
                       corpus does not carry, so BIBLE_AUDIO_EDITIONS marks it
                       `timed: false` (audio-track.js). Painting it would paint
                       the wrong words confidently.
     'no-recording'    no audio exists for the work (the 52 study chapters the
                       2026-09-22 census counted: More Than a Man, Odds Chart,
                       State of the Dead, Grace and the Law, Trinity, and two
                       Lamb of God chapters).

   Cheap by construction: it reads the MANIFESTS (bundle-a, a few KB) and the
   edition registry — never audio-sync.js, which is ~4 MB and lazy-loaded by
   sync-loaders.js on a reading screen. A badge on a library row must not drag
   the timings down the wire, so "is it timed?" is answered by the edition's
   own declaration, which is the same answer the loader acts on: every shipped
   recording is belt-proven timed unless its edition declares otherwise.
*/

import { BIBLE_AUDIO_EDITIONS, bibleAudioOffered } from './audio-track.js';

/** @typedef {'read-along' | 'listening-only' | 'no-recording'} CoverageState */

export const COVERAGE_READ_ALONG = /** @type {const} */ ('read-along');
export const COVERAGE_LISTENING_ONLY = /** @type {const} */ ('listening-only');
export const COVERAGE_NONE = /** @type {const} */ ('no-recording');

/** The words each state wears, and the sentence behind them. The label is
 *  short enough for a 360 px row; the title says why. */
const COVERAGE_COPY = Object.freeze({
  [COVERAGE_READ_ALONG]: Object.freeze({
    label: 'Read-along',
    title: 'Recorded and timed — the words light as they are read.',
  }),
  [COVERAGE_LISTENING_ONLY]: Object.freeze({
    label: 'Listening only',
    title: 'Recorded, but the words are not timed, so nothing lights as it plays.',
  }),
  [COVERAGE_NONE]: Object.freeze({
    label: 'No recording',
    title: 'No recording exists for this yet — it can still be read.',
  }),
});

/** @param {CoverageState} state */
export function coverageCopy(state) {
  return COVERAGE_COPY[state] || COVERAGE_COPY[COVERAGE_NONE];
}

/** Globals, read late: the corpus files define them on window as `var`s and a
 *  screen can render before one of them has landed. An absent manifest means
 *  "nothing known yet", which reads as no recording — never a throw. */
function manifest(name) {
  const g = /** @type {any} */ (globalThis);
  const m = g[name];
  return (m && typeof m === 'object') ? m : null;
}

/**
 * A Bible audio edition's state, by its volKey ('bible-brm-kjv', …).
 * An edition with no book in the manifest has no recording; one that declares
 * `timed: false` is listening only; anything else is read-along.
 *
 * @param {string} volKey
 * @returns {CoverageState}
 */
export function bibleEditionCoverage(volKey) {
  // The registry's members are literal-typed and only ONE of them declares
  // `timed`, so the union has no such property — read it through the shape the
  // registry's own doc comment promises ("timed optional, default true").
  const edition = /** @type {Array<{ volKey: string, timed?: boolean }>} */ (
    Object.values(BIBLE_AUDIO_EDITIONS)
  ).find((e) => e && e.volKey === volKey);
  const rows = manifest('BIBLE_AUDIO_MANIFEST');
  const hasAudio = !!rows && Object.keys(rows).some((key) => key.slice(0, key.indexOf(':')) === volKey);
  if (!hasAudio) return COVERAGE_NONE;
  return (edition && edition.timed === false) ? COVERAGE_LISTENING_ONLY : COVERAGE_READ_ALONG;
}

/**
 * How many of a study's chapters carry a recording, and the state that follows.
 * Study audio is keyed "study:<chapterId>" in AUDIO_MANIFEST (chapter ids are
 * `<studyId>-ch<N>`), so a study is counted, not guessed: Lamb of God ships 14
 * of its 16 chapters, and a partly recorded study is still a read-along one —
 * the count is what makes that honest.
 *
 * @param {{ id?: string, isMatthewStudy?: boolean, chapters?: Array<{ id?: string }>, parts?: Array<{ chapterIds?: string[] }>, prefaceId?: string }} [study]
 * @returns {{ state: CoverageState, recorded: number, total: number }}
 */
export function studyCoverage(study) {
  // The Matthew Study Bible is a VIRTUAL study over the Matthew corpus
  // (use-bible-studies.js MATTHEW_CHAIN_ENTRY) whose recording is whichever
  // BIBLE edition the reader picks in Settings — it owns no "study:" asset of
  // its own, so counting study keys alone would call a read-along screen
  // silent. Ask the book instead.
  if (study && study.isMatthewStudy) {
    return { state: bibleBookCoverage('matthew'), recorded: 0, total: 0 };
  }
  const ids = studyChapterIds(study);
  const rows = manifest('AUDIO_MANIFEST');
  const recorded = rows ? ids.filter((id) => Array.isArray(rows['study:' + id]) && rows['study:' + id].length).length : 0;
  return {
    state: recorded ? COVERAGE_READ_ALONG : COVERAGE_NONE,
    recorded,
    total: ids.length,
  };
}

/**
 * The state of a Bible BOOK across the offered editions: read-along when any
 * offered, timed edition ships it; listening only when the only editions that
 * ship it are untimed; no recording when none does.
 *
 * @param {string} bookId
 * @returns {CoverageState}
 */
export function bibleBookCoverage(bookId) {
  const rows = manifest('BIBLE_AUDIO_MANIFEST');
  if (!rows) return COVERAGE_NONE;
  const editions = /** @type {Array<{ volKey: string, timed?: boolean, unreleased?: boolean }>} */ (
    Object.values(BIBLE_AUDIO_EDITIONS)
  ).filter((e) => bibleAudioOffered(e) && Object.prototype.hasOwnProperty.call(rows, e.volKey + ':' + bookId));
  if (!editions.length) return COVERAGE_NONE;
  return editions.some((e) => e.timed !== false) ? COVERAGE_READ_ALONG : COVERAGE_LISTENING_ONLY;
}

/** Every chapter id a study holds, in either shape it ships in (a flat
 *  `chapters` list, or `parts` of `chapterIds` with an optional preface). */
function studyChapterIds(study) {
  if (!study || typeof study !== 'object') return [];
  const ids = [];
  if (study.prefaceId) ids.push(study.prefaceId);
  if (Array.isArray(study.chapters)) {
    for (const ch of study.chapters) if (ch && ch.id) ids.push(ch.id);
  }
  if (Array.isArray(study.parts)) {
    for (const part of study.parts) {
      if (part && Array.isArray(part.chapterIds)) for (const id of part.chapterIds) if (id) ids.push(id);
    }
  }
  return [...new Set(ids)];
}

/**
 * The second line a study row prints beside its badge: nothing when every
 * chapter is recorded (the badge already says read-along) or when none is (the
 * badge says no recording), and the count when it is partial.
 *
 * n6-12: the count is of chapters. A study without parts calls its chapters
 * "Parts" on its row, so "parts" agrees there; a study in parts (More Than a
 * Man, Lamb of God) names its parts on the row, so its caller passes 'chapters'.
 *
 * @param {{ state: CoverageState, recorded: number, total: number }} coverage
 * @param {string} [unit] - what the counted things are called (default 'parts')
 * @returns {string | null}
 */
export function studyCoverageDetail(coverage, unit) {
  if (!coverage || coverage.state !== COVERAGE_READ_ALONG) return null;
  if (!coverage.total || coverage.recorded >= coverage.total) return null;
  return coverage.recorded + ' of ' + coverage.total + ' ' + (unit || 'parts');
}
