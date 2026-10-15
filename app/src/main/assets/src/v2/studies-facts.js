/* studies-facts.js - what v2's Studies (2d) and a study's page (2e) say, from main's data (zones v2p5, design dz14).

   The list is main's UNIFIED_CHAIN (hooks/use-bible-studies.js): main's Bible Letter Studies (bible-studies.js, loaded on
   demand by window.loadBibleStudies) in CHAIN_ORDER, with the Matthew Study Bible (MATTHEW, bundle-a-matthew) second.
   Titles follow design's one rule for main's long study titles: split at the first ": " or " - "; the first part is the
   title in lists and top bars, the rest the lede on the study's own page; a bare "Bible/Letter Study" says nothing the
   row's label does not. Read marks and the chapter you are on are main's (vot-state readItems and lastReadChapters under
   the study's read key 'bible-study-<slug>'), read only. */
import { studyCoverage, COVERAGE_READ_ALONG, COVERAGE_LISTENING_ONLY } from '../utils/audio-coverage.js';
import { readKey } from './reading-record.js';

const g = /** @type {any} */ (globalThis);

/** main's chain order (use-bible-studies.js CHAIN_ORDER): heavy to light, Matthew second. */
export const CHAIN_ORDER = ['more-than-a-man', 'matthew-study', 'purity', 'state-of-the-dead', 'grace-and-the-law',
  'lamb-of-god', 'trinity-exposed', 'odds-chart'];
export const MATTHEW_ID = 'matthew-study';
/** main's virtual Matthew entry's title (use-bible-studies.js MATTHEW_CHAIN_ENTRY). */
export const MATTHEW_TITLE = 'The Volumes of Truth New Testament Study Bible - The Book of Matthew';
/** The last row of main's Studies (StudiesHome.jsx's external card). */
export const ANSWERS_SITE = 'https://answersonlygodcangive.com/';

/** Straight quotes as the book sets them: an opening one after a space or bracket, else a closing one. @param {string} s */
export function curly(s) {
  return String(s || '')
    .replace(/(^|[\s([{—-])"/g, '$1“').replace(/"/g, '”')
    .replace(/(^|[\s([{—-])'/g, '$1‘').replace(/'/g, '’');
}

const BARE_LABEL = /^\(?\s*Bible\/Letter Study\s*\)?$/i;

/**
 * A study title, split as design's rule says. `title` drops a trailing "(Bible/Letter Study)"; `rest` is what follows
 * the first ": " or " - " (null when nothing, or only "Bible/Letter Study", does).
 * @param {string} full @returns {{ title: string, rest: string | null }}
 */
export function splitStudyTitle(full) {
  const s = String(full || '').trim();
  const m = /: | - /.exec(s);
  let title = m ? s.slice(0, m.index) : s;
  let rest = m ? s.slice(m.index + m[0].length).trim() : '';
  title = title.replace(/\s*\(Bible\/Letter Study\)\s*$/i, '').trim();
  if (BARE_LABEL.test(rest)) rest = '';
  return { title: curly(title), rest: rest ? curly(rest) : null };
}

/** The chain's entries in order, skipping a study that has not loaded or has no chapters (main's filter). */
export function studyChain(studies = g.BIBLE_STUDIES, matthew = g.MATTHEW) {
  const list = Array.isArray(studies) ? studies : [];
  const mat = { id: MATTHEW_ID, slug: MATTHEW_ID, title: MATTHEW_TITLE, isMatthewStudy: true,
    chapters: (matthew && Array.isArray(matthew.chapters)) ? matthew.chapters : [] };
  return CHAIN_ORDER
    .map((id) => (id === MATTHEW_ID ? mat : list.find((s) => s && s.id === id)))
    .filter((s) => s && (s.isMatthewStudy || (!s.locked && Array.isArray(s.chapters) && s.chapters.length > 0)));
}

/** A study by id from the chain (Matthew included), or null. @param {string} id */
export function studyById(id, studies = g.BIBLE_STUDIES, matthew = g.MATTHEW) {
  return studyChain(studies, matthew).find((s) => s.id === id) || null;
}

/** The chapters a Matthew row counts while MATTHEW has not loaded (the book's 28). */
const MATTHEW_CHAPTERS = 28;

/**
 * A row's coverage words: "Read-along", "Read-along · 14 of 16" when partly recorded, "Listening only"; null when there is
 * no recording (design dz14: no mark means no recording).
 * @param {{ state: string, recorded?: number, total?: number } | null} cov
 */
export function coverageWords(cov) {
  if (!cov) return null;
  if (cov.state === COVERAGE_LISTENING_ONLY) return 'Listening only';
  if (cov.state !== COVERAGE_READ_ALONG) return null;
  return cov.total && cov.recorded && cov.recorded < cov.total ? 'Read-along · ' + cov.recorded + ' of ' + cov.total : 'Read-along';
}

/**
 * One row of the Studies list: its number, title, label line and coverage words.
 * @param {any} s a chain entry @param {number} i @param {{ state: string, recorded?: number, total?: number } | null} cov
 */
export function studyRow(s, i, cov) {
  const { title } = splitStudyTitle(s.title);
  let label;
  if (s.isMatthewStudy) label = 'Matthew · ' + (s.chapters.length || MATTHEW_CHAPTERS) + ' chapters with notes';
  else if (s.singlePage) label = 'Reference · one page';
  else {
    const n = Array.isArray(s.parts) && s.parts.length ? s.parts.length : s.chapters.length;
    label = n + (n === 1 ? ' part' : ' parts') + ' · Bible study';
  }
  return { id: s.id, no: String(i + 1), title, label, cov: coverageWords(cov) };
}

/** main's coverage for a chain entry (manifests only, never the timings). */
export function liveCoverage(s) {
  try { return studyCoverage(s); } catch (_e) { return null; }
}

/** Where a row goes: a one-page study straight to its chapter (main's selectStudy), else the study's page. */
export function studyRoute(s) {
  if (!s.isMatthewStudy && (s.singlePage || s.chapters.length === 1)) {
    return { place: 'study-chapter', study: s.id, chapter: s.chapters[0].id };
  }
  return { place: 'study', study: s.id };
}

/** A study page's head: eyebrow, title (and its size), lede. */
export function studyHead(s) {
  const { title, rest } = splitStudyTitle(s.title);
  const lede = rest || (s.subtitle ? curly(s.subtitle) : null);
  return {
    eyebrow: s.isMatthewStudy ? 'Study Bible' : 'Bible and letter study',
    title,
    size: title.length > 40 ? 'longer' : title.length > 12 ? 'long' : '',
    lede,
  };
}

/**
 * A study page's entries: the preface ("P") first, then each part (its chapters inside) or, with no parts, each chapter.
 * A chapter: { kind: 'chapter', id, no, title }; a part: { kind: 'part', num, title, sub, chapters }.
 */
export function studyEntries(s) {
  const chapters = Array.isArray(s.chapters) ? s.chapters : [];
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const row = (c) => ({ kind: 'chapter', id: chapterId(s, c), no: c.num === 0 ? 'P' : String(c.num),
    title: curly(c.title || 'Part ' + c.num) });
  /** @type {any[]} */
  const out = [];
  if (Array.isArray(s.parts) && s.parts.length) {
    const pre = s.prefaceId ? byId.get(s.prefaceId) : null;
    if (pre) out.push(row(pre));
    const name = splitStudyTitle(s.title).title;
    for (const p of s.parts) {
      const list = (p.chapterIds || []).map((id) => byId.get(id)).filter(Boolean).map(row);
      const n = list.length;
      out.push({ kind: 'part', num: p.num, title: curly(p.title), chapters: list,
        sub: (p.subtitle ? curly(p.subtitle) : name) + ' · ' + n + (n === 1 ? ' chapter' : ' chapters') });
    }
    return out;
  }
  // a flat study: the preface (num 0) first as main lists it, then the chapters in order
  return chapters.slice().sort((a, b) => (a.num === 0 ? -1 : b.num === 0 ? 1 : 0)).map(row);
}

/** main's read key for a study (use-bible-studies.js studyReadKey; the Matthew Study Bible reads as the book 'matthew'). */
export const studyReadKey = (/** @type {string} */ id) => (id === MATTHEW_ID ? 'matthew' : 'bible-study-' + id);

/** A chapter's id in v2's routes and main's read marks: a study chapter's own id; a Matthew chapter's number (main keys
 *  the book's chapters by number). */
export function chapterId(s, c) {
  return s && s.isMatthewStudy ? String(c.num) : c.id;
}

/**
 * Where the reader is in a study, from main's vot-state: the chapter they are on (lastReadChapters when the study is the
 * active read key, as main's chapterIndexCurrentChapter) and the chapters read (readItems), none when marking is off.
 * @returns {{ current: string | null, read: string[] }}
 */
export function savedStudyPlace(s, gl = g) {
  let state = null;
  try {
    const store = gl.StateStore;
    if (store && typeof store.get === 'function' && (typeof store.isReady !== 'function' || store.isReady())) state = store.get();
  } catch (_e) { state = null; }
  if (!state || typeof state !== 'object') return { current: null, read: [] };
  const key = studyReadKey(s.id);
  const lrc = state.lastReadChapters && typeof state.lastReadChapters === 'object' ? state.lastReadChapters : {};
  const current = state.activeReadKey === key && lrc[key] != null ? String(lrc[key]) : null;
  const on = !(state.settings && state.settings.markAsRead === false);
  const items = state.readItems && typeof state.readItems === 'object' ? state.readItems : {};
  const read = on ? (s.chapters || []).map((c) => chapterId(s, c)).filter((id) => Number(items[readKey(key, id)]) > 0) : [];
  return { current, read };
}

/** The part that holds `chapterId` (main opens it on arrival), or null. */
export function partHolding(s, chapterId) {
  if (!chapterId || !Array.isArray(s.parts)) return null;
  const p = s.parts.find((x) => (x.chapterIds || []).includes(chapterId));
  return p ? p.num : null;
}

/** The studies' bundle, asked for once per page; settles true when BIBLE_STUDIES is here, false when it failed. */
export function askStudies(gl = g) {
  if (Array.isArray(gl.BIBLE_STUDIES)) return Promise.resolve(true);
  return typeof gl.loadBibleStudies === 'function' ? Promise.resolve(gl.loadBibleStudies()).then((ok) => ok !== false, () => false)
    : Promise.resolve(false);
}

/** The Matthew Study Bible's corpus (a row's count and its chapters); settles either way. */
export function askMatthew(gl = g) {
  if (gl.MATTHEW || typeof gl.__loadMatthewCorpus !== 'function') return Promise.resolve();
  return Promise.resolve(gl.__loadMatthewCorpus()).then(() => {}, () => {});
}
