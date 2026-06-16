/* ═══════════════════════════════════════════════════════════════════════
   search/index-builder.js — produce the NARROW document set to index
   ═══════════════════════════════════════════════════════════════════════
   USER DIRECTIVE — index ONLY "pure target material":
     • Bible verse     → verse text (chapter/verse stored for routing). The
                         verse's `title` is left EMPTY so a search never matches
                         a verse on its book name / reference (the ref-parser
                         already navigates "John 3:16"; indexing the ref buries
                         verses — the old SRCH-1 bug).
     • Letter / entry  → ONE doc per letter/WTLB/Blessed/Holy-Days entry, with
                         the NAME in `title` (indexed, field-boosted) and the
                         BODY in `text`. (Folded — no separate *-title doc.)
     • Bible Study     → one doc per study chapter (title + body).
   NOT emitted (so never matchable): footnote refs, chapter titles/summaries,
   section headings (inline topic breaks), study notes, cross-references.

   Each doc carries a `corpus` ('scriptures' | 'volumes') discriminator so the
   single MiniSearch index can be scoped with a filter. Verse text comes from
   the ACTIVE translation only — no cross-translation blob (synonyms + archaic
   folding cover translation-wording differences), so a cacheless open never
   pulls the ~31 MB of alternate Bibles.
   ═══════════════════════════════════════════════════════════════════════ */

import { searchData } from './search-data.js';

/** @param {string} bookId */
function bookTestament(bookId) {
  const D = searchData();
  return D.OT_BOOK_IDS.indexOf(bookId) >= 0 ? 'ot' : D.NT_BOOK_IDS.indexOf(bookId) >= 0 ? 'nt' : '';
}

/** @param {string} bookId */
function bookGenre(bookId) {
  const D = searchData();
  for (const g in D.GENRE_GROUPS) {
    if (D.GENRE_GROUPS[g].indexOf(bookId) >= 0) return g;
  }
  return '';
}

/** Flatten a letter's blocks/segments/lines into one body string. */
function letterText(letter) {
  if (!letter || !letter.blocks) return '';
  const out = [];
  for (let bk = 0; bk < letter.blocks.length; bk++) {
    const b = letter.blocks[bk];
    if (b.segments) {
      for (let s = 0; s < b.segments.length; s++) out.push(b.segments[s].v || '');
    } else if (b.lines) {
      for (let li = 0; li < b.lines.length; li++) {
        const line = b.lines[li];
        if (Array.isArray(line)) {
          for (let ls = 0; ls < line.length; ls++) out.push(line[ls].v || '');
        }
      }
    }
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

/** Recursively collect text from a Bible-study chapter's nested content tree. */
function collectStudyText(node, out) {
  if (!node) return;
  if (typeof node === 'string') { out.push(node); return; }
  if (Array.isArray(node)) { for (let i = 0; i < node.length; i++) collectStudyText(node[i], out); return; }
  if (typeof node === 'object') {
    if (node.text) out.push(node.text);
    if (node.content) collectStudyText(node.content, out);
    if (node.paragraphs) collectStudyText(node.paragraphs, out);
    if (node.segments) collectStudyText(node.segments, out);
    if (node.v) out.push(node.v);
  }
}

/**
 * Build the full document set (both corpora) for one translation.
 * @param {{translation?: string}} [options]
 * @returns {Array<Object>}
 */
export function buildDocs(options) {
  options = options || {};
  const translation = options.translation || 'nkjv';
  const D = searchData();
  const docs = [];
  let idCounter = 0;
  const nextId = () => 'd' + (idCounter++);

  /** Emit a verse doc — text-only (title intentionally empty). */
  function pushVerse(corpus, bookId, bookTitle, chNum, verseNum, text, heading) {
    if (!text) return;
    docs.push({
      id: nextId(),
      kind: 'verse',
      corpus,
      bookId,
      chapterNum: chNum,
      verseNum,
      letterId: '',
      letterNum: 0,
      volumeId: bookId === 'matthew' ? 'matthew-study' : 'bible',
      translation,
      testament: bookTestament(bookId),
      genre: bookGenre(bookId),
      title: '', // NOT indexed for verses — pure text only (SRCH-1 lesson)
      heading: heading || '', // stored for display context, NOT indexed
      text,
      ref: bookTitle + ' ' + chNum + ':' + verseNum,
    });
  }

  /** Emit ONE folded doc per letter (name in title + body in text). */
  function pushLetterCollection(letters, volumeId, volumeLabel) {
    if (!Array.isArray(letters)) return;
    for (let i = 0; i < letters.length; i++) {
      const L = letters[i];
      if (!L) continue;
      docs.push({
        id: nextId(),
        kind: 'letter',
        corpus: 'volumes',
        bookId: '',
        chapterNum: 0,
        verseNum: 0,
        letterId: L.id || '',
        letterNum: L.num || 0,
        volumeId,
        translation: 'nkjv',
        testament: '',
        genre: 'volume',
        title: L.title || '', // indexed — the letter NAME
        heading: volumeLabel || '',
        text: letterText(L), // indexed — the body
        ref: volumeLabel + ' · Letter ' + (L.num || '?'),
      });
    }
  }

  /** Emit ONE folded doc per paragraph-entry (WTLB / Blessed / Holy Days). */
  function pushEntryCollection(arr, kind, volumeId, volumeLabel) {
    if (!Array.isArray(arr)) return;
    for (let e = 0; e < arr.length; e++) {
      const en = arr[e];
      if (!en) continue;
      let body = '';
      const paragraphs = en.paragraphs || [];
      for (let p = 0; p < paragraphs.length; p++) {
        const ptxt = paragraphs[p] && paragraphs[p].text ? paragraphs[p].text : '';
        body += ' ' + ptxt.replace(/\{\{[^}]+\}\}/g, ' ');
      }
      body = body.replace(/\s+/g, ' ').trim();
      docs.push({
        id: nextId(),
        kind,
        corpus: 'volumes',
        bookId: '',
        chapterNum: 0,
        verseNum: 0,
        letterId: en.id || '',
        letterNum: en.num || 0,
        volumeId,
        translation: 'nkjv',
        testament: '',
        genre: 'volume',
        title: en.title || '',
        heading: volumeLabel || '',
        text: body,
        ref: volumeLabel + ' ' + (en.num || ''),
      });
    }
  }

  function collectLetters(prefaceVar, arrayVar) {
    const pref = (prefaceVar && typeof window[prefaceVar] !== 'undefined') ? window[prefaceVar] : null;
    const arr = (typeof window[arrayVar] !== 'undefined') ? window[arrayVar] : null;
    if (!arr) return null;
    return pref ? [pref].concat(arr) : arr.slice();
  }

  // ─── Matthew Study Bible — VOLUMES (restored verses only; notes/cross-refs OUT) ───
  if (typeof MATTHEW !== 'undefined' && MATTHEW.chapters) {
    for (let ci = 0; ci < MATTHEW.chapters.length; ci++) {
      const mCh = MATTHEW.chapters[ci];
      const mSections = mCh.sections || [];
      for (let si = 0; si < mSections.length; si++) {
        const mSec = mSections[si];
        const mVerses = mSec.verses || [];
        for (let vi = 0; vi < mVerses.length; vi++) {
          pushVerse('volumes', 'matthew', 'Matthew', mCh.num, mVerses[vi].n, mVerses[vi].text, mSec.heading || '');
        }
      }
    }
  }

  // ─── 66 Bible books — SCRIPTURES (incl. matthew-plain registered in BOOKS) ───
  if (typeof BOOKS !== 'undefined') {
    const altData = (translation !== 'nkjv') ? window['BIBLE_' + translation.toUpperCase()] : null;
    const bookIds = Object.keys(BOOKS);
    for (let bi = 0; bi < bookIds.length; bi++) {
      const book = BOOKS[bookIds[bi]];
      if (!book || !Array.isArray(book.chapters)) continue;
      const altBook = altData ? altData[book.id] : null;
      for (let ch = 0; ch < book.chapters.length; ch++) {
        const chapter = book.chapters[ch];
        if (!chapter) continue;
        const sections = chapter.sections || [];
        for (let sj = 0; sj < sections.length; sj++) {
          const section = sections[sj];
          const verses = section.verses || [];
          for (let vj = 0; vj < verses.length; vj++) {
            const v = verses[vj];
            let text = v.text;
            if (altBook) {
              const altCh = altBook[chapter.num];
              if (Array.isArray(altCh)) {
                for (let avi = 0; avi < altCh.length; avi++) {
                  if (altCh[avi] && altCh[avi].n === v.n) { text = altCh[avi].text; break; }
                }
              }
            }
            pushVerse('scriptures', book.id, book.title, chapter.num, v.n, text, section.heading || '');
          }
        }
      }
    }
  }

  // ─── Letter collections — VOLUMES (V1-V7, Timothy, Flock, Rebuke) ───
  for (let vc = 0; vc < D.VOLUME_COLLECTIONS.length; vc++) {
    const V = D.VOLUME_COLLECTIONS[vc];
    if (V.id === 'wtlb1' || V.id === 'wtlb2' || V.id === 'blessed' || V.id === 'holydays') continue;
    const arr = collectLetters(V.prefaceVar, V.dataVar);
    if (arr) pushLetterCollection(arr, V.id, V.label);
  }

  // ─── Paragraph entry collections — VOLUMES ───
  if (typeof WTLB_ONE !== 'undefined') pushEntryCollection(WTLB_ONE, 'wtlb', 'wtlb1', 'Words To Live By: Part One');
  if (typeof WTLB_TWO !== 'undefined') pushEntryCollection(WTLB_TWO, 'wtlb', 'wtlb2', 'Words To Live By: Part Two');
  if (typeof THE_BLESSED !== 'undefined') pushEntryCollection(THE_BLESSED, 'blessed', 'blessed', 'The Blessed');
  if (typeof HOLY_DAYS !== 'undefined') pushEntryCollection(HOLY_DAYS, 'holy-day', 'holydays', 'Holy Days');

  // ─── Hidden Manna — VOLUMES (same shape as a letter collection) ───
  if (typeof HIDDEN_MANNA !== 'undefined' && Array.isArray(HIDDEN_MANNA)) {
    pushLetterCollection(HIDDEN_MANNA, 'hidden-manna', 'Hidden Manna');
  }

  // ─── Bible Studies — VOLUMES (one doc per study chapter: title + body) ───
  if (typeof BIBLE_STUDIES !== 'undefined' && Array.isArray(BIBLE_STUDIES)) {
    for (let bsi = 0; bsi < BIBLE_STUDIES.length; bsi++) {
      const study = BIBLE_STUDIES[bsi];
      if (!study) continue;
      const studyChaps = study.chapters || [];
      for (let sci = 0; sci < studyChaps.length; sci++) {
        const schap = studyChaps[sci];
        if (!schap) continue;
        const bodyBits = [];
        collectStudyText(schap.content, bodyBits);
        const bodyStr = bodyBits.join(' ').replace(/\s+/g, ' ').trim();
        docs.push({
          id: nextId(),
          kind: 'bible-study',
          corpus: 'volumes',
          bookId: '',
          chapterNum: schap.num || 0,
          verseNum: 0,
          letterId: study.slug || '',
          letterNum: schap.num || 0,
          volumeId: 'bible-studies',
          translation: 'nkjv',
          testament: '',
          genre: 'study',
          title: study.title + (schap.title ? ' — ' + schap.title : ''),
          heading: study.title || '',
          text: bodyStr || schap.title || '',
          ref: (study.title || 'Study') + ' ' + (schap.num || ''),
        });
      }
    }
  }

  return docs;
}
