// @ts-check
/* ═════════════════════════════════════════════════
   useAudioFollow — "Turn the Page with the Audio" (w-audio-continue, 2026-09-11)
   ═════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js (stores/_entry-b.js).

   A reader who pressed Listen once never touches the phone again: the player
   continues in site order by itself (utils/audio-player.js, _extendQueue), and
   this hook moves the SCREEN with it — the reading pane opens the next reading
   as its first clause starts, so the read-along (which paints only for the
   track the pane shows) picks up at once.

   THE LIVE-PANE RULE. The move happens only when the active tab shows the very
   unit that just ended — the same letter, or the same Bible book AND chapter.
   A reader on the Journal, Home, Settings, a search, or ANOTHER reading is never
   yanked; the audio simply goes on. Someone who pressed Listen from a Home card
   and never opened the reading is that case too, by design: their screen stays
   on Home and the desk's "Open the reading" is two taps away. An open sheet other
   than the listening desk (a note being written, the highlight bar, a scripture
   sheet) also holds the follow — a page must not swap under a finger mid-note;
   the desk is the player's own UI and does not block. A held follow is not
   retried; the next boundary is judged afresh.

   TWO NAVIGATIONS, BECAUSE TWO BACK SEMANTICS. The MANUAL path already exists:
   the listening desk's title tap (AudioManagerSheet, owner request 2026-08-09)
   goes through window.__openAudioText (screen-routes.jsx) — pure navigation
   that raises the standard "‹ Back to …" pill, right for a jump the reader
   chose from wherever they were; it is labelled "Open the reading". The
   follower's move is different in kind: IN PLACE. openReading() below is the
   tour's own recipe (use-tour.js attachNav: letters setLetterId +
   setScreen(col.letterScreen); Bible setBookId + setChapterNum +
   setScreen('bible-ch')), no pill, and wrapped in suppressNextHistoryPush()
   (use-history-sync.js, the handshake use-android-back uses) so no history
   entry is pushed per reading the audio walks: one Back from the followed
   reading goes where one Back from the original would have gone, never back
   through every chapter.

   The player is reached by the BARE global `AudioPlayer` that _entry-d.js
   attaches — never by import: this module rides bundle-b and the player rides
   bundle-d, and an import would bundle a second, silent player into bundle-b
   (Charter 2026-09-11 00:44). Absent player (tests, stripped harnesses) = no-op.

   Settings: `audioTurnPage` (absent = on, the file's `!== false` idiom), the
   "Turn the Page with the Audio" row in the Listening group. NOT "Follow the
   audio": the existing row "Follow the Voice" (in-page scroll) owns that word,
   and two rows named Follow would be the one-label confusion again.
   ═════════════════════════════════════════════════ */

import { modalRegistry } from './use-modal-registry.js';
import { suppressNextHistoryPush } from './use-history-sync.js';

/** The listening desk's registry id (AudioManagerSheet.jsx) — the one sheet that does not hold a follow. */
const DESK_ID = 'audio-manager-sheet';

/**
 * @typedef {{ kind: 'letter', volKey: string, id: string } | { kind: 'study', volKey: 'study', id: string } | { kind: 'bible', volKey: string, bookId: string, chapter: number }} Unit
 *   'study' (2026-09-20): a Bible-study chapter — the key is "study:<chapterId>",
 *   the pane is 'bible-study-chapter' on that studyChapterId, and opening the
 *   next one needs the STUDY that owns it (BIBLE_STUDIES) as well as the chapter.
 */

/**
 * The reading unit of the track at queue[qi], or null (no track, or a key-less
 * range-compilation section, which has no reading pane of its own).
 *
 * @param {any} player
 * @returns {Unit | null}
 */
function unitOf(player) {
  const st = player.getState();
  const t = st && Array.isArray(st.queue) ? st.queue[st.qi] : null;
  if (!t || typeof t.key !== 'string') return null;
  const at = t.key.indexOf(':');
  if (at <= 0) return null;
  const volKey = t.key.slice(0, at);
  const id = t.key.slice(at + 1);
  if (volKey.lastIndexOf('bible-', 0) === 0) {
    const chapter = typeof player.bibleChapterOfTrack === 'function' ? player.bibleChapterOfTrack(t) : 0;
    return { kind: 'bible', volKey, bookId: id, chapter: chapter > 0 ? chapter : 1 };
  }
  if (volKey === 'study') return { kind: 'study', volKey: 'study', id };
  return { kind: 'letter', volKey, id };
}

/** The id of the study whose chapters hold this chapter id (bible-studies.js), or null. */
function studyIdOf(chapterId) {
  const studies = /** @type {any} */ (globalThis).BIBLE_STUDIES;
  if (!Array.isArray(studies)) return null;
  const st = studies.find((s) => s && Array.isArray(s.chapters) && s.chapters.some((c) => c && c.id === chapterId));
  return st ? st.id : null;
}

/** @param {Unit | null} a @param {Unit | null} b @returns {boolean} */
function sameUnit(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  return (a.kind === 'letter' || a.kind === 'study')
    ? a.volKey === b.volKey && a.id === /** @type {any} */ (b).id
    : a.bookId === /** @type {any} */ (b).bookId && a.chapter === /** @type {any} */ (b).chapter;
}

/** @param {string} volKey @returns {any} */
function colOf(volKey) {
  const g = /** @type {any} */ (globalThis);
  return g.COL_BY_KEY && typeof g.COL_BY_KEY.get === 'function' ? g.COL_BY_KEY.get(volKey) : null;
}

/**
 * Does the active tab show this unit? Letters: the collection's reading screen
 * with this letter open. Bible: the generic chapter view on this book and chapter.
 *
 * @param {any} pane
 * @param {Unit} unit
 * @returns {boolean}
 */
function paneShows(pane, unit) {
  if (unit.kind === 'letter') {
    const col = colOf(unit.volKey);
    return !!col && pane.screen === col.letterScreen && pane.letterId === unit.id;
  }
  if (unit.kind === 'study') return pane.screen === 'bible-study-chapter' && pane.studyChapterId === unit.id;
  return pane.screen === 'bible-ch' && pane.bookId === unit.bookId && Number(pane.chapterNum) === unit.chapter;
}

/**
 * Open a unit's reading screen — the tour's own recipes (use-tour.js attachNav).
 *
 * @param {any} pane
 * @param {Unit} unit
 * @returns {void}
 */
function openReading(pane, unit) {
  if (unit.kind === 'letter') {
    const col = colOf(unit.volKey);
    if (!col || !col.letterScreen) return;
    if (typeof pane.setLetterId === 'function') pane.setLetterId(unit.id);
    if (typeof pane.setScreen === 'function') pane.setScreen(col.letterScreen);
    return;
  }
  if (unit.kind === 'study') {
    // BibleStudyChapterView's own recipe (selectStudyChapter): the study AND the chapter.
    const sid = studyIdOf(unit.id);
    if (!sid) return;
    if (typeof pane.setStudyId === 'function') pane.setStudyId(sid);
    if (typeof pane.setStudyChapterId === 'function') pane.setStudyChapterId(unit.id);
    if (typeof pane.setScreen === 'function') pane.setScreen('bible-study-chapter');
    return;
  }
  if (typeof pane.setBookId === 'function') pane.setBookId(unit.bookId);
  if (typeof pane.setChapterNum === 'function') pane.setChapterNum(unit.chapter);
  if (typeof pane.setScreen === 'function') pane.setScreen('bible-ch');
}

/** @returns {boolean} a sheet other than the listening desk is open */
function heldByOverlay() {
  return modalRegistry.openIds().some((id) => id !== DESK_ID);
}

/**
 * @param {{ enabled?: boolean, screen: string, letterId?: string | null, bookId?: string | null, chapterNum?: number | null,
 *   studyId?: string | null, studyChapterId?: string | null,
 *   setLetterId?: Function, setBookId?: Function, setChapterNum?: Function, setScreen?: Function,
 *   setStudyId?: Function, setStudyChapterId?: Function }} p
 * @returns {void}
 */
export function useAudioFollow(p) {
  // The latest pane and setters, read at boundary time — one subscription for the
  // life of the App, never re-armed per render.
  const ref = React.useRef(p);
  ref.current = p;
  React.useEffect(() => {
    const g = /** @type {any} */ (globalThis);
    const player = g.AudioPlayer;
    if (!player || typeof player.subscribe !== 'function' || typeof player.getState !== 'function') return undefined;
    let prev = unitOf(player);
    const unsub = player.subscribe(() => {
      const cur = unitOf(player);
      if (!cur) return;                        // stopped, or a section run: no unit to follow into
      if (sameUnit(cur, prev)) return;         // same reading (a part boundary inside one letter, a tick)
      const from = prev;
      prev = cur;
      const pane = ref.current;
      if (pane.enabled === false) return;      // the row is off: the audio goes on, the screen stays
      if (!from || !paneShows(pane, from)) return;   // the live-pane rule
      if (heldByOverlay()) return;
      suppressNextHistoryPush();
      openReading(pane, cur);
    });
    return unsub;
  }, []);
}
