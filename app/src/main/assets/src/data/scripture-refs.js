/* ═══════════════════════════════════════════════════════════════
   SCRIPTURE REFERENCE PRIMITIVES
   Shared by parseScriptureRef, lookupVersesFromBooks, searchNavIndex.
═══════════════════════════════════════════════════════════════ */

function _allBooks() { return window.__ALL_BOOKS || (typeof BOOKS !== 'undefined' ? BOOKS : {}); }
function _matthew() { return (typeof window !== 'undefined' && window.MATTHEW) || (typeof MATTHEW !== 'undefined' ? MATTHEW : null); }
function _studies() { return typeof BIBLE_STUDIES !== 'undefined' ? BIBLE_STUDIES : []; }

function parseRefStr(str) {
  if (!str) return null;
  const s = str.trim();
  const tagM = s.match(/\s*\(([A-Za-z]+)\)\s*$/);
  const clean = tagM ? s.slice(0, tagM.index).trim() : s;
  const m = clean.match(/^(\d?\s*[A-Z][a-z\s]+?)\s+(\d+)(?::(\d+)(?:\s*-\s*(\d+))?)?$/);
  if (!m) return null;
  return {
    rawBook: m[1].trim(),
    chapter: parseInt(m[2], 10),
    verse: m[3] ? parseInt(m[3], 10) : null,
    verseEnd: m[4] ? parseInt(m[4], 10) : null,
    tag: tagM ? tagM[1] : null
  };
}

function findBook(rawName) {
  if (rawName == null) return null;
  const books = _allBooks();
  const q = String(rawName).toLowerCase().replace(/\s+/g, '');
  if (!q) return null;
  for (const k of Object.keys(books)) {
    const b = books[k];
    if (!b || !b.title) continue;
    const t = b.title.toLowerCase().replace(/\s+/g, '');
    if (t === q || t.startsWith(q) || b.id === q ||
        t === q + 's' || t.replace(/s$/, '') === q.replace(/s$/, ''))
      return k;
  }
  return null;
}

function parseScriptureRef(str) {
  const p = parseRefStr(str);
  if (!p || p.verse == null) return null;
  const bookKey = findBook(p.rawBook);
  if (!bookKey) return null;
  const books = _allBooks();
  const book = books[bookKey];
  const ch = book.chapters && book.chapters.find(c => c.num === p.chapter);
  if (!ch) return null;
  const v = ch.sections && ch.sections.flatMap(s => s.verses).find(v => v.n === p.verse);
  const label = book.title + ' ' + p.chapter + ':' + p.verse + (p.verseEnd ? '-' + p.verseEnd : '');
  return { bookId: bookKey, bookTitle: book.title, chapter: p.chapter, verse: p.verse, verseEnd: p.verseEnd, label, text: v ? v.text : '' };
}

function resolveScriptureText(ref, entryScriptures, collectionScriptures) {
  if (!ref) return null;
  if (entryScriptures && entryScriptures[ref]) return entryScriptures[ref];
  if (collectionScriptures && collectionScriptures[ref]) return collectionScriptures[ref];
  return lookupVersesFromBooks(ref);
}

function lookupVersesFromBooks(ref) {
  const p = parseRefStr(ref);
  if (!p || p.verse == null) return null;
  const bookKey = findBook(p.rawBook);
  if (!bookKey) return null;
  const vEnd = p.verseEnd || p.verse;

  if (p.tag) {
    const code = String(p.tag).toLowerCase();
    if (code !== 'nkjv') {
      const data = (typeof window !== 'undefined') ? window['BIBLE_' + code.toUpperCase()] : null;
      if (data && data[bookKey] && data[bookKey][p.chapter]) {
        const altList = data[bookKey][p.chapter].filter(v => v.n >= p.verse && v.n <= vEnd);
        if (altList.length) {
          return altList.length === 1 ? altList[0].text : altList.map(v => `${v.n}. ${v.text}`).join(' ');
        }
      } else if (typeof loadTranslation === 'function') {
        try { loadTranslation(code); } catch (e) {}
      }
    }
  }

  const books = _allBooks();
  const book = books[bookKey];
  const chapter = (book && book.chapters || []).find(c => c.num === p.chapter);
  if (!chapter) return null;
  const allVerses = chapter.sections ?
    chapter.sections.flatMap(s => s.verses || []) :
    chapter.verses || [];
  const verses = allVerses.filter(v => v.n >= p.verse && v.n <= vEnd);
  if (!verses.length) return null;
  return verses.length === 1 ? verses[0].text : verses.map(v => `${v.n}. ${v.text}`).join(' ');
}

function resolveVerseText(endpoint) {
  if (endpoint.type === 'bible') {
    return resolveScriptureText(endpoint.label, null, null);
  }
  if (endpoint.type === 'study') {
    const M = _matthew();
    if (!M) return endpoint.preview || '';
    const ch = M.chapters && M.chapters.find(c => c.num === endpoint.chapter);
    if (!ch) return endpoint.preview || '';
    if (endpoint.verse) {
      return resolveScriptureText(endpoint.label, typeof MATTHEW_NKJV !== 'undefined' ? MATTHEW_NKJV : null, null);
    }
    return ch.title || endpoint.preview || '';
  }
  return endpoint.text || endpoint.preview || '';
}

function findEntryContext(id, kindHint) {
  if (!id) return null;
  const cols = kindHint ? COLLECTIONS.filter(c => c.kind === kindHint) : COLLECTIONS;
  for (const col of cols) {
    const pref = colPreface(col);
    if (pref && pref.id === id) return { kind: col.kind, screen: col.letterScreen, collection: col.label, title: pref.title || id, entry: pref };
    const arr = colLetters(col);
    if (!Array.isArray(arr)) continue;
    const f = arr.find(e => e && e.id === id);
    if (f) return { kind: col.kind, screen: col.letterScreen, collection: col.label, title: f.title || id, entry: f };
  }
  if (kindHint === 'letter') {
    const hdCol = COL_BY_KEY && COL_BY_KEY.get ? COL_BY_KEY.get('holydays') : null;
    if (hdCol) {
      const arr = colLetters(hdCol);
      if (Array.isArray(arr)) {
        const f = arr.find(e => e && e.id === id);
        if (f) return { kind: 'holy-days', screen: hdCol.letterScreen, collection: hdCol.label, title: f.title || id, entry: f };
      }
    }
  }
  if (kindHint && kindHint !== 'letter') return null;
  var _bs = _studies();
  if (_bs.length > 0) {
    for (const study of _bs) {
      if (!study || !Array.isArray(study.chapters)) continue;
      const f = study.chapters.find(c => c && c.id === id);
      if (f) return { kind: 'study-letter', screen: 'bible-study-chapter', collection: study.title || 'Bible Study', title: f.title || id, entry: f, studyId: study.slug || study.id, studyChapterId: f.id };
    }
  }
  return null;
}

function bookCategory(bookId) {
  var ot = (typeof OT_BOOK_IDS !== 'undefined') ? OT_BOOK_IDS : _OT_BOOKS_INLINE;
  return ot.has(bookId) ? 'Old Testament' : 'New Testament';
}

var _OT_BOOKS_INLINE = new Set(['genesis','exodus','leviticus','numbers','deuteronomy','joshua','judges','ruth',
  '1samuel','2samuel','1kings','2kings','1chronicles','2chronicles','ezra','nehemiah','esther',
  'job','psalms','proverbs','ecclesiastes','songofsolomon','isaiah','jeremiah','lamentations',
  'ezekiel','daniel','hosea','joel','amos','obadiah','jonah','micah','nahum','habakkuk',
  'zephaniah','haggai','zechariah','malachi']);

function firstVerseOfRef(refStr) {
  const stripped = refStr.replace(/^\d+:\s*/, '').trim();
  const m = stripped.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function parseRefRanges(refStr) {
  const stripped = refStr.replace(/^\d+:\s*/, '').trim();
  const parts = stripped.split(/,\s*/);
  const ranges = [];
  for (const p of parts) {
    const m = p.match(/(\d+)(?:\s*-\s*(\d+))?/);
    if (m) ranges.push({ start: parseInt(m[1], 10), end: parseInt(m[2] || m[1], 10) });
  }
  return ranges;
}

function lastVerseOfFirstRange(refStr) {
  const ranges = parseRefRanges(refStr);
  return ranges.length > 0 ? ranges[0].end : firstVerseOfRef(refStr);
}

function echoVersesForRef(refStr) {
  const ranges = parseRefRanges(refStr);
  if (ranges.length <= 1) return [];
  return ranges.slice(1).map((r) => r.end);
}

function getNotesForVerse(chapter, verseNum) {
  const scriptures = (chapter.scriptures || []).filter((s) => lastVerseOfFirstRange(s.ref) === verseNum);
  const votNotes = (chapter.votNotes || []).filter((n) => lastVerseOfFirstRange(n.ref) === verseNum);
  return { scriptures, votNotes };
}

function getEchoesForVerse(chapter, verseNum) {
  const scriptures = (chapter.scriptures || []).filter((s) => echoVersesForRef(s.ref).includes(verseNum));
  const votNotes = (chapter.votNotes || []).filter((n) => echoVersesForRef(n.ref).includes(verseNum));
  return { scriptures, votNotes };
}
