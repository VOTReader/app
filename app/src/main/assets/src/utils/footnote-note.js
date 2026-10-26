/* ═══════════════════════════════════════════════════════════════════════
   footnote-note — a note footnote's text as followable pieces (share-fn)
   ═══════════════════════════════════════════════════════════════════════
   Corbin 2026-10-25, on Volume Seven's "Proclaim The Name of The Lord",
   footnote 2 (a passage of "Death and Deliverance" with its own [A] [B]
   markers and, at its end, "A. Acts 17:30 — …" "B. Zephaniah 3:9 — …"):
   "we need to make these followable with good UX, links/refs inside
   footnotes". A note footnote is one string; this reads its structure:

     body    the note's text, with its nested markers ([A]), the Bible
             references it names (Zechariah 6:11, Matthew 3) and the letter
             it is quoted from ((From “Death and Deliverance”)) as pieces;
     notes   the lettered lines its markers point at ("A. Acts 17:30 — …"),
             one per marker, each with its label and its own references.

   The words stay exactly as published (DECISIONS 10-23 "Content stays as
   published"): every piece keeps its text verbatim, and joinFootnoteNote
   puts them back into the very string they came from (footnote-note.test.js
   holds every note footnote in the corpus to that).

   Census 2026-10-25 (lanes/myweb/out/share-fn/RESULT.md): 758 footnotes,
   126 of them notes; nested markers in 2 (the one passage, in Volume Seven
   and Letters from Timothy), a source letter in 3, Bible references in 8
   notes' text. Pure: no DOM, no corpus; the caller resolves a title.
   ═══════════════════════════════════════════════════════════════════════ */

import { BIBLE_BOOKS } from '../data/reading-plans.js';

/**
 * @typedef {{ t: 'text', v: string }
 *   | { t: 'mark', v: string, id: string }
 *   | { t: 'label', v: string, id: string }
 *   | { t: 'ref', v: string, ref: string }
 *   | { t: 'letter', v: string, title: string, excerpt: string }} NotePiece
 * @typedef {{ id: string, pieces: NotePiece[] }} NoteLine
 * @typedef {{ body: NotePiece[], sep: string, notes: NoteLine[] }} FootnoteNote
 */

/** Book title → its chapter count, plus the singular "Psalm". */
/** @type {Map<string, number>} */
const CHAPTERS = new Map(BIBLE_BOOKS.map((b) => [String(b[1]), Number(b[2])]));
CHAPTERS.set('Psalm', 150);
const esc = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BOOK_ALT = [...CHAPTERS.keys()].sort((a, b) => b.length - a.length).map(esc).join('|');
/* "Acts 17:30", "Zechariah 6:9-13", "John 9:6-7", a whole chapter "Matthew 3".
   A book name only at a word's start, and no digit or ':' straight after. */
const REF = new RegExp('(?<![A-Za-z0-9])(' + BOOK_ALT + ') (\\d{1,3})(?::(\\d{1,3})(?:[-–]\\d{1,3})?)?(?![\\d:])', 'g');
/* "(From “Death and Deliverance”)" / '(An excerpt from "Death and Deliverance" - Volume Three)':
   group 1 is the title in its quotes, group 2 the title alone. */
const SOURCE = /\((?:From|An excerpt from) ((?:“([^”]+)”)|(?:"([^"]+)"))/g;
/** A nested marker, "[A]". */
const MARK = /\[([A-Z])\]/g;
/** A notes line, "A. Acts 17:30 — …". */
const NOTE_LINE = /^([A-Z])\.(?= )/;

/**
 * Bible references in a run of text.
 * @param {string} text
 * @returns {NotePiece[]}
 */
function withRefs(text) {
  /** @type {NotePiece[]} */
  const out = [];
  let at = 0;
  for (const m of text.matchAll(REF)) {
    const max = CHAPTERS.get(m[1]) || 0;
    if (+m[2] < 1 || +m[2] > max) continue;
    if (m.index > at) out.push({ t: 'text', v: text.slice(at, m.index) });
    out.push({ t: 'ref', v: m[0], ref: m[0].replace('–', '-') });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ t: 'text', v: text.slice(at) });
  return out;
}

/**
 * Split `text` on a pattern, each hit made into a piece by `make`, the runs
 * between them read for references.
 * @param {string} text
 * @param {RegExp} re  global
 * @param {(m: RegExpMatchArray) => { before: string, piece: NotePiece, after: string } | null} make
 * @returns {NotePiece[]}
 */
function splitOn(text, re, make) {
  /** @type {NotePiece[]} */
  const out = [];
  let at = 0;
  for (const m of text.matchAll(re)) {
    const hit = make(m);
    if (!hit) continue;
    out.push(...withRefs(text.slice(at, m.index) + hit.before));
    out.push(hit.piece);
    at = m.index + m[0].length - hit.after.length;
  }
  out.push(...withRefs(text.slice(at)));
  return out.filter((p) => p.v !== '');
}

/**
 * A note footnote's text as pieces. A text with nothing to follow comes back
 * as one text piece and no notes.
 * @param {string} text
 * @returns {FootnoteNote}
 */
export function parseFootnoteNote(text) {
  const src = String(text || '');
  // The lettered notes: the last paragraph, when every line of it is one.
  let main = src;
  let sep = '';
  /** @type {string[]} */
  let lines = [];
  const cut = src.lastIndexOf('\n\n');
  if (cut > 0) {
    const tail = src.slice(cut + 2).split('\n');
    if (tail.length && tail.every((l) => NOTE_LINE.test(l))) {
      main = src.slice(0, cut);
      sep = '\n\n';
      lines = tail;
    }
  }
  const ids = new Set(lines.map((l) => /** @type {RegExpExecArray} */ (NOTE_LINE.exec(l))[1]));
  // Markers first (only those with a line to point at), then the source letter.
  const marked = splitOn(main, MARK, (m) => (ids.has(m[1]) ? { before: '', piece: { t: 'mark', v: m[0], id: m[1] }, after: '' } : null));
  /** @type {NotePiece[]} */
  const body = [];
  marked.forEach((p) => {
    if (p.t !== 'text' && p.t !== 'ref') { body.push(p); return; }
    if (p.t === 'ref') { body.push(p); return; }
    body.push(...splitOn(p.v, SOURCE, (m) => {
      const quoted = m[1];
      const title = m[2] || m[3] || '';
      const head = m[0].slice(0, m[0].length - quoted.length);
      return title ? { before: head, piece: { t: 'letter', v: quoted, title, excerpt: '' }, after: '' } : null;
    }));
  });
  const notes = lines.map((l) => {
    const id = /** @type {RegExpExecArray} */ (NOTE_LINE.exec(l))[1];
    /** @type {NotePiece[]} */
    const pieces = [{ t: 'label', v: id + '.', id }, ...withRefs(l.slice(id.length + 1))];
    return { id, pieces };
  });
  // The source letter opens on the passage the note quotes: the words before it, markers aside.
  const merged = mergeText(body);
  const at = merged.findIndex((p) => p.t === 'letter');
  if (at >= 0) {
    const quoted = merged.slice(0, at).filter((p) => p.t !== 'mark').map((p) => p.v).join('')
      .replace(/\((?:From|An excerpt from) $/, '').replace(/^[\s“"]+|[\s”"]+$/g, '');
    merged[at] = { .../** @type {any} */ (merged[at]), excerpt: quoted };
  }
  return { body: merged, sep, notes };
}

/** Adjacent text pieces as one. @param {NotePiece[]} pieces @returns {NotePiece[]} */
function mergeText(pieces) {
  /** @type {NotePiece[]} */
  const out = [];
  pieces.forEach((p) => {
    const last = out[out.length - 1];
    if (p.t === 'text' && last && last.t === 'text') out[out.length - 1] = { t: 'text', v: last.v + p.v };
    else out.push(p);
  });
  return out;
}

/**
 * The text the pieces came from, exactly.
 * @param {FootnoteNote} note
 * @returns {string}
 */
export function joinFootnoteNote(note) {
  const join = (/** @type {NotePiece[]} */ ps) => ps.map((p) => p.v).join('');
  return join(note.body) + note.sep + note.notes.map((n) => join(n.pieces)).join('\n');
}

/** Does the note hold anything to follow (a marker, a reference, a source letter)?
    @param {FootnoteNote} note */
export function hasFollowable(note) {
  return note.notes.length > 0 || note.body.some((p) => p.t !== 'text');
}

/* ── Site pages the app has ─────────────────────────────────────────────
   53 note footnotes link out to a page (an "Open external link"), and 45
   of those pages are in the app: Answers Only God Can Give topics (38) and
   letters or studies on thevolumesoftruth.com (7). */
const SITE_HOSTS = /^(?:www\.)?(thevolumesoftruth\.com|answersonlygodcangive\.com)$/i;

/**
 * The in-app page a footnote's link names, as a title to look up, or null.
 * @param {string | null | undefined} url
 * @returns {{ title: string, answers: boolean } | null}
 */
export function inAppTitleForUrl(url) {
  let u;
  try { u = new URL(String(url || '')); } catch (_e) { return null; }
  const host = SITE_HOSTS.exec(u.hostname);
  if (!host) return null;
  let path = '';
  try { path = decodeURIComponent(u.pathname.replace(/^\//, '')); } catch (_e) { return null; }
  const title = path.replace(/_/g, ' ').trim();
  if (!title || /^Main Page$/i.test(title) || title.includes('/')) return null;
  return { title, answers: /answers/i.test(host[1]) };
}

/** A title as compared: case, quotes, punctuation and spacing aside.
    @param {string} s */
export function titleKey(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[‘’“”"'.,!?:;()\-–—…]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Find a letter, entry or topic by its title among the registry's keys
 * ("<collection>::<title>"). Answers first when the link was the Answers
 * site's, otherwise anything but Answers first.
 * @param {Iterable<string>} keys
 * @param {string} title
 * @param {boolean} [answers]
 * @returns {{ collection: string, letterTitle: string } | null}
 */
export function findTitleIn(keys, title, answers = false) {
  const want = titleKey(title);
  if (!want) return null;
  /** @type {{ collection: string, letterTitle: string }[]} */
  const hits = [];
  for (const k of keys) {
    const i = k.indexOf('::');
    if (i < 0) continue;
    const collection = k.slice(0, i);
    const letterTitle = k.slice(i + 2);
    if (collection !== 'null' && titleKey(letterTitle) === want) hits.push({ collection, letterTitle });
  }
  const isAnswers = (/** @type {{ collection: string }} */ h) => h.collection === 'Answers Only God Can Give';
  return hits.find((h) => isAnswers(h) === answers) || hits[0] || null;
}
