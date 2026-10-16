/* matthew-facts.js - the Matthew Study Bible in v2 (zones v2p5, design dz18: 5h the index, 5i-5k a chapter).

   main's pieces, read as main reads them: the index is ChapterIndex over MATTHEW (the minutes chip ReadingMinChip, the
   notes weight MATTHEW_NOTE_RATIO), a chapter is ChapterView (verses keyed study:matthew-<n>:<v>; StudyPanels in PDF,
   InlineNotes + InlineEcho in Inline; the place 'matthew', read marks v1:matthew:<n>; the bookmark 'study:matthew-<n>'),
   and Study notes is ModeToggle (PDF | Inline | Off; a new tab opens in PDF, use-tabs.js:121). v2 has no reading tabs,
   so the choice (and a summary hidden by a tap, main's titleFocusHidden) holds for the session; a gate boot names its
   own. Nothing here writes the reader's storage. */
import { MATTHEW_NOTE_RATIO } from '../utils/matthew-note-weight.js';
import { getNotesForVerse, getEchoesForVerse, parseRefRanges } from '../utils/scripture-parse.js';
import { studyHlKey } from '../utils/hl-keys.js';
import { readKey } from './reading-record.js';

const g = /** @type {any} */ (globalThis);

/** main's read key and book id for the Matthew Study Bible. */
export const MATTHEW_KEY = 'matthew';
/** The overline over the index and every chapter (design: it ties the page to its Studies row). */
export const MATTHEW_OVERLINE = 'New Testament Study Bible';

/** A verse's key, main's studyHlKey('matthew-<n>', v). @param {number} n @param {number | string} v */
export const verseKey = (n, v) => studyHlKey(MATTHEW_KEY + '-' + n, v);
/** The chapter's bookmark (main's LibraryNav chapterBookmark). @param {number} n */
export const bookmarkOf = (n) => ({ key: 'study:' + MATTHEW_KEY + '-' + n, label: 'Matthew ' + n + ' (Study)' });

/** "1.2× notes": study commentary per word of verse text, one place; '' at 0 (chapter 2). @param {number} n */
export function notesWeight(n, ratios = MATTHEW_NOTE_RATIO) {
  const r = ratios[n];
  return r > 0 ? r.toFixed(1) + '× notes' : '';
}

/**
 * main's minutes chip for a chapter (ReadingMinChip): "n% · ~m min left" once begun (the read tracker's progress under
 * its read key), else "~m min" (words / the reader's pace); '' when the words cannot be counted. A gate boot reads no
 * progress and no measured pace.
 * @param {any} ch @param {boolean} live
 */
export function minutesOf(ch, live, gl = g) {
  if (typeof gl.countItemWords !== 'function' || typeof gl.readingMinutes !== 'function') return '';
  let words = 0;
  try { words = Number(gl.countItemWords(ch)) || 0; } catch (_e) { words = 0; }
  if (words <= 0) return '';
  const S = live ? gl.ReadingStatsStore : null;
  let wpm = null;
  try { wpm = S && typeof S.measuredWpm === 'function' ? S.measuredWpm() : null; } catch (_e) { wpm = null; }
  let p = null;
  try { p = S && typeof S.getProgress === 'function' ? S.getProgress(readKey(MATTHEW_KEY, ch.num)) : null; } catch (_e) { p = null; }
  if (p && p.b > 0 && p.c && p.c.length > 0 && p.c.length < p.b) {
    const weighted = p.tw > 0 && p.w >= 0 && p.w < p.tw;
    const fraction = weighted ? p.w / p.tw : p.c.length / p.b;
    const left = gl.readingMinutes(weighted ? p.tw - p.w : Math.round(words * (1 - fraction)), wpm);
    return Math.min(99, Math.round(fraction * 100)) + '% · ~' + left + ' min left';
  }
  const m = gl.readingMinutes(words, wpm);
  return m > 0 ? '~' + m + ' min' : '';
}

/** An index row's second line: the minutes, then the notes weight. @param {any} ch @param {boolean} live */
export function rowLine(ch, live, gl = g) {
  return [minutesOf(ch, live, gl), notesWeight(ch.num)].filter(Boolean).join(' · ');
}

/* ── Study notes: PDF | Inline | Off ─────────────────────────────────────────────────────────────────────────────── */

/** @typedef {'pdf' | 'inline' | 'off'} NotesMode */
/** The three views in main's order, with main's tooltips and the kit's icons. */
export const NOTES_VIEWS = /** @type {Array<{ id: NotesMode, label: string, title: string, icon: string }>} */ ([
  { id: 'pdf', label: 'PDF', title: 'Study notes as the PDF page', icon: 'lines' },
  { id: 'inline', label: 'Inline', title: 'Study notes in the text', icon: 'pen' },
  { id: 'off', label: 'Off', title: 'No study notes, references, or further reading', icon: 'off' },
]);

/** The session's choices (memory only): the notes view, and whether a tap hid the summary. */
const session = { mode: /** @type {NotesMode} */ ('pdf'), hideSummary: false, v: 0, subs: /** @type {Set<() => void>} */ (new Set()) };
const subscribe = (/** @type {() => void} */ f) => { session.subs.add(f); return () => { session.subs.delete(f); }; };
const version = () => session.v;
/** @param {Partial<{ mode: NotesMode, hideSummary: boolean }>} change */
function setSession(change) {
  Object.assign(session, change);
  session.v += 1;
  session.subs.forEach((f) => f());
}
/** Back to a fresh session (tests). */
export function resetMatthewSession() { setSession({ mode: 'pdf', hideSummary: false }); }

/**
 * The notes view and the summary's state: the session's on a real boot; on a gate boot the gate's (facts.matthew.notes,
 * default PDF), changed on the page only.
 * @param {any} gate
 * @returns {{ mode: NotesMode, setMode: (m: NotesMode) => void, hideSummary: boolean, setHideSummary: (h: boolean) => void }}
 */
export function useMatthewView(gate) {
  React.useSyncExternalStore(subscribe, version);
  const f = gate && gate.facts && gate.facts.matthew ? gate.facts.matthew : {};
  const [own, setOwn] = React.useState(() => ({ mode: /** @type {NotesMode} */ (f.notes || 'pdf'), hideSummary: !!f.hideSummary }));
  if (gate) {
    return { mode: own.mode, setMode: (m) => setOwn((o) => ({ ...o, mode: m })),
      hideSummary: own.hideSummary, setHideSummary: (h) => setOwn((o) => ({ ...o, hideSummary: h })) };
  }
  return { mode: session.mode, setMode: (m) => setSession({ mode: m }),
    hideSummary: session.hideSummary, setHideSummary: (h) => setSession({ hideSummary: h }) };
}

/**
 * main's two reading switches for this page (Settings > Reading, myweb's facts; both on unless turned off): Chapter
 * titles (the summary under the h1) and Reference echoes (Inline's pills).
 * @param {{ showChapterTitle?: boolean, showInlineEchoes?: boolean } | null | undefined} facts
 * @returns {{ titles: boolean, echoes: boolean }}
 */
export function matthewSettings(facts) {
  return { titles: !(facts && facts.showChapterTitle === false), echoes: !(facts && facts.showInlineEchoes === false) };
}

/* ── The notes themselves ────────────────────────────────────────────────────────────────────────────────────────── */

/** Whether main has a reference's verse to show (MATTHEW_NKJV): the row is then a button that opens it. @param {any} s */
export const hasVerse = (s, gl = g) => !!(s && gl.MATTHEW_NKJV && gl.MATTHEW_NKJV[s.cite]);

/**
 * A Volumes of Truth note's row: its volume caption (main's votNoteVolLabel: none when empty or the title again), where
 * a tap goes (main's resolveVotLetter; null = not tappable) and whether it is Hidden Manna (main's HM badge).
 * @param {{ vol?: string | null, letter?: string | null }} n
 */
export function votNote(n, gl = g) {
  const vol = typeof gl.votNoteVolLabel === 'function' ? gl.votNoteVolLabel(n) || '' : String((n && n.vol) || '');
  let dest = null;
  try { dest = typeof gl.resolveVotLetter === 'function' ? gl.resolveVotLetter(n.vol, n.letter) || null : null; } catch (_e) { dest = null; }
  let hm = false;
  try { hm = typeof gl.isHiddenManna === 'function' ? !!gl.isHiddenManna(n) : false; } catch (_e) { hm = false; }
  return { vol, dest, hm };
}

/**
 * The v2 route a note's letter opens at (main's goToLetterFromMatthew): a study's first chapter, or the letter landed at
 * the note's excerpt (LetterScreen's landing). null when v2 cannot name it.
 * @param {any} dest resolveVotLetter's row @param {string | undefined} excerpt
 * @param {(t: { id: string }) => any} letterRoute v2's letter-links
 */
export function noteRoute(dest, excerpt, letterRoute, gl = g) {
  if (!dest) return null;
  if (dest.isStudy) {
    const studies = Array.isArray(gl.BIBLE_STUDIES) ? gl.BIBLE_STUDIES : [];
    const s = studies.find((x) => x && (x.slug === dest.studyId || x.id === dest.studyId));
    return s ? { place: 'study-chapter', study: s.id, chapter: dest.studyChapterId } : null;
  }
  const r = letterRoute({ id: dest.id });
  return r ? (excerpt ? { ...r, excerpt } : r) : null;
}

/**
 * Inline (5k): the verses in runs, each run ending at a verse that has notes under it (main's getNotesForVerse: a note
 * sits under the verse that ends its first range), with the notes for that verse; and for each verse the references
 * of the notes above it that also cover it (getEchoesForVerse), one pill per reference.
 * @param {any} ch @param {boolean} echoes
 * @returns {Array<{ verses: Array<{ v: any, echo: string[] }>, notes: { scriptures: any[], votNotes: any[] } | null }>}
 */
export function inlineRuns(ch, echoes) {
  const out = [];
  /** @type {Array<{ v: any, echo: string[] }>} */
  let run = [];
  for (const v of ch.verses || []) {
    const e = echoes ? getEchoesForVerse(ch, v.n) : { scriptures: [], votNotes: [] };
    const refs = [];
    for (const x of e.scriptures.concat(e.votNotes)) if (x && x.ref && !refs.includes(x.ref)) refs.push(x.ref);
    run.push({ v, echo: refs });
    const notes = getNotesForVerse(ch, v.n);
    if (notes.scriptures.length || notes.votNotes.length) {
      out.push({ verses: run, notes });
      run = [];
    }
  }
  if (run.length) out.push({ verses: run, notes: null });
  return out;
}

/** The verse a reference's note sits under (main's InlineEcho scrolls there): its first range's end. @param {string} ref */
export function noteVerse(ref) {
  const r = parseRefRanges(ref);
  return r.length ? r[0].end : null;
}
