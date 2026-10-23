/* ═══════════════════════════════════════════════════════════════════════
   search/notes-index.js — study notes, chapter summaries and headings
   ═══════════════════════════════════════════════════════════════════════
   Corbin 2026-10-23 (DECISIONS item 5): search lists study notes, chapter summaries and headings as their own results
   group, and leaves footnote refs out. They are indexed HERE, in a small index of their own, not in the main one
   (index-builder.js): added there they would move every text's BM25 weights and the ranked list with them. Kept apart,
   the main index, its cache and its ranking are exactly what they were, and the screen shows these as one group after
   the collections (SearchScreen), where they never push a Best Match or a verse or letter down.

     heading        a Bible chapter's section heading (BOOKS, matthew-plain included), opening at the section's first verse
     chapter-title  a chapter's summary line (the hero subtitle), BOOKS and the Matthew Study Bible
     study-note     a Matthew Study Bible note (votNotes: a letter's excerpt beside a verse), opening at its verse
   NOT emitted: footnote refs (the Study Bible's `scriptures` cites), cross-references, Hidden Manna (owner policy).

   The index is small (about 4,500 short docs) and built in memory on the first search that asks for it, from the
   corpora the main index already loaded; nothing is cached, so no index version moves with it.
   ═══════════════════════════════════════════════════════════════════════ */

import MiniSearch from './vendor/minisearch.js';
import { buildMiniSearchOptions } from './search-config.js';
import { kjvEncode } from './tokenize.js';
import { searchData } from './search-data.js';

/** The kinds this index holds (each already has a badge, SRCH_KIND_LABEL, and a route, use-search.js). */
export const NOTE_KINDS = ['heading', 'chapter-title', 'study-note'];

/** The first chapter and verse of a Study Bible note's ref ("5:3-12" -> 5, 3). @param {string} ref @param {number} chNum */
function noteVerse(ref, chNum) {
  const m = /^\s*(\d+):(\d+)/.exec(String(ref || ''));
  return m ? { ch: Number(m[1]), v: Number(m[2]) } : { ch: chNum, v: 0 };
}

/**
 * The study notes, chapter summaries and section headings of the loaded corpora, one doc each, in the main index's
 * doc shape (the fields SrchCard and the result router read).
 * @returns {Array<Object>}
 */
export function buildNoteDocs() {
  /** @type {any[]} */ const docs = [];
  let n = 0;
  const base = (/** @type {any} */ o) => ({
    id: 'n' + (n++), letterId: '', letterNum: 0, translation: 'nkjv', testament: '', genre: '', title: '', heading: '', ...o,
  });

  // ─── Bible books (matthew-plain registered among them): headings and chapter summaries, Scriptures ───
  const books = typeof BOOKS !== 'undefined' ? BOOKS : null;
  // The Restored Names wording a reader with that setting on sees instead (BibleChapterView getSectionHeading):
  // indexed beside the standard one, in `title`, so "yahuwah is my shepherd" finds Psalm 23's heading too.
  const restored = typeof BOOKS_RESTORED !== 'undefined' ? BOOKS_RESTORED : null;
  /** @param {string} own @param {any} alt */
  const alsoAs = (own, alt) => (alt && typeof alt === 'string' && alt !== own ? alt : '');
  if (books) {
    for (const id of Object.keys(books)) {
      const book = books[id];
      if (!book || !Array.isArray(book.chapters)) continue;
      const name = book.title || id;
      const rBook = restored && restored[book.id || id];
      for (const ch of book.chapters) {
        if (!ch) continue;
        const rCh = rBook && Array.isArray(rBook.chapters) ? rBook.chapters.find((/** @type {any} */ c) => c && c.num === ch.num) : null;
        const where = { corpus: 'scriptures', bookId: book.id || id, chapterNum: ch.num, volumeId: 'bible' };
        const secs = ch.sections || [];
        for (let si = 0; si < secs.length; si++) {
          const sec = secs[si];
          const first = sec && Array.isArray(sec.verses) && sec.verses[0];
          if (!sec || !sec.heading || !first) continue;
          const rSec = rCh && rCh.sections && rCh.sections[si];
          docs.push(base({ ...where, kind: 'heading', verseNum: first.n, heading: sec.heading, text: sec.heading,
            title: alsoAs(sec.heading, rSec && rSec.heading), ref: name + ' ' + ch.num + ':' + first.n }));
        }
        if (ch.title) docs.push(base({ ...where, kind: 'chapter-title', verseNum: 0, text: ch.title, title: alsoAs(ch.title, rCh && rCh.title), ref: name + ' ' + ch.num }));
      }
    }
  }

  // ─── Matthew Study Bible: chapter summaries and study notes, Volumes (its footnote refs stay out) ───
  const mt = typeof MATTHEW !== 'undefined' ? MATTHEW : null;
  if (mt && Array.isArray(mt.chapters)) {
    for (const ch of mt.chapters) {
      if (!ch) continue;
      const where = { corpus: 'volumes', bookId: 'matthew', volumeId: 'matthew-study' };
      if (ch.title) docs.push(base({ ...where, kind: 'chapter-title', chapterNum: ch.num, verseNum: 0, text: ch.title, ref: 'Matthew ' + ch.num + ' · Study Bible' }));
      for (const note of ch.votNotes || []) {
        if (!note || !note.excerpt) continue;
        const at = noteVerse(note.ref, ch.num);
        docs.push(base({
          ...where, kind: 'study-note', chapterNum: at.ch, verseNum: at.v, text: String(note.excerpt),
          // the letter the note quotes, shown under the card's reference (SrchCard cardHeads)
          heading: [note.vol, note.letter].filter(Boolean).join(' · '),
          ref: 'Matthew ' + (note.ref || ch.num),
        }));
      }
    }
  }
  return docs;
}

/** Prefix-match a typed word of three letters or more (a two-letter start matches half the index). @param {string} t */
const prefixOf = (t) => t.length >= 3;
/** A slip is corrected on a word of five letters or more, and only when the words as typed found nothing. @param {string} t */
const fuzzyOf = (t) => (t.length >= 5 ? 0.2 : 0);

/**
 * A searcher over `docs` (buildNoteDocs). `search` takes the query as typed and returns the engine's hit shape,
 * best first: { score, doc, terms } (terms: the doc-side words matched, for the card's marks).
 * @param {Array<any>} docs
 */
export function notesSearcher(docs) {
  const ms = notesIndex();
  ms.addAll(docs);
  return searcherOver(ms, docs);
}

/** The same searcher, indexed 500 docs a turn so the first search that asks never holds the page for the whole build. @param {Array<any>} docs */
export async function notesSearcherAsync(docs) {
  const ms = notesIndex();
  await ms.addAllAsync(docs, { chunkSize: 500 });
  return searcherOver(ms, docs);
}

/** An empty index in the main index's shape, storing nothing: the docs themselves are kept beside it. */
function notesIndex() {
  return new MiniSearch({ ...buildMiniSearchOptions(), storeFields: [] });
}

/** @param {any} ms @param {Array<any>} docs */
function searcherOver(ms, docs) {
  /** @type {Map<string, any>} */ const byId = new Map(docs.map((d) => [d.id, d]));
  return {
    size: docs.length,
    /**
     * @param {string} query
     * @param {{useStopWords?: boolean, corpus?: string, scope?: {bookId?: string, volumeId?: string}|null, limit?: number}} [options]
     * @returns {Array<{score: number, doc: any, terms: string[]}>}
     */
    search(query, options) {
      const o = options || {};
      // a word to leave out (-word) and quote marks are the main search's syntax, not words to find here
      const q = String(query || '').replace(/(^|\s)-\S+/g, ' ').replace(/["“”]/g, ' ');
      const stop = searchData().STOP_WORDS_TRIMMED;
      const toks = [...new Set(kjvEncode(q))];
      const words = o.useStopWords === false ? toks : toks.filter((t) => !(stop && stop.has(t)));
      if (!words.length) return [];
      const corpus = o.corpus && o.corpus !== 'all' ? o.corpus : null;
      const scope = o.scope || null;
      /** @param {any} d */
      const keep = (d) => (!corpus || d.corpus === corpus) &&
        (!scope || !scope.bookId || d.bookId === scope.bookId) && (!scope || !scope.volumeId || d.volumeId === scope.volumeId);
      const run = (/** @type {boolean} */ fuzzy) => ms.search(words.join(' '), {
        combineWith: 'AND', prefix: prefixOf, fuzzy: fuzzy ? fuzzyOf : false, boost: { text: 1, title: 1 },
        filter: (/** @type {any} */ r) => keep(byId.get(r.id)),
      });
      let hits = run(false);
      if (!hits.length) hits = run(true);
      const docsOf = hits.map((h) => ({ score: h.score, doc: byId.get(h.id), terms: h.terms || [] }));
      // A chapter's summary is mostly its headings joined: when a heading of the same chapter matched, it is the
      // nearer place, and the summary would only say it again. Under All, Matthew's summary shows once, the Study Bible's.
      const headed = new Set(docsOf.filter((e) => e.doc.kind === 'heading').map((e) => e.doc.bookId + ':' + e.doc.chapterNum));
      const studyCh = new Set(docsOf.filter((e) => e.doc.kind === 'chapter-title' && e.doc.bookId === 'matthew').map((e) => e.doc.chapterNum));
      const out = docsOf.filter((e) => {
        const d = e.doc;
        if (d.kind !== 'chapter-title') return true;
        if (headed.has(d.bookId + ':' + d.chapterNum)) return false;
        return !(d.bookId === 'matthew-plain' && studyCh.has(d.chapterNum));
      });
      return out.slice(0, o.limit || 60);
    },
  };
}
