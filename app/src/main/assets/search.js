/* ═════════════════════════════════════════════════════════════════════════
   VotReader Search — powered by FlexSearch (window.FlexSearch).
   Depends on: window.VotSearchData (from search-data.js), window.FlexSearch,
   and all data globals loaded via <script src="src/data/*.js">.

   Exposes: window.VotSearch = { init, ensureTranslations, parse,
                                 search, suggest, commands, highlight,
                                 snippet, getStats, rebuild }
═════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

var D = window.VotSearchData;
var F = window.FlexSearch;
if (!D) { console.error('[VotSearch] search-data.js missing'); return; }
if (!F) { console.error('[VotSearch] flexsearch.min.js missing'); return; }

// ─── Engine state — DUAL ENGINES ───
// Scriptures (66-book Bible, incl. plain NKJV Matthew) and Volumes (everything
// else: Matthew Study Bible, V1-V7, Timothy, Flock, Rebuke, Blessed, WTLB,
// Holy Days, Hidden Manna, Bible Studies) live in genuinely separate engines:
// separate doc arrays, separate FlexSearch Documents, separate docStores,
// separate IndexedDB cache entries. No cross-contamination possible — a
// Scriptures search literally cannot return a Volumes doc because the doc
// doesn't exist in that index.
function emptySlot() {
  return {
    code: null, db: null, docStore: null, docCount: 0,
    building: null, buildingCode: null, stats: {}
  };
}
var engines = {
  scriptures: emptySlot(),
  volumes:    emptySlot()
};
var buildError = null;

// ─── IndexedDB cache ───
// Bump SCHEMA_VERSION when doc shape changes OR tokenizer config changes;
// cache is invalidated automatically because the signature includes this.
var SCHEMA_VERSION = 13;                    // bumped 2026-06-01 (U22) — stop indexing section headings / inline topic breaks / chapter titles (curated editorial metadata, not scripture content); forces cached indexes to rebuild without those docs + the 'heading' field
var ALT_TRANSLATIONS = ['kjv', 'asv', 'web', 'bsb', 'hnv', 'lsv', 'ylt'];

// ─── Archaic/modern pronoun normalization (bidirectional) ───
// Applied at BOTH index time AND query time so "thee" ↔ "you", "thy" ↔ "your"
// match across translations. Conservative — pronouns only. Expanding this to
// verb forms ("saith"/"says"/"said") requires full stemming and isn't worth
// the precision loss until we have a concrete need.
// NOTE: quoted phrase search still matches literal text (see executeSearch).
var ARCHAIC_NORMALIZE = {
  'thee':    'you',
  'thou':    'you',
  'ye':      'you',
  'thy':     'your',
  'thine':   'your',
  'thyself': 'yourself'
};

function kjvEncode(str) {
  if (typeof str !== 'string' || !str) return [];
  // Lowercase, strip non-alphanumerics to spaces, split, then map archaic
  // tokens to their modern equivalents. Returns a token array — FlexSearch
  // 0.7 expects encode() to return an array of tokens (not a pre-joined string).
  var tokens = str.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').split(/\s+/);
  var out = [];
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    if (!t) continue;
    out.push(ARCHAIC_NORMALIZE[t] || t);
  }
  return out;
}

// Used by snippet/highlight so "you" typed in the query visually highlights
// "thee" in the displayed verse text (and vice versa). Built from the
// reverse direction of ARCHAIC_NORMALIZE. Bi-directional by construction.
var ARCHAIC_EXPAND = (function () {
  var m = {};
  // Every archaic form → its canonical modern form
  var pairs = Object.keys(ARCHAIC_NORMALIZE);
  for (var i = 0; i < pairs.length; i++) {
    var archaic = pairs[i];
    var modern = ARCHAIC_NORMALIZE[archaic];
    // Modern form expands to all archaic forms that normalize to it
    (m[modern] = m[modern] || [modern]).push(archaic);
    // Each archaic form expands to modern + all sibling archaic forms
    m[archaic] = m[archaic] || [archaic, modern];
  }
  // Second pass: make every archaic form see its siblings that also map to
  // the same modern form (e.g. "thee" should highlight "thou" too).
  for (var a in m) {
    var modernForm = ARCHAIC_NORMALIZE[a];
    if (!modernForm) continue;
    var siblings = m[modernForm];
    for (var j = 0; j < siblings.length; j++) {
      if (m[a].indexOf(siblings[j]) < 0) m[a].push(siblings[j]);
    }
  }
  return m;
})();

function expandArchaicTerms(terms) {
  if (!terms || !terms.length) return [];
  var out = [];
  var seen = Object.create(null);
  for (var i = 0; i < terms.length; i++) {
    var t = (terms[i] || '').toLowerCase();
    if (!t) continue;
    var variants = ARCHAIC_EXPAND[t] || [t];
    for (var j = 0; j < variants.length; j++) {
      if (!seen[variants[j]]) { seen[variants[j]] = true; out.push(variants[j]); }
    }
  }
  return out;
}
var CACHE_DB_NAME  = 'vot-search-cache';
var CACHE_STORE    = 'flex-index';

function ln(v) { return (v && typeof v.length === 'number') ? v.length : 0; }
function kc(v) { return (v && typeof v === 'object') ? Object.keys(v).length : 0; }

function bookChs() {
  if (typeof BOOKS === 'undefined') return 0;
  var n = 0, k = Object.keys(BOOKS);
  for (var i = 0; i < k.length; i++) {
    var b = BOOKS[k[i]];
    if (b && Array.isArray(b.chapters)) n += b.chapters.length;
  }
  return n;
}

function altVerseCount(code) {
  var data = window['BIBLE_' + code.toUpperCase()];
  if (!data) return 0;
  var bkeys = Object.keys(data), n = 0;
  for (var i = 0; i < bkeys.length; i++) {
    var chs = data[bkeys[i]];
    if (!chs) continue;
    var ckeys = Object.keys(chs);
    for (var j = 0; j < ckeys.length; j++) n += (chs[ckeys[j]] || []).length;
  }
  return n;
}

function dataSignature(code, corpus) {
  code = code || 'nkjv';
  corpus = corpus || 'scriptures';
  // Non-bible content signature (identical across translations)
  var parts = [
    'sv' + SCHEMA_VERSION,
    'cp:' + corpus,
    'tr:' + code,
    'mt' + (typeof MATTHEW !== 'undefined' && MATTHEW.chapters ? MATTHEW.chapters.length : 0),
    'v1' + ln(typeof LETTERS_V1 !== 'undefined' ? LETTERS_V1 : []),
    'v2' + ln(typeof LETTERS    !== 'undefined' ? LETTERS    : []),
    'v3' + ln(typeof LETTERS_V3 !== 'undefined' ? LETTERS_V3 : []),
    'v4' + ln(typeof LETTERS_V4 !== 'undefined' ? LETTERS_V4 : []),
    'v5' + ln(typeof LETTERS_V5 !== 'undefined' ? LETTERS_V5 : []),
    'v6' + ln(typeof LETTERS_V6 !== 'undefined' ? LETTERS_V6 : []),
    'v7' + ln(typeof LETTERS_V7 !== 'undefined' ? LETTERS_V7 : []),
    'tm' + ln(typeof LETTERS_TIMOTHY !== 'undefined' ? LETTERS_TIMOTHY : []),
    'fl' + ln(typeof LETTERS_FLOCK   !== 'undefined' ? LETTERS_FLOCK   : []),
    'rb' + ln(typeof LETTERS_REBUKE  !== 'undefined' ? LETTERS_REBUKE  : []),
    'bl' + ln(typeof THE_BLESSED !== 'undefined' ? THE_BLESSED : []),
    'w1' + ln(typeof WTLB_ONE    !== 'undefined' ? WTLB_ONE    : []),
    'w2' + ln(typeof WTLB_TWO    !== 'undefined' ? WTLB_TWO    : []),
    'hd' + ln(typeof HOLY_DAYS   !== 'undefined' ? HOLY_DAYS   : []),
    'hm' + ln(typeof HIDDEN_MANNA!== 'undefined' ? HIDDEN_MANNA: []),
    'bs' + ln(typeof BIBLE_STUDIES !== 'undefined' ? BIBLE_STUDIES : [])
  ];
  if (code === 'nkjv') {
    parts.push('bk' + kc(typeof BOOKS !== 'undefined' ? BOOKS : {}) + '.' + bookChs());
  } else {
    parts.push('av' + altVerseCount(code));
  }
  return parts.join('.');
}

function openCacheDb() {
  return new Promise(function (resolve, reject) {
    if (typeof indexedDB === 'undefined') return reject(new Error('no-indexeddb'));
    var req = indexedDB.open(CACHE_DB_NAME, 1);
    req.onupgradeneeded = function () {
      var db = req.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE);
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror   = function () {
      console.error('[VotSearch][cache] indexedDB open failed:', req.error);
      reject(req.error);
    };
    req.onblocked = function () {
      console.warn('[VotSearch][cache] indexedDB open blocked (another connection holding it)');
    };
  });
}
function cacheGet(key) {
  return openCacheDb().then(function (db) {
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(CACHE_STORE, 'readonly');
        var g = tx.objectStore(CACHE_STORE).get(key);
        g.onsuccess = function () { resolve(g.result || null); };
        g.onerror   = function () {
          console.error('[VotSearch][cache] get failed for', key, g.error);
          resolve(null);
        };
      } catch (e) {
        console.error('[VotSearch][cache] get exception for', key, e);
        resolve(null);
      }
    });
  }).catch(function (e) {
    console.error('[VotSearch][cache] get openDb rejected:', e);
    return null;
  });
}
function cachePut(key, value) {
  return openCacheDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction(CACHE_STORE, 'readwrite');
        var p = tx.objectStore(CACHE_STORE).put(value, key);
        p.onsuccess = function () { resolve(true); };
        p.onerror   = function () {
          console.error('[VotSearch][cache] put failed for', key, p.error);
          resolve(false);
        };
        tx.onerror = function () {
          console.error('[VotSearch][cache] put tx failed for', key, tx.error);
        };
      } catch (e) {
        console.error('[VotSearch][cache] put exception for', key, e);
        resolve(false);
      }
    });
  }).catch(function (e) {
    console.error('[VotSearch][cache] put openDb rejected:', e);
    return false;
  });
}
function cacheClear() {
  return openCacheDb().then(function (db) {
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(CACHE_STORE, 'readwrite');
        var c = tx.objectStore(CACHE_STORE).clear();
        c.onsuccess = function () { resolve(); };
        c.onerror   = function () { resolve(); };
      } catch (e) { resolve(); }
    });
  }).catch(function () {});
}
// Every key currently in the cache store. Used by the eviction path so we
// can delete stale signatures without wiping the live one.
function cacheKeys() {
  return openCacheDb().then(function (db) {
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(CACHE_STORE, 'readonly');
        var req = tx.objectStore(CACHE_STORE).getAllKeys();
        req.onsuccess = function () { resolve((req.result || []).map(String)); };
        req.onerror   = function () { resolve([]); };
      } catch (e) { resolve([]); }
    });
  }).catch(function () { return []; });
}
// Delete one key. Best-effort (resolves regardless), matching cacheGet/Put.
function cacheDelete(key) {
  return openCacheDb().then(function (db) {
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(CACHE_STORE, 'readwrite');
        var d = tx.objectStore(CACHE_STORE).delete(key);
        d.onsuccess = function () { resolve(true); };
        d.onerror   = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }).catch(function () { return false; });
}
// Evict every cached index whose key is NOT in `keepKeys`. This is the fix
// for the unbounded-growth bug: each saveToCache() writes a fresh ~21 MB
// entry under a new dataSignature() (which changes on any corpus edit,
// SCHEMA_VERSION bump, or translation switch), and nothing previously
// deleted the superseded generations — so the vot-search-cache DB grew to
// hundreds of MB of dead index copies. A stale signature can never be hit
// again (tryLoadFromCache looks up by the exact CURRENT sig), so dropping
// everything except the live keys is always safe; the cache is 100%
// rebuildable. Returns the number of entries removed.
async function evictStaleCache(keepKeys) {
  var keep = {};
  for (var i = 0; i < keepKeys.length; i++) keep[keepKeys[i]] = true;
  var all = await cacheKeys();
  var removed = 0;
  for (var j = 0; j < all.length; j++) {
    if (!keep[all[j]]) { await cacheDelete(all[j]); removed++; }
  }
  if (removed > 0) console.log('[VotSearch][cache] evicted ' + removed + ' stale index generation(s)');
  return removed;
}
// Every cached entry as { key, corpus, savedAt }. corpus is parsed from the
// key's `cp:<corpus>` segment; savedAt from the stored value (0 if absent).
// Used by the signature-INDEPENDENT boot purge below.
function cacheEntries() {
  return openCacheDb().then(function (db) {
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(CACHE_STORE, 'readonly');
        var req = tx.objectStore(CACHE_STORE).openCursor();
        var out = [];
        req.onsuccess = function (e) {
          var cur = e.target.result;
          if (cur) {
            var key = String(cur.key);
            var m = key.match(/cp:([a-z]+)/);
            out.push({ key: key, corpus: m ? m[1] : '?', savedAt: (cur.value && cur.value.savedAt) || 0 });
            cur.continue();
          } else { resolve(out); }
        };
        req.onerror = function () { resolve([]); };
      } catch (e) { resolve([]); }
    });
  }).catch(function () { return []; });
}

// Boot-time reclaim: keep only the NEWEST entry per corpus, evict the rest.
//
// This is deliberately signature-INDEPENDENT. The earlier version kept
// dataSignature(code, corpus) — but dataSignature reads the lazy corpus
// globals (BOOKS / MATTHEW / LETTERS_*), which are NOT loaded at app boot,
// so the boot-time signature (…mt0…bk0.0) never matched the real cached
// keys (…mt28…bk66.N) and the purge couldn't identify the live entry. By
// grouping on the key's cp:<corpus> segment and keeping the max-savedAt in
// each group, we reclaim regardless of when corpora load: the freshest
// Scriptures index + the freshest Volumes index survive (those are what the
// next ensureIndex cache-hits), every older generation is dropped. Returns
// the number removed.
async function purgeStaleCache(_code) {
  try {
    var entries = await cacheEntries();
    if (entries.length <= 1) return 0;
    var newestPerCorpus = {};
    entries.forEach(function (e) {
      var cur = newestPerCorpus[e.corpus];
      if (!cur || e.savedAt > cur.savedAt) newestPerCorpus[e.corpus] = e;
    });
    var keep = {};
    Object.keys(newestPerCorpus).forEach(function (c) { keep[newestPerCorpus[c].key] = true; });
    var removed = 0;
    for (var i = 0; i < entries.length; i++) {
      if (!keep[entries[i].key]) { await cacheDelete(entries[i].key); removed++; }
    }
    if (removed > 0) console.log('[VotSearch][cache] boot purge removed ' + removed + ' stale index generation(s)');
    return removed;
  } catch (e) { return 0; }
}

function bookTestament(bookId) {
  return D.OT_BOOK_IDS.indexOf(bookId) >= 0 ? 'ot' : D.NT_BOOK_IDS.indexOf(bookId) >= 0 ? 'nt' : '';
}
function bookGenre(bookId) {
  for (var g in D.GENRE_GROUPS) { if (D.GENRE_GROUPS[g].indexOf(bookId) >= 0) return g; } return '';
}

// ─── Index building ───
// Produces doc array for a single translation code. Verse text is pulled from
// that translation's data; curated content (chapter titles, section headings,
// letters, study notes) is included regardless of translation.
function buildDocs(options) {
  options = options || {};
  var translation = options.translation || 'nkjv';
  var corpus = options.corpus || 'scriptures';   // 'scriptures' | 'volumes'
  var isScriptures = corpus === 'scriptures';
  var isVolumes    = corpus === 'volumes';
  var docs = [];
  var idCounter = 0;
  function nextId() { return 'd' + (idCounter++); }

  function pushVerse(bookId, bookTitle, chNum, verseNum, text, heading, searchTexts) {
    if (!text) return;
    var doc = {
      id: nextId(),
      kind: 'verse',
      bookId: bookId,
      chapterNum: chNum,
      verseNum: verseNum,
      letterId: '',
      letterNum: 0,
      volumeId: bookId === 'matthew' ? 'matthew-study' : 'bible',
      translation: translation,
      testament: bookTestament(bookId),
      genre: bookGenre(bookId),
      title: bookTitle,
      heading: heading || '',
      text: text,
      ref: bookTitle + ' ' + chNum + ':' + verseNum
    };
    // _searchText is consumed by buildIndex (indexed but stripped from docStore).
    // It contains text from ALL loaded translations so a KJV-style query can
    // match a verse displayed in NKJV, etc.
    if (searchTexts && searchTexts.length > 1) {
      doc._searchText = searchTexts.join(' ');
    }
    docs.push(doc);
  }

  // U22 (user directive 2026-06-01): chapter titles AND section headings /
  // inline topic breaks are curated editorial dividers, NOT scripture content,
  // so they must never be their own search matches. Both are now no-ops — no
  // `kind:'chapter-title'` or `kind:'heading'` docs are emitted. (The heading
  // still rides on each verse doc for result-context display; the 'heading'
  // field is also dropped from the index config so verses don't match on their
  // section heading either.) Kept as named no-ops so the call sites read
  // intentionally rather than looking like a deletion bug.
  function pushChapterTitle() { /* not indexed — see U22 note above */ }
  function pushHeading() { /* not indexed — see U22 note above */ }

  // ─── Matthew Study Bible — VOLUMES ONLY ───
  // The curated study text (YahuShua restored, commentary, votNotes, cross-refs).
  // Belongs on the Volumes side. Scriptures corpus uses MATTHEW_PLAIN instead
  // (emitted naturally as BOOKS['matthew-plain'] below).
  if (isVolumes && typeof MATTHEW !== 'undefined' && MATTHEW.chapters) {
    for (var ci = 0; ci < MATTHEW.chapters.length; ci++) {
      var mCh = MATTHEW.chapters[ci];
      if (mCh.title) pushChapterTitle('matthew', 'Matthew', mCh.num, mCh.title);
      var mSections = mCh.sections || [];
      for (var si = 0; si < mSections.length; si++) {
        var mSec = mSections[si];
        if (mSec.heading) pushHeading('matthew', 'Matthew', mCh.num, mSec.heading);
        var mVerses = mSec.verses || [];
        for (var vi = 0; vi < mVerses.length; vi++) {
          pushVerse('matthew', 'Matthew', mCh.num, mVerses[vi].n, mVerses[vi].text, mSec.heading || '');
        }
      }
      // Matthew votNotes — folded as study-notes (includes Hidden Manna naturally)
      var mNotes = mCh.votNotes || [];
      for (var ni = 0; ni < mNotes.length; ni++) {
        var n = mNotes[ni];
        var noteText = [n.excerpt, n.letter, n.vol].filter(Boolean).join(' — ');
        docs.push({
          id: nextId(),
          kind: 'study-note',
          bookId: 'matthew',
          chapterNum: mCh.num,
          verseNum: 0,
          letterId: '',
          letterNum: 0,
          volumeId: 'matthew-study',
          translation: 'nkjv',
          testament: 'nt',
          genre: 'gospels',
          title: n.letter || '',
          heading: n.vol || '',
          text: noteText,
          ref: 'Matthew ' + (n.ref || '')
        });
      }
      // Matthew cross-references (scriptures)
      var mXrefs = mCh.scriptures || [];
      for (var xi = 0; xi < mXrefs.length; xi++) {
        var xr = mXrefs[xi];
        docs.push({
          id: nextId(),
          kind: 'cross-ref',
          bookId: 'matthew',
          chapterNum: mCh.num,
          verseNum: 0,
          letterId: '',
          letterNum: 0,
          volumeId: 'matthew-study',
          translation: 'nkjv',
          testament: 'nt',
          genre: 'gospels',
          title: '',
          heading: '',
          text: xr.cite || '',
          ref: 'Matthew ' + (xr.ref || '')
        });
      }
    }
  }

  // ─── 66 Bible books — SCRIPTURES ONLY ───
  // Includes matthew-plain (registered in BOOKS at runtime) so Scriptures
  // corpus has plain-NKJV Matthew searchable and routable via bible-ch.
  if (isScriptures && typeof BOOKS !== 'undefined') {
    var altData = (translation !== 'nkjv') ? window['BIBLE_' + translation.toUpperCase()] : null;
    // Gather all loaded alt-translation roots once for cross-translation indexing.
    var altRoots = [];
    for (var atc = 0; atc < ALT_TRANSLATIONS.length; atc++) {
      var atRoot = window['BIBLE_' + ALT_TRANSLATIONS[atc].toUpperCase()];
      if (atRoot) altRoots.push(atRoot);
    }
    var bookIds = Object.keys(BOOKS);
    for (var bi = 0; bi < bookIds.length; bi++) {
      var book = BOOKS[bookIds[bi]];
      if (!book || !Array.isArray(book.chapters)) continue;

      var altBook = altData ? altData[book.id] : null;
      // Pre-compute per-book translation roots so we don't lookup every verse.
      var altBooksAll = [];
      for (var ar = 0; ar < altRoots.length; ar++) {
        var ab = altRoots[ar][book.id];
        if (ab) altBooksAll.push(ab);
      }

      for (var ch = 0; ch < book.chapters.length; ch++) {
        var chapter = book.chapters[ch];
        if (!chapter) continue;
        if (chapter.title) pushChapterTitle(book.id, book.title, chapter.num, chapter.title);
        var sections = chapter.sections || [];
        for (var sj = 0; sj < sections.length; sj++) {
          var section = sections[sj];
          if (section.heading) pushHeading(book.id, book.title, chapter.num, section.heading);
          var verses = section.verses || [];
          for (var vj = 0; vj < verses.length; vj++) {
            var v = verses[vj];
            var text = v.text;
            if (altBook) {
              var altCh = altBook[chapter.num];
              if (Array.isArray(altCh)) {
                for (var avi = 0; avi < altCh.length; avi++) {
                  if (altCh[avi] && altCh[avi].n === v.n) { text = altCh[avi].text; break; }
                }
              }
            }
            // Build cross-translation search corpus for this verse — includes
            // NKJV (via v.text) and any alt translations that have the verse.
            var searchTexts = [v.text];
            for (var abAll = 0; abAll < altBooksAll.length; abAll++) {
              var altChAll = altBooksAll[abAll][chapter.num];
              if (!Array.isArray(altChAll)) continue;
              for (var avAll = 0; avAll < altChAll.length; avAll++) {
                if (altChAll[avAll] && altChAll[avAll].n === v.n && altChAll[avAll].text) {
                  searchTexts.push(altChAll[avAll].text);
                  break;
                }
              }
            }
            pushVerse(book.id, book.title, chapter.num, v.n, text, section.heading || '', searchTexts);
          }
        }
      }

      // Alt translations may have verses not covered by our BOOKS sections
      // (rare — usually section breaks align). Fold in any stragglers without
      // heading metadata so nothing is lost.
      if (altBook) {
        var seenKey = {};
        for (var ck2 = 0; ck2 < book.chapters.length; ck2++) {
          var c2 = book.chapters[ck2];
          if (!c2) continue;
          var secs2 = c2.sections || [];
          for (var sj2 = 0; sj2 < secs2.length; sj2++) {
            var vs2 = secs2[sj2].verses || [];
            for (var vj2 = 0; vj2 < vs2.length; vj2++) {
              seenKey[c2.num + ':' + vs2[vj2].n] = true;
            }
          }
        }
        var altChKeys = Object.keys(altBook);
        for (var ak = 0; ak < altChKeys.length; ak++) {
          var achNum = parseInt(altChKeys[ak], 10);
          if (isNaN(achNum)) continue;
          var achVerses = altBook[altChKeys[ak]];
          if (!Array.isArray(achVerses)) continue;
          for (var av = 0; av < achVerses.length; av++) {
            var avObj = achVerses[av];
            if (!avObj || seenKey[achNum + ':' + avObj.n]) continue;
            pushVerse(book.id, book.title, achNum, avObj.n, avObj.text, '');
          }
        }
      }
    }
  }

  // ─── Letter collections ───
  function letterText(letter) {
    if (!letter) return '';
    if (!letter.blocks) return '';
    var out = [];
    for (var bk2 = 0; bk2 < letter.blocks.length; bk2++) {
      var b = letter.blocks[bk2];
      if (b.segments) {
        for (var seg = 0; seg < b.segments.length; seg++) out.push(b.segments[seg].v || '');
      } else if (b.lines) {
        for (var li = 0; li < b.lines.length; li++) {
          var line = b.lines[li];
          if (Array.isArray(line)) {
            for (var ls = 0; ls < line.length; ls++) out.push(line[ls].v || '');
          }
        }
      }
    }
    return out.join(' ').replace(/\s+/g, ' ').trim();
  }

  function pushLetterCollection(letters, volumeId, volumeLabel) {
    if (!Array.isArray(letters)) return;
    for (var ii = 0; ii < letters.length; ii++) {
      var L = letters[ii];
      if (!L) continue;
      var body = letterText(L);
      // Letter title as its own doc (ranks high for title queries)
      docs.push({
        id: nextId(),
        kind: 'letter-title',
        bookId: '',
        chapterNum: 0,
        verseNum: 0,
        letterId: L.id || '',
        letterNum: L.num || 0,
        volumeId: volumeId,
        translation: 'nkjv',
        testament: '',
        genre: 'volume',
        title: L.title || '',
        heading: volumeLabel || '',
        text: L.title || '',
        ref: volumeLabel + ' · Letter ' + (L.num || '?')
      });
      // Letter body
      if (body) {
        docs.push({
          id: nextId(),
          kind: 'letter',
          bookId: '',
          chapterNum: 0,
          verseNum: 0,
          letterId: L.id || '',
          letterNum: L.num || 0,
          volumeId: volumeId,
          translation: 'nkjv',
          testament: '',
          genre: 'volume',
          title: L.title || '',
          heading: volumeLabel || '',
          text: body,
          ref: volumeLabel + ' · Letter ' + (L.num || '?')
        });
      }
      // Footnotes: embedded nkjv scripture lookups
      if (L.nkjv) {
        var nkKeys = Object.keys(L.nkjv);
        for (var fk = 0; fk < nkKeys.length; fk++) {
          var fref = nkKeys[fk];
          var ftxt = L.nkjv[fref] || '';
          docs.push({
            id: nextId(),
            kind: 'footnote',
            bookId: '',
            chapterNum: 0,
            verseNum: 0,
            letterId: L.id || '',
            letterNum: L.num || 0,
            volumeId: volumeId,
            translation: 'nkjv',
            testament: '',
            genre: 'volume',
            title: L.title || '',
            heading: fref,
            text: ftxt,
            ref: fref + ' (' + volumeLabel + ' L' + (L.num || '?') + ')'
          });
        }
      }
    }
  }

  function collectLetters(prefaceVar, arrayVar) {
    var pref = (typeof window[prefaceVar] !== 'undefined' && prefaceVar) ? window[prefaceVar] : null;
    var arr = (typeof window[arrayVar] !== 'undefined') ? window[arrayVar] : null;
    if (!arr) return null;
    return pref ? [pref].concat(arr) : arr.slice();
  }

  // ─── WTLB Parts 1 & 2, The Blessed, Holy Days — paragraph entries ───
  function pushEntryCollection(arr, kind, volumeId, volumeLabel) {
    if (!Array.isArray(arr)) return;
    for (var e = 0; e < arr.length; e++) {
      var en = arr[e];
      if (!en) continue;
      var paragraphs = en.paragraphs || [];
      var body = '';
      for (var p = 0; p < paragraphs.length; p++) {
        var ptxt = paragraphs[p] && paragraphs[p].text ? paragraphs[p].text : '';
        body += ' ' + ptxt;
      }
      body = body.replace(/\s+/g, ' ').trim();
      // title doc
      docs.push({
        id: nextId(),
        kind: kind + '-title',
        bookId: '',
        chapterNum: 0,
        verseNum: 0,
        letterId: en.id || '',
        letterNum: en.num || 0,
        volumeId: volumeId,
        translation: 'nkjv',
        testament: '',
        genre: 'volume',
        title: en.title || '',
        heading: volumeLabel || '',
        text: en.title || '',
        ref: volumeLabel + ' ' + (en.num || '')
      });
      if (body) {
        docs.push({
          id: nextId(),
          kind: kind,
          bookId: '',
          chapterNum: 0,
          verseNum: 0,
          letterId: en.id || '',
          letterNum: en.num || 0,
          volumeId: volumeId,
          translation: 'nkjv',
          testament: '',
          genre: 'volume',
          title: en.title || '',
          heading: volumeLabel || '',
          text: body,
          ref: volumeLabel + ' ' + (en.num || '')
        });
      }
    }
  }

  // ─── Letter collections — VOLUMES ONLY ───
  if (isVolumes) {
  for (var vc = 0; vc < D.VOLUME_COLLECTIONS.length; vc++) {
    var V = D.VOLUME_COLLECTIONS[vc];
    if (V.id === 'wtlb1' || V.id === 'wtlb2' || V.id === 'blessed' || V.id === 'holydays') continue;
    var arr = collectLetters(V.prefaceVar, V.dataVar);
    if (arr) pushLetterCollection(arr, V.id, V.label);
  }
  } // end isVolumes guard for VOLUME_COLLECTIONS loop

  if (isVolumes && typeof WTLB_ONE !== 'undefined') pushEntryCollection(WTLB_ONE, 'wtlb', 'wtlb1', 'Words To Live By: Part One');
  if (isVolumes && typeof WTLB_TWO !== 'undefined') pushEntryCollection(WTLB_TWO, 'wtlb', 'wtlb2', 'Words To Live By: Part Two');
  if (isVolumes && typeof THE_BLESSED !== 'undefined') pushEntryCollection(THE_BLESSED, 'blessed', 'blessed', 'The Blessed');
  if (isVolumes && typeof HOLY_DAYS !== 'undefined') pushEntryCollection(HOLY_DAYS, 'holy-day', 'holydays', 'Holy Days');

  // ─── Hidden Manna — VOLUMES ONLY ───
  if (isVolumes && typeof HIDDEN_MANNA !== 'undefined' && Array.isArray(HIDDEN_MANNA)) {
    pushLetterCollection(HIDDEN_MANNA, 'hidden-manna', 'Hidden Manna');
  }

  // ─── Bible Studies — VOLUMES ONLY ───
  if (isVolumes && typeof BIBLE_STUDIES !== 'undefined' && Array.isArray(BIBLE_STUDIES)) {
    for (var bsi = 0; bsi < BIBLE_STUDIES.length; bsi++) {
      var study = BIBLE_STUDIES[bsi];
      if (!study) continue;
      var studyChaps = study.chapters || [];
      for (var sci = 0; sci < studyChaps.length; sci++) {
        var schap = studyChaps[sci];
        if (!schap) continue;
        var bodyBits = [];
        function collectText(node) {
          if (!node) return;
          if (typeof node === 'string') { bodyBits.push(node); return; }
          if (Array.isArray(node)) { for (var q = 0; q < node.length; q++) collectText(node[q]); return; }
          if (typeof node === 'object') {
            if (node.text) bodyBits.push(node.text);
            if (node.content) collectText(node.content);
            if (node.paragraphs) collectText(node.paragraphs);
            if (node.segments) collectText(node.segments);
            if (node.v) bodyBits.push(node.v);
          }
        }
        collectText(schap.content);
        var bodyStr = bodyBits.join(' ').replace(/\s+/g, ' ').trim();
        docs.push({
          id: nextId(),
          kind: 'bible-study',
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
          ref: (study.title || 'Study') + ' ' + (schap.num || '')
        });
      }
    }
  }

  return docs;
}

// ─── Index creation ───
// FlexSearch Document with 4 searchable fields. `forward` tokenization gives
// prefix-match ("righte" hits "righteousness") without the token-explosion of full.
// Per-field search + manual boost merge replicates Orama's field weighting.
function createDb() {
  return new F.Document({
    document: {
      id: 'id',
      index: [
        { field: 'text',    tokenize: 'forward', resolution: 9, encode: kjvEncode },
        { field: 'title',   tokenize: 'forward', resolution: 9, encode: kjvEncode },
        // U22: 'heading' is intentionally NOT indexed — section headings / inline
        // topic breaks are curated editorial dividers, not scripture content, so
        // they must not produce matches. (Heading stays in docStore for display.)
        { field: 'ref',     tokenize: 'forward', resolution: 9, encode: kjvEncode }
      ]
    },
    optimize: true,
    cache: 100
  });
}

// buildIndex: indexes ONE translation for ONE corpus. `docStore` and the
// FlexSearch index are returned together so the caller can swap them atomically.
async function buildIndex(code, corpus, options) {
  options = options || {};
  var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  var docs = buildDocs({ translation: code, corpus: corpus });
  var t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  var db = createDb();
  var store = Object.create(null);
  var CHUNK = 2000;
  for (var i = 0; i < docs.length; i++) {
    var d = docs[i];
    db.add({
      id: d.id,
      text: d._searchText || d.text || '',
      title: d.title || '',
      ref: d.ref || ''
    });
    // Strip the index-only field before storing — keeps docStore (and IndexedDB
    // cache) from bloating with all 7+ translations per verse.
    if (d._searchText) delete d._searchText;
    store[d.id] = d;
    if (i > 0 && i % CHUNK === 0) {
      if (options.onProgress) options.onProgress(i, docs.length);
      await new Promise(function (r) { setTimeout(r, 0); });
    }
  }
  if (options.onProgress) options.onProgress(docs.length, docs.length);
  var t2 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return {
    db: db,
    store: store,
    count: docs.length,
    stats: { docCount: docs.length, buildMs: Math.round(t2 - t0), collectMs: Math.round(t1 - t0), insertMs: Math.round(t2 - t1), cached: false }
  };
}

// FlexSearch export is callback-based: fires once per internal key/shard.
async function exportDb(db) {
  var data = {};
  var keys = [];
  var result = db.export(function (key, payload) {
    keys.push(key);
    data[key] = payload;
  });
  if (result && typeof result.then === 'function') await result;
  return { keys: keys, data: data };
}

function importDb(payload) {
  var db = createDb();
  for (var i = 0; i < payload.keys.length; i++) {
    var k = payload.keys[i];
    db.import(k, payload.data[k]);
  }
  return db;
}

async function tryLoadFromCache(sig) {
  try {
    var cached = await cacheGet(sig);
    if (!cached || !cached.payload || !cached.payload.index || !cached.payload.store) return null;
    var db = importDb(cached.payload.index);
    var store = cached.payload.store;
    var storeCount = 0;
    for (var _k in store) { if (Object.prototype.hasOwnProperty.call(store, _k)) storeCount++; }
    if (storeCount < 1000) {
      console.warn('[VotSearch] cached store suspiciously small (' + storeCount + '), rebuilding');
      return null;
    }
    var testRes = db.search('god', { index: 'text', limit: 1 });
    var testIds = [];
    if (Array.isArray(testRes)) {
      for (var tr = 0; tr < testRes.length; tr++) {
        var te = testRes[tr];
        if (te && te.result) { for (var tri = 0; tri < te.result.length; tri++) testIds.push(te.result[tri]); }
      }
    }
    if (!testIds.length) {
      console.warn('[VotSearch] cached index fails fulltext validation (trie empty?), rebuilding');
      return null;
    }
    return { db: db, store: store, count: storeCount };
  } catch (e) {
    console.warn('[VotSearch] cache load failed; rebuilding', e);
    return null;
  }
}

async function saveToCache(sig, db, store, corpus, code) {
  try {
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var idx = await exportDb(db);
    var t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var ok = await cachePut(sig, { sig: sig, payload: { index: idx, store: store }, savedAt: Date.now() });
    var t2 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (ok) {
      console.log('[VotSearch] cache saved — sig=' + sig.slice(0, 40) + '…, export=' + Math.round(t1-t0) + 'ms, put=' + Math.round(t2-t1) + 'ms, keys=' + idx.keys.length);
      // Self-evict: this corpus's PRIOR signatures are now dead. Keep only the
      // key we just wrote + the OTHER corpus's current key (the two corpora
      // share one cache store, and a same-translation switch between them must
      // not wipe the sibling). Without this the store grew unbounded — one
      // ~21 MB generation per corpus edit / SCHEMA_VERSION bump / translation.
      try {
        var sibling = (corpus === 'scriptures') ? 'volumes' : 'scriptures';
        await evictStaleCache([sig, dataSignature(code, sibling)]);
      } catch (_e) { /* eviction is best-effort; a miss just leaves disk to the next save */ }
    } else {
      console.warn('[VotSearch] cache save reported failure (see previous errors)');
    }
    return ok;
  } catch (e) {
    console.warn('[VotSearch] cache save threw', e);
    return false;
  }
}

// ensureIndex(code, corpus) — guarantees engines[corpus].db is loaded for `code`.
// Per-corpus engines are independent; loading Scriptures does not affect Volumes.
async function ensureIndex(code, corpus, options) {
  code = code || 'nkjv';
  corpus = corpus || 'scriptures';
  options = options || {};
  var slot = engines[corpus];
  if (!slot) throw new Error('[VotSearch] unknown corpus: ' + corpus);
  if (slot.code === code && slot.db) return slot.db;
  if (slot.building && slot.buildingCode === code) return slot.building;
  if (slot.building) {
    try { await slot.building; } catch (e) {}
    if (slot.code === code && slot.db) return slot.db;
  }
  slot.buildingCode = code;
  slot.building = (async function () {
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var sig = dataSignature(code, corpus);
    try {
      console.log('[VotSearch] ensureIndex(' + corpus + '/' + code + ') — sig=' + sig.slice(0, 48) + '…');
      var cached = await tryLoadFromCache(sig);
      if (cached) {
        dropActive(corpus);
        slot.code = code;
        slot.db = cached.db;
        slot.docStore = cached.store;
        slot.docCount = cached.count;
        var t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        slot.stats = { docCount: cached.count, buildMs: Math.round(t1 - t0), cached: true };
        console.log('[VotSearch] cache HIT for ' + corpus + '/' + code + ' — ' + cached.count + ' docs in ' + Math.round(t1-t0) + 'ms');
        return cached.db;
      }
      console.log('[VotSearch] cache MISS for ' + corpus + '/' + code + ' — building fresh');
      // U4: the scriptures index folds in cross-translation wording (KJV/ASV/…),
      // so the ~31 MB of alt Bible translations must be loaded BEFORE building.
      // This line is reached ONLY on a cache MISS — a warm index (the common
      // case) cache-HITs above and returns WITHOUT ever loading the translations.
      // That's the fix: opening search no longer pulls 31 MB every time (and on
      // web, no per-session re-download of the alt-translation scripts).
      if (corpus === 'scriptures') await loadAllTranslations();
      var built = await buildIndex(code, corpus, options);
      dropActive(corpus);
      slot.code = code;
      slot.db = built.db;
      slot.docStore = built.store;
      slot.docCount = built.count;
      slot.stats = built.stats;
      saveToCache(sig, built.db, built.store, corpus, code);
      return built.db;
    } catch (e) {
      buildError = e;
      console.error('[VotSearch] build failed for ' + corpus + '/' + code, e);
      throw e;
    } finally {
      slot.building = null;
      slot.buildingCode = null;
    }
  })();
  return slot.building;
}

// Drop one corpus's loaded index (doesn't touch IndexedDB cache).
function dropActive(corpus) {
  var slot = engines[corpus];
  if (!slot) return;
  slot.code = null;
  slot.db = null;
  slot.docStore = null;
  slot.docCount = 0;
  slot.stats = {};
}

// tryLoadFromCache / saveToCache already signature-keyed — cp:corpus is in sig,
// so Scriptures and Volumes naturally occupy different IndexedDB entries.
// 0 collisions by construction.

// Load every alt Bible translation script so the scriptures index can match
// queries written in any translation's wording (e.g. KJV "take unto you the
// whole armour" finds the verse displayed as NKJV "take up the whole armor").
// Each load is fire-and-forget — missing files just reduce search coverage.
function loadOneTranslation(code) {
  return new Promise(function (resolve) {
    if (window['BIBLE_' + code.toUpperCase()]) return resolve();
    var script = document.createElement('script');
    script.src = 'src/data/bible-' + code + '.js';
    script.async = true;
    script.onload = function () { resolve(); };
    script.onerror = function () { resolve(); };
    document.head.appendChild(script);
  });
}
async function loadAllTranslations() {
  var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  await Promise.all(ALT_TRANSLATIONS.map(loadOneTranslation));
  var t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  var loaded = ALT_TRANSLATIONS.filter(function (c) { return !!window['BIBLE_' + c.toUpperCase()]; });
  console.log('[VotSearch] loaded ' + loaded.length + '/' + ALT_TRANSLATIONS.length + ' alt translations in ' + Math.round(t1-t0) + 'ms — ' + loaded.join(','));
}

// Public init — builds BOTH engines for the given translation. Scriptures and
// Volumes are built in parallel; first search returns whenever its engine is up.
// Alt translations are loaded lazily by ensureIndex ONLY when the scriptures
// index is (re)built (cache miss) — never on a warm-cache open (U4).
async function init(options) {
  options = options || {};
  var code = options.translation || 'nkjv';
  var corpora = options.corpora || ['scriptures', 'volumes'];
  // One-time reclaim of pre-existing stale index generations (the bug that
  // grew vot-search-cache to hundreds of MB before saveToCache self-evicted).
  // Fire-and-forget: it must never delay search readiness, and it only
  // deletes superseded keys — the current-signature entries this very init
  // is about to load/build are preserved, so it never forces a rebuild.
  purgeStaleCache(code).catch(function () {});
  // U4: ensureIndex now loads the alt Bible translations ITSELF, but only on a
  // cache MISS (the build needs them). So a warm index opens search with ZERO
  // translation downloads — init() previously pulled ~31 MB unconditionally on
  // EVERY open (even a cache hit) and, on web, re-downloaded them each session.
  // Scriptures + Volumes build in parallel; first search returns when its engine is up.
  var builds = [];
  if (corpora.indexOf('volumes') >= 0) builds.push(ensureIndex(code, 'volumes', options));
  if (corpora.indexOf('scriptures') >= 0) builds.push(ensureIndex(code, 'scriptures', options));
  await Promise.all(builds);
  return true;
}

async function clearCache() {
  await cacheClear();
}

async function rebuild(options) {
  options = options || {};
  var code = options.translation ||
             (engines.scriptures.code || engines.volumes.code || 'nkjv');
  dropActive('scriptures');
  dropActive('volumes');
  await cacheClear();
  return init({ translation: code });
}

// Kept for backwards compatibility. Loads alt-translation data files via
// `loadFn` so they're available when the user selects that translation; does
// NOT build indexes proactively (each index is built lazily on first use).
async function ensureTranslations(codes, loadFn) {
  codes = codes || [];
  for (var i = 0; i < codes.length; i++) {
    var c = codes[i];
    if (c !== 'nkjv' && !window['BIBLE_' + c.toUpperCase()] && typeof loadFn === 'function') {
      await loadFn(c);
    }
  }
}

// ─── Query parsing ───
// Returns one of:
//   { kind:'command', action, label }
//   { kind:'ref-bible', bookId, bookTitle, chapter, verseStart?, verseEnd?, chapterEnd? }
//   { kind:'ref-letter', volumeId, letterNum?, letterId?, screen, label }
//   { kind:'ref-book', bookId, bookTitle }
//   { kind:'named-passage', ... same as ref-bible fields, plus label }
//   { kind:'text', cleanQuery, phrase?, must:[], mustNot:[], terms:[] }
function parseWordNum(s) {
  if (!s) return null;
  s = s.trim().toLowerCase();
  var n = parseInt(s, 10);
  if (!isNaN(n)) return n;
  if (D.WORD_NUMS.hasOwnProperty(s)) return D.WORD_NUMS[s];
  if (D.ROMAN_NUMS.hasOwnProperty(s)) return D.ROMAN_NUMS[s];
  return null;
}

function resolveBookToken(raw) {
  if (!raw) return null;
  var t = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (D.BOOK_ABBREVS[t]) return D.BOOK_ABBREVS[t];
  // try without spaces
  var collapsed = t.replace(/\s+/g, '');
  if (D.BOOK_ABBREVS[collapsed]) return D.BOOK_ABBREVS[collapsed];
  // try with space variants for numbered books ("1corinthians" ↔ "1 corinthians")
  var spaced = t.replace(/^([123])([a-z])/, '$1 $2');
  if (D.BOOK_ABBREVS[spaced]) return D.BOOK_ABBREVS[spaced];
  return null;
}

function fuzzyBookSuggest(raw) {
  if (!raw || raw.length < 2) return null;
  var t = raw.toLowerCase();
  var bestId = null, bestScore = Infinity;
  var keys = Object.keys(D.BOOK_ABBREVS);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k.length < 2) continue;
    var d = levenshtein(t, k, 2);
    if (d < bestScore) { bestScore = d; bestId = D.BOOK_ABBREVS[k]; }
    if (bestScore === 0) break;
  }
  return bestScore <= 2 ? bestId : null;
}

function levenshtein(a, b, cap) {
  cap = cap || 3;
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  var prev = new Array(b.length + 1);
  for (var j = 0; j <= b.length; j++) prev[j] = j;
  for (var i = 1; i <= a.length; i++) {
    var cur = [i];
    var rowMin = i;
    for (var j2 = 1; j2 <= b.length; j2++) {
      var c = a[i - 1] === b[j2 - 1] ? 0 : 1;
      var v = Math.min(prev[j2] + 1, cur[j2 - 1] + 1, prev[j2 - 1] + c);
      cur[j2] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

function parse(query, parseOpts) {
  if (!query) return null;
  var q = query.trim();
  if (!q) return null;
  var lower = q.toLowerCase();
  var pCorpus = (parseOpts && parseOpts.corpus) || 'all';
  var allowScriptureRefs = (pCorpus === 'all' || pCorpus === 'scriptures');
  var allowVolumeRefs    = (pCorpus === 'all' || pCorpus === 'volumes');

  // Command palette
  if (D.COMMAND_MAP[lower]) {
    var cmd = D.COMMAND_MAP[lower];
    return { kind:'command', action: cmd.action, label: cmd.label };
  }

  // Named passages (Bible — Scriptures corpus only)
  if (allowScriptureRefs && D.NAMED_PASSAGE_INDEX[lower]) {
    var np = D.NAMED_PASSAGE_INDEX[lower];
    return {
      kind:'named-passage',
      bookId: np.bookId,
      bookTitle: D.BOOK_DISPLAY[np.bookId] || np.bookId,
      chapter: np.chapter,
      chapterEnd: np.chapterEnd || null,
      verseStart: np.verseStart || null,
      verseEnd: np.verseEnd || null,
      label: q
    };
  }

  // ═══ Volume / Letter refs — VOLUMES corpus only ═══
  if (allowVolumeRefs) {
  // Volume + Letter ref: V2L5, V 2 L 5, Volume Two Letter Five, Vol 2 Ltr 5, V2 L5, V1 preface, V2.5, 1/5 vol
  //   Accept also: "LfT 5", "LLF 3", "LR 10", "WTLB 1:45", "WTLB1 45", "HD 5", "TB 3"
  // Compact form first: V2L5, V10L3, Vol2L5
  var compactVol = lower.match(/^v(?:ol(?:ume)?)?\s*(\d+)\s*l(?:tr|etter)?\s*(\d+)$/);
  if (compactVol) {
    var cvn = parseInt(compactVol[1], 10), cln = parseInt(compactVol[2], 10);
    var cvc = D.VOLUME_TOKEN_MAP['v' + cvn] || D.VOLUME_TOKEN_MAP['volume' + cvn];
    if (cvc && !isNaN(cln)) return { kind:'ref-letter', volumeId: cvc.id, volumeScreen: cvc.screen, letterNum: cln, letterId: null, label: cvc.label + ' · Letter ' + cln };
  }
  // Slash form: 1/5 vol, 2/12 vol
  var slashVol = lower.match(/^(\d+)\/(\d+)\s*vol?$/);
  if (slashVol) {
    var svn = parseInt(slashVol[1], 10), sln = parseInt(slashVol[2], 10);
    var svc = D.VOLUME_TOKEN_MAP['v' + svn];
    if (svc && !isNaN(sln)) return { kind:'ref-letter', volumeId: svc.id, volumeScreen: svc.screen, letterNum: sln, letterId: null, label: svc.label + ' · Letter ' + sln };
  }
  // Dot form: V2.5, Vol2.5
  var dotVol = lower.match(/^v(?:ol(?:ume)?)?\s*(\d+)\.(\d+)$/);
  if (dotVol) {
    var dvn = parseInt(dotVol[1], 10), dln = parseInt(dotVol[2], 10);
    var dvc = D.VOLUME_TOKEN_MAP['v' + dvn];
    if (dvc && !isNaN(dln)) return { kind:'ref-letter', volumeId: dvc.id, volumeScreen: dvc.screen, letterNum: dln, letterId: null, label: dvc.label + ' · Letter ' + dln };
  }
  var volLetterM = lower.match(/^v(?:ol(?:ume)?)?\s+(\w+)\s+(?:l(?:tr|etter)?\s*)?(\w+)?$/);
  if (volLetterM) {
    var volTok = volLetterM[1], letterTok = volLetterM[2];
    var volKey = 'v' + volTok;
    var vc = D.VOLUME_TOKEN_MAP[volKey] || D.VOLUME_TOKEN_MAP['volume' + volTok] || D.VOLUME_TOKEN_MAP[volTok];
    if (vc && letterTok) {
      // Preface
      if (letterTok === 'preface' || letterTok === 'intro' || letterTok === '0') {
        return { kind:'ref-letter', volumeId: vc.id, volumeScreen: vc.screen, letterNum: 0, letterId: null, isPreface:true, label: vc.label + ' · Preface' };
      }
      var ln = parseWordNum(letterTok);
      if (ln !== null) return { kind:'ref-letter', volumeId: vc.id, volumeScreen: vc.screen, letterNum: ln, letterId: null, label: vc.label + ' · Letter ' + ln };
    }
  }

  // "WTLB 1:45" / "WTLB1:45" / "WTLB Part 1 Section 45" / "WTLB 1 45"
  var wtlbM = lower.match(/^wtlb\s*(?:part\s*)?([12])\s*(?::|section|sec|\s)\s*(\d+)$/);
  if (wtlbM) {
    var part = wtlbM[1], sec = parseInt(wtlbM[2], 10);
    var vWtlb = part === '1' ? D.VOLUME_TOKEN_MAP.wtlb1 : D.VOLUME_TOKEN_MAP.wtlb2;
    if (vWtlb && !isNaN(sec)) {
      return { kind:'ref-letter', volumeId: vWtlb.id, volumeScreen: vWtlb.screen, letterNum: sec, letterId: null, label: vWtlb.label + ' ' + sec };
    }
  }

  // "Words To Live By Part 1 45"
  var wtlbLong = lower.match(/^words\s*to\s*live\s*by(?:\s*part)?\s*([12one two]+)\s*(?::|section|sec|\s)?\s*(\d+)$/);
  if (wtlbLong) {
    var p = wtlbLong[1];
    var n2 = parseInt(wtlbLong[2], 10);
    var vW = (p === '1' || p === 'one') ? D.VOLUME_TOKEN_MAP.wtlb1 : D.VOLUME_TOKEN_MAP.wtlb2;
    if (vW && !isNaN(n2)) return { kind:'ref-letter', volumeId: vW.id, volumeScreen: vW.screen, letterNum: n2, letterId: null, label: vW.label + ' ' + n2 };
  }

  // Letters from Timothy / Little Flock / Lord's Rebuke / The Blessed / Holy Days — abbrev or prefix form
  var shorthand = [
    { re: /^(?:lft|timothy|letters\s*from\s*timothy|letter\s*from\s*timothy|lt)\s+(\w+)$/, id:'timothy' },
    { re: /^(?:llf|flock|little\s*flock|letters\s*to\s*(?:the\s*)?(?:lord[''s]*\s*)?little\s*flock|lf)\s+(\w+)$/, id:'flock' },
    { re: /^(?:lr|rebuke|lord[''s]*\s*rebuke|a\s*testament\s*against\s*the\s*world)\s+(\w+)$/, id:'rebuke' },
    { re: /^(?:tb|the\s*blessed|blessed)\s+(\w+)$/, id:'blessed' },
    { re: /^(?:hd|holy\s*days?)\s+(\w+)$/, id:'holydays' }
  ];
  for (var s = 0; s < shorthand.length; s++) {
    var m = lower.match(shorthand[s].re);
    if (m) {
      var vcS = null;
      for (var vv = 0; vv < D.VOLUME_COLLECTIONS.length; vv++) if (D.VOLUME_COLLECTIONS[vv].id === shorthand[s].id) vcS = D.VOLUME_COLLECTIONS[vv];
      if (vcS) {
        if (m[1] === 'preface' || m[1] === 'intro') return { kind:'ref-letter', volumeId: vcS.id, volumeScreen: vcS.screen, letterNum: 0, isPreface:true, label: vcS.label + ' · Preface' };
        var snum = parseWordNum(m[1]);
        if (snum !== null) return { kind:'ref-letter', volumeId: vcS.id, volumeScreen: vcS.screen, letterNum: snum, label: vcS.label + ' ' + snum };
      }
    }
  }

  // "Letter N" — try V2, then V1, then return as partial
  var letterOnly = lower.match(/^letter\s+(\w+)$/);
  if (letterOnly) {
    var ln2 = parseWordNum(letterOnly[1]);
    if (ln2 !== null) {
      return { kind:'ref-letter', volumeId:'v2', volumeScreen:'vot-letter', letterNum: ln2, label: 'Volume Two · Letter ' + ln2, fallbackVolumeId:'v1', fallbackVolumeScreen:'vot-one-letter' };
    }
  }
  } // end allowVolumeRefs

  if (!allowScriptureRefs) {
    // In Volumes corpus, skip bible-ref parsing entirely. Fall through to text.
    return parseTextQuery(q);
  }

  // Bible ref — "Rom 8:28", "Rom 8:28-39", "Romans 8", "John 14:1-16:33", "Rom 8.28", "Rom8:28",
  //   "Romans 8 28", "Rom.8.28", "Rom-8-28", "Rom 8,28", "Gen 1-3", "Matt 5-7"
  // Strip trailing period/punct
  var qNorm = q.replace(/[.,\s]+/g, ' ').replace(/\s*:\s*/g, ':').replace(/\s*-\s*/g, '-').trim();
  // Also handle "Rom8:28" → "Rom 8:28"
  var qExp = qNorm.replace(/^([0-3]?[a-z]+)(\d)/i, '$1 $2');
  // Progressive: try longest book-name prefix match
  var toks = qExp.split(/\s+/);
  for (var tk = Math.min(toks.length, 4); tk >= 1; tk--) {
    var attempt = toks.slice(0, tk).join(' ').toLowerCase();
    var bookId = resolveBookToken(attempt);
    if (!bookId) continue;
    var rest = toks.slice(tk).join(' ').trim();
    var bookTitle = D.BOOK_DISPLAY[bookId] || bookId;
    if (!rest) {
      return { kind:'ref-book', bookId: bookId, bookTitle: bookTitle };
    }
    // Parse chapter:verse ranges
    // Forms: "8", "8:28", "8:28-39", "14:1-16:33", "5-7"
    var rangeM = rest.match(/^(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/);
    if (rangeM) {
      var ch = parseInt(rangeM[1], 10);
      var vs = rangeM[2] ? parseInt(rangeM[2], 10) : null;
      var ch2v = rangeM[3] ? parseInt(rangeM[3], 10) : null;
      var vs2  = rangeM[4] ? parseInt(rangeM[4], 10) : null;
      // "8-10" at no-verse level → chapter range
      if (vs === null && ch2v !== null && vs2 === null) {
        return { kind:'ref-bible', bookId: bookId, bookTitle: bookTitle, chapter: ch, chapterEnd: ch2v };
      }
      // "8:28-39" → verse range in same chapter
      if (vs !== null && ch2v !== null && vs2 === null) {
        return { kind:'ref-bible', bookId: bookId, bookTitle: bookTitle, chapter: ch, verseStart: vs, verseEnd: ch2v };
      }
      // "14:1-16:33" → cross-chapter range
      if (vs !== null && ch2v !== null && vs2 !== null) {
        return { kind:'ref-bible', bookId: bookId, bookTitle: bookTitle, chapter: ch, verseStart: vs, chapterEnd: ch2v, verseEndChapter: vs2 };
      }
      // "8:28"
      if (vs !== null && ch2v === null) {
        return { kind:'ref-bible', bookId: bookId, bookTitle: bookTitle, chapter: ch, verseStart: vs };
      }
      // "8"
      return { kind:'ref-bible', bookId: bookId, bookTitle: bookTitle, chapter: ch };
    }
  }

  // Text query with operators: phrase, +must, -exclude
  return parseTextQuery(q);
}

function parseTextQuery(q) {
  var phraseMatch = q.match(/^"([^"]+)"$/);
  if (phraseMatch) {
    return { kind:'text', phrase: phraseMatch[1].trim(), cleanQuery: phraseMatch[1].trim(), must:[], mustNot:[], terms:[] };
  }
  // Mixed — support phrase + terms + ± and NOT
  var terms = [], must = [], mustNot = [], phrase = null;
  var parts = q.match(/"[^"]+"|\S+/g) || [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (p.charAt(0) === '"' && p.charAt(p.length-1) === '"') { phrase = p.slice(1, -1); continue; }
    if (p.charAt(0) === '-' && p.length > 1) { mustNot.push(p.slice(1).toLowerCase()); continue; }
    if (p.charAt(0) === '+' && p.length > 1) { must.push(p.slice(1).toLowerCase()); continue; }
    if (p.toUpperCase() === 'NOT') { /* eat — consumed with next */ continue; }
    if (p.toUpperCase() === 'OR' || p.toUpperCase() === 'AND') continue;
    terms.push(p.toLowerCase());
  }
  return { kind:'text', phrase: phrase, cleanQuery: q.toLowerCase(), must: must, mustNot: mustNot, terms: terms };
}

// ─── Search execution ───
// options: {
//   scope: {bookId?, volumeId?},
//   translation: 'nkjv' | 'all',
//   include: { verses, headings, studyNotes, footnotes, crossRefs, letters, letterBody, wtlb, blessed, holyDays, bibleStudies },
//   limit: number,
//   fuzzy: 0..2
// }
async function executeSearch(query, options) {
  options = options || {};
  var limit = options.limit || 200;
  var code = options.translation || 'nkjv';
  var corpus = options.corpus || 'all';   // 'all' | 'scriptures' | 'volumes'
  // 'all' runs both engines and merges. 'scriptures'/'volumes' run one.
  var activeCorpora = corpus === 'all' ? ['scriptures', 'volumes'] : [corpus];
  for (var ei = 0; ei < activeCorpora.length; ei++) await ensureIndex(code, activeCorpora[ei]);

  var parsed = parse(query, { corpus: corpus });
  if (!parsed) return { parsed:null, results:[] };
  if (parsed.kind === 'command') return { parsed: parsed, results: [] };

  // For ref/passage/book/letter parses, the direct navigation card IS the answer.
  // Skip text search to avoid noise (e.g. "Eph 3" matching Ephesians 1:3 and 2:3
  // just because their refs share the digit "3").
  if (parsed.kind !== 'text') {
    return { parsed: parsed, results: [], parsedTerms: [], textQuery: null };
  }

  var p = parsed;
  var terms = (p.phrase ? p.phrase.split(/\s+/) : p.terms.slice()).concat(p.must);

  // Stop-words: always use trimmed list (grammar glue only, keeps semantic words).
  // Short queries (≤4 words) keep everything regardless.
  // Disabled entirely when options.useStopWords === false — user toggle.
  var filtered;
  var useStop = options.useStopWords !== false;
  if (!useStop || terms.length <= 4) {
    filtered = terms.slice();
  } else {
    filtered = terms.filter(function (t) { return !D.STOP_WORDS_TRIMMED.has(t.toLowerCase()); });
    if (!filtered.length) filtered = terms;
  }

  // FlexSearch: run per-field searches, combine with boost.
  // Phrases and short-token queries are both handled — phrase is post-filtered
  // for exact substring, short tokens naturally match via `forward` prefix.
  var searchTerm = p.phrase ? p.phrase : filtered.join(' ');
  if (!searchTerm) return { parsed: parsed, results: [], parsedTerms: filtered, textQuery: p };

  var fields = [
    { name: 'title',   boost: 3.0 },
    { name: 'ref',     boost: 2.5 },
    { name: 'heading', boost: 2.0 },
    { name: 'text',    boost: 1.0 }
  ];
  var perFieldLimit = Math.min(Math.max(limit * 4, 400), 1500);
  var scoreMap = Object.create(null);  // compound key: "corpus|docId"
  var docLookup = Object.create(null); // compound key → doc

  for (var ec = 0; ec < activeCorpora.length; ec++) {
    var cname = activeCorpora[ec];
    var slot = engines[cname];
    if (!slot || !slot.db) continue;
    for (var fi = 0; fi < fields.length; fi++) {
      var f = fields[fi];
      var raw;
      try { raw = slot.db.search(searchTerm, { index: f.name, limit: perFieldLimit }); }
      catch (e) { console.warn('[VotSearch] field search failed', cname, f.name, e); continue; }
      if (!raw) continue;
      var ids = [];
      if (Array.isArray(raw)) {
        for (var rr = 0; rr < raw.length; rr++) {
          var entry = raw[rr];
          if (entry && typeof entry === 'object' && entry.result) {
            for (var er = 0; er < entry.result.length; er++) ids.push(entry.result[er]);
          } else if (typeof entry === 'string' || typeof entry === 'number') {
            ids.push(entry);
          }
        }
      }
      if (!ids.length) continue;
      for (var r = 0; r < ids.length; r++) {
        var key = cname + '|' + ids[r];
        var rankScore = (perFieldLimit - r) / perFieldLimit;
        scoreMap[key] = (scoreMap[key] || 0) + (f.boost * rankScore);
        if (!docLookup[key]) docLookup[key] = slot.docStore[ids[r]];
      }
    }
  }

  // Kind boost: favor focused, primary-content docs (actual verses, curated
  // headings/titles) over long, diffuse docs (full letter bodies, study notes).
  // A letter that incidentally contains 5 query tokens should NOT outrank a
  // verse that contains the exact phrase.
  var KIND_BOOST = {
    'letter-title':   2.0,
    'wtlb-title':     2.0,
    'blessed-title':  2.0,
    'holy-day-title': 2.0,
    'chapter-title':  1.6,
    'heading':        1.4,
    'verse':          1.0,
    'footnote':       1.0,
    'letter':         0.8,
    'wtlb':           0.8,
    'blessed':        0.8,
    'holy-day':       0.8,
    'bible-study':    0.7,
    'study-note':     0.6,
    'cross-ref':      0.5
  };
  var rankedIds = Object.keys(scoreMap);
  for (var ki = 0; ki < rankedIds.length; ki++) {
    var kDoc = docLookup[rankedIds[ki]];
    if (kDoc && KIND_BOOST[kDoc.kind]) scoreMap[rankedIds[ki]] *= KIND_BOOST[kDoc.kind];
  }

  // Term-coverage multiplier: docs containing more of the query terms rank higher.
  // Without this, FlexSearch's per-field rank can let a 1-of-3-terms match
  // outrank a 3-of-3-terms match (e.g. searching "weak and helpless" would let
  // a doc with only "and" beat a doc with all three words).
  // Skipped for verses because they're indexed against multiple translations
  // but doc.text only contains the displayed (NKJV) text — coverage check
  // would falsely demote verses matched via KJV/ASV phrasing.
  if (filtered.length > 1) {
    for (var cri = 0; cri < rankedIds.length; cri++) {
      var crDoc = docLookup[rankedIds[cri]];
      if (!crDoc || crDoc.kind === 'verse') continue;
      var combinedLower = ((crDoc.text || '') + ' ' + (crDoc.title || '') + ' ' + (crDoc.heading || '') + ' ' + (crDoc.ref || '')).toLowerCase();
      var matched = 0;
      for (var tlc = 0; tlc < filtered.length; tlc++) {
        var t = filtered[tlc].toLowerCase();
        if (combinedLower.indexOf(t) >= 0) { matched++; continue; }
        // Match archaic variants too — "you" finds "thee/thou/ye" and vice versa
        var vars = ARCHAIC_EXPAND[t];
        if (vars) {
          for (var vi = 0; vi < vars.length; vi++) {
            if (vars[vi] !== t && combinedLower.indexOf(vars[vi]) >= 0) { matched++; break; }
          }
        }
      }
      var coverage = matched / filtered.length;
      // 0% coverage → 1x (no boost), 100% coverage → 4x boost
      scoreMap[rankedIds[cri]] *= (1 + coverage * 3);
    }
  }
  rankedIds.sort(function (a, b) { return scoreMap[b] - scoreMap[a]; });

  var out = [];
  var seen = Object.create(null);
  var hasMust = p.must && p.must.length > 0;
  var hasMustNot = p.mustNot && p.mustNot.length > 0;
  var phraseLower = p.phrase ? p.phrase.toLowerCase() : null;

  // Scope filter: restrict to a single Bible book ({bookId}) or a single
  // Volume / collection ({volumeId}). Applied post-ranking.
  var scope = options.scope || null;
  var scopeBookId = scope && scope.bookId ? scope.bookId : null;
  var scopeVolumeId = scope && scope.volumeId ? scope.volumeId : null;

  for (var h = 0; h < rankedIds.length && out.length < limit; h++) {
    var compKey = rankedIds[h];
    var doc = docLookup[compKey];
    if (!doc) continue;
    if (scopeBookId && doc.bookId !== scopeBookId) continue;
    if (scopeVolumeId && doc.volumeId !== scopeVolumeId) continue;
    var combined = null;
    var needCombined = phraseLower || hasMust || hasMustNot;
    if (needCombined) {
      combined = ((doc.text || '') + ' ' + (doc.title || '') + ' ' + (doc.heading || '') + ' ' + (doc.ref || '')).toLowerCase();
    }
    if (phraseLower && combined.indexOf(phraseLower) < 0) continue;
    if (hasMust) {
      var ok = true;
      for (var mi = 0; mi < p.must.length; mi++) {
        if (combined.indexOf(p.must[mi]) < 0) { ok = false; break; }
      }
      if (!ok) continue;
    }
    if (hasMustNot) {
      var ok2 = true;
      for (var mn = 0; mn < p.mustNot.length; mn++) {
        if (combined.indexOf(p.mustNot[mn]) >= 0) { ok2 = false; break; }
      }
      if (!ok2) continue;
    }
    // Deduplicate: skip results with identical (kind, ref, text-prefix).
    // Keeps only the highest-scoring entry per visual identity.
    var dedupKey = doc.kind + '|' + (doc.ref || '') + '|' + (doc.text || '').slice(0, 60);
    if (seen[dedupKey]) continue;
    seen[dedupKey] = true;
    out.push({ score: scoreMap[compKey], doc: doc });
  }

  return { parsed: parsed, results: out, parsedTerms: filtered, textQuery: p };
}

// ─── Snippet generator ───
function snippet(text, terms, maxLen) {
  maxLen = maxLen || 180;
  if (!text) return '';
  if (!terms || !terms.length) {
    return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
  }
  // Expand archaic pronouns so a "you" query can center the snippet on "thee" in the verse.
  var expanded = expandArchaicTerms(terms);
  var lower = text.toLowerCase();
  var bestIdx = -1, bestLen = 0;
  for (var i = 0; i < expanded.length; i++) {
    var t = expanded[i].toLowerCase();
    if (!t) continue;
    var idx = lower.indexOf(t);
    if (idx >= 0 && (bestIdx < 0 || idx < bestIdx)) { bestIdx = idx; bestLen = t.length; }
  }
  if (bestIdx < 0) return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
  var half = Math.max(20, Math.floor((maxLen - bestLen) / 2));
  var start = Math.max(0, bestIdx - half);
  var end = Math.min(text.length, start + maxLen);
  if (end - start < maxLen) start = Math.max(0, end - maxLen);
  var clip = text.slice(start, end);
  if (start > 0) clip = '…' + clip;
  if (end < text.length) clip = clip + '…';
  return clip;
}

// ─── Highlight ranges ───
// Returns array of {text, hit} spans for rendering.
function highlightSpans(text, terms) {
  if (!text) return [{text:'', hit:false}];
  if (!terms || !terms.length) return [{text: text, hit:false}];
  // Expand so "you" in the query highlights "thee/thou/ye" in the text too.
  var expanded = expandArchaicTerms(terms);
  var tokens = [];
  for (var i = 0; i < expanded.length; i++) {
    var t = (expanded[i] || '').trim().toLowerCase();
    if (t && t.length >= 2) tokens.push(t);
  }
  if (!tokens.length) return [{text: text, hit:false}];
  // Build regex of all terms (escaped)
  var esc = tokens.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
  esc.sort(function (a, b) { return b.length - a.length; }); // longer first
  var re;
  try { re = new RegExp('(' + esc.join('|') + ')', 'gi'); } catch (e) { return [{text: text, hit:false}]; }
  var out = [];
  var last = 0;
  var m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), hit:false });
    out.push({ text: m[0], hit:true });
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit:false });
  return out.length ? out : [{text: text, hit:false}];
}

// ─── Autocomplete suggestions ───
// Returns array of {kind, label, query, hint?}
function suggest(query, opts) {
  opts = opts || {};
  var max = opts.max || 10;
  var out = [];
  if (!query || query.length < 1) return out;
  var q = query.trim().toLowerCase();

  // Named passages (prefix match)
  for (var i = 0; i < D.NAMED_PASSAGES.length && out.length < max; i++) {
    var np = D.NAMED_PASSAGES[i];
    for (var k = 0; k < np.keys.length; k++) {
      if (np.keys[k].indexOf(q) === 0) {
        out.push({
          kind: 'passage',
          label: np.keys[k].replace(/\b\w/g, function (c) { return c.toUpperCase(); }),
          query: np.keys[k],
          hint: (D.BOOK_DISPLAY[np.bookId] || np.bookId) + ' ' + np.chapter + (np.verseStart ? ':' + np.verseStart + (np.verseEnd ? '-' + np.verseEnd : '') : '')
        });
        break;
      }
    }
  }

  // Book names (prefix match)
  var bookSeen = {};
  var abbrevKeys = Object.keys(D.BOOK_ABBREVS);
  for (var b = 0; b < abbrevKeys.length && out.length < max; b++) {
    var k2 = abbrevKeys[b];
    if (k2.length < 2) continue;
    if (k2.indexOf(q) === 0) {
      var bid = D.BOOK_ABBREVS[k2];
      if (bookSeen[bid]) continue;
      bookSeen[bid] = true;
      out.push({ kind:'book', label: D.BOOK_DISPLAY[bid] || bid, query: D.BOOK_DISPLAY[bid] || bid, hint: 'Book' });
    }
  }

  // Commands
  for (var c = 0; c < D.COMMANDS.length && out.length < max; c++) {
    for (var cc = 0; cc < D.COMMANDS[c].keys.length; cc++) {
      if (D.COMMANDS[c].keys[cc].indexOf(q) === 0) {
        out.push({ kind:'command', label: D.COMMANDS[c].label, query: D.COMMANDS[c].keys[cc], hint: 'Command' });
        break;
      }
    }
  }

  return out;
}

// ─── Public API ───
window.VotSearch = {
  init: init,
  rebuild: rebuild,
  clearCache: clearCache,
  purgeStaleCache: purgeStaleCache,
  ensureTranslations: ensureTranslations,
  parse: parse,
  search: executeSearch,
  suggest: suggest,
  snippet: snippet,
  highlightSpans: highlightSpans,
  levenshtein: levenshtein,
  fuzzyBookSuggest: fuzzyBookSuggest,
  getStats: function () {
    return {
      scriptures: Object.assign({}, engines.scriptures.stats, { translation: engines.scriptures.code }),
      volumes:    Object.assign({}, engines.volumes.stats,    { translation: engines.volumes.code })
    };
  },
  getState: function () {
    return {
      scriptures: { ready: !!engines.scriptures.db, building: !!engines.scriptures.building, buildingCode: engines.scriptures.buildingCode, code: engines.scriptures.code, docCount: engines.scriptures.docCount },
      volumes:    { ready: !!engines.volumes.db,    building: !!engines.volumes.building,    buildingCode: engines.volumes.buildingCode,    code: engines.volumes.code,    docCount: engines.volumes.docCount },
      // 'ready' at top-level = both engines ready (back-compat for SearchScreen)
      ready:    !!engines.scriptures.db && !!engines.volumes.db,
      building: !!engines.scriptures.building || !!engines.volumes.building,
      error:    buildError ? buildError.message : null
    };
  },
  debugCache: async function (code) {
    code = code || 'nkjv';
    var result = {};
    for (var i = 0; i < ['scriptures','volumes'].length; i++) {
      var c = ['scriptures','volumes'][i];
      var sig = dataSignature(code, c);
      var entry = null;
      try { entry = await cacheGet(sig); } catch (e) {}
      result[c] = {
        signature: sig,
        cacheEntryPresent: !!entry,
        cacheStoreDocs: entry && entry.payload && entry.payload.store ? Object.keys(entry.payload.store).length : 0,
        activeInMemory: !!engines[c].db && engines[c].code === code,
        activeDocCount: engines[c].docCount
      };
    }
    console.log('[VotSearch] debugCache:', result);
    return result;
  },
  data: D
};

})();
