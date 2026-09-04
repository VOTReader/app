/* ===================================================================
   Cross-app navigation index — flat searchable list of every navigable destination (Bible chapter, Volume letter, WTLB entry, etc). Powers LinkPicker scoped search + RecentNavStore.
   ===================================================================
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   Bundled helpers (P5e):
   - buildNavIndex
   - searchNavIndex
   - navItemPreview
   - navItemToEndpoint
   - buildSourceEndpoint
   =================================================================== */

/**
 * A navigable item in the index. Discriminated by `kind`; fields vary by
 * kind (bible-chapter has bookId/chapter; letter has letterId/screen/
 * collection; study-chapter has bookId/chapter/verse; etc.). The shape is
 * intentionally loose — typed as `any` here because callers branch on
 * `kind` and access kind-specific fields. Q5+ could tighten this to a
 * proper discriminated union if test coverage exists to verify the
 * narrowing.
 *
 * @typedef {any} NavItem
 */

/**
 * Build (or return cached) the flat nav index. Memoizes on
 * `window.__NAV_INDEX` — subsequent calls return the same array reference.
 * Items: Bible chapters from `_allBooks()`, letters/entries from every
 * COLLECTION, Matthew study chapters, plus Bible Study (non-Matthew)
 * chapters.
 *
 * The memo is SIGNATURE-GUARDED: the corpora are lazy-loaded, so an index
 * built before (say) the Bible bundle landed would otherwise be missing all
 * 1,189 chapters FOREVER (the cache never expired — a picker opened early
 * permanently lost whole corpora until an app reload). When a corpus count
 * changes, the index rebuilds once and re-memoizes.
 *
 * @returns {NavItem[]}
 */
export function buildNavIndex() {
  const sig = Object.keys(_allBooks()).length
    // Total LETTERS across every collection, not COLLECTIONS.length (a static
    // 15) — a lazy corpus (e.g. bundle-a-vot) landing more letters into an
    // already-registered collection left that count unchanged, so the memo
    // never rebuilt and the new letters stayed invisible to the picker
    // until an app reload (F19).
    + ':' + (typeof COLLECTIONS !== 'undefined' ? COLLECTIONS.reduce((n, c) => n + colLetterArr(c).length, 0) : 0)
    + ':' + (Array.isArray(window.BIBLE_STUDIES) ? window.BIBLE_STUDIES.length : 0)
    + ':' + (_matthew() ? 1 : 0);
  if (window.__NAV_INDEX && window.__NAV_INDEX_SIG === sig) return window.__NAV_INDEX;
  const items = [];

  /* Bible books → chapters. Each book gets a chapter-level entry. */
  const books = _allBooks();
  Object.values(books).forEach(book => {
    if (!book || !book.chapters) return;
    const titleLc = book.title.toLowerCase();
    const titleNoSpace = titleLc.replace(/\s+/g, '');
    // Common abbreviations (a few hand-picked; full list isn't needed because
    // matching tolerates leading-N + first-3-letters)
    const abbrevs = {
      'genesis': 'gen', 'exodus': 'exo', 'leviticus': 'lev', 'numbers': 'num',
      'deuteronomy': 'deut', 'joshua': 'josh', 'judges': 'judg',
      '1samuel': '1sam', '2samuel': '2sam', '1kings': '1kgs', '2kings': '2kgs',
      '1chronicles': '1chr', '2chronicles': '2chr',
      'nehemiah': 'neh', 'psalms': 'ps', 'proverbs': 'prov',
      'ecclesiastes': 'ecc', 'songofsolomon': 'song',
      'isaiah': 'isa', 'jeremiah': 'jer', 'lamentations': 'lam',
      'ezekiel': 'eze', 'daniel': 'dan', 'hosea': 'hos',
      'obadiah': 'oba', 'jonah': 'jon', 'micah': 'mic', 'nahum': 'nah',
      'habakkuk': 'hab', 'zephaniah': 'zeph', 'haggai': 'hag',
      'zechariah': 'zech', 'malachi': 'mal',
      'matthew': 'mt', 'mark': 'mk', 'luke': 'lk', 'john': 'jn',
      'romans': 'rom', '1corinthians': '1cor', '2corinthians': '2cor',
      'galatians': 'gal', 'ephesians': 'eph', 'philippians': 'phil',
      'colossians': 'col', '1thessalonians': '1thess', '2thessalonians': '2thess',
      '1timothy': '1tim', '2timothy': '2tim', 'titus': 'titus',
      'philemon': 'phlm', 'hebrews': 'heb', 'james': 'jas',
      '1peter': '1pet', '2peter': '2pet', '1john': '1jn', '2john': '2jn', '3john': '3jn',
      'jude': 'jude', 'revelation': 'rev'
    };
    const abbr = abbrevs[book.id] || titleLc.slice(0, 3);
    book.chapters.forEach(ch => {
      const aliases = [
        titleLc + ' ' + ch.num,
        titleNoSpace + ch.num,
        abbr + ' ' + ch.num,
        abbr + ch.num,
        // First-3-letters fallback
        titleLc.slice(0, 3) + ' ' + ch.num
      ];
      items.push({
        kind: 'bible-chapter',
        bookId: book.id,
        chapter: ch.num,
        label: book.title + ' ' + ch.num,
        category: bookCategory(book.id),
        title: book.title,
        aliases: aliases.map(a => a.toLowerCase())
      });
    });
  });

  /* Letters / entries via COLLECTIONS registry. */
  const NAV_KIND = { letter: 'letter', wtlb: 'wtlb-entry', blessed: 'blessed-entry', 'holy-days': 'holy-days-entry' };
  const VOL_NUM = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7 };
  const NAV_ALIAS_BASES = {
    timothy: ['timothy', 'tim', 'letters from timothy', 'lft'],
    flock:   ['flock', 'letters to the flock', 'lttf', 'ltf'],
    rebuke:  ['rebuke', "the lord's rebuke", 'lr', "lord's rebuke"],
    wtlb1:   ['wtlb1', 'wtlb 1', 'wtlb part one', 'words to live by 1', 'wtlb one'],
    wtlb2:   ['wtlb2', 'wtlb 2', 'wtlb part two', 'words to live by 2', 'wtlb two'],
    blessed: ['blessed', 'the blessed'],
    holydays:['holy days', 'hd']
  };

  for (const col of COLLECTIONS) {
    if (col.volKey === 'hm') continue;
    const navKind = NAV_KIND[col.kind] || 'letter';
    const isLetter = navKind === 'letter';
    const vn = VOL_NUM[col.volKey];
    const bases = NAV_ALIAS_BASES[col.volKey];
    const category = col.volKey === 'holydays' ? 'Holy Days' : col.label;

    const pref = colPreface(col);
    if (pref && pref.id) {
      const pAliases = [pref.title.toLowerCase()];
      if (vn) pAliases.push(col.label.toLowerCase() + ' preface', 'v' + vn + ' preface');
      if (bases) bases.forEach(b => pAliases.push(b + ' preface'));
      items.push({
        kind: navKind, collection: col.label, screen: col.letterScreen,
        letterId: pref.id, letterNum: 0,
        label: pref.title, category: category, title: pref.title, aliases: pAliases
      });
    }

    colLetterArr(col).forEach(entry => {
      const aliases = [entry.title.toLowerCase()];
      if (vn && entry.num != null) {
        aliases.push(
          'v'+vn+'l'+entry.num, 'v'+vn+' l'+entry.num,
          'vol '+vn+' letter '+entry.num, 'volume '+vn+' letter '+entry.num,
          col.label.toLowerCase()+' letter '+entry.num, col.label.toLowerCase()+' '+entry.num,
          'v'+vn+' '+entry.num, 'vol'+vn+' '+entry.num);
      }
      if (bases) {
        bases.forEach(b => {
          aliases.push(b + ' ' + (entry.num != null ? entry.num : ''));
          if (entry.num != null) {
            aliases.push(b + entry.num);
            if (col.kind === 'wtlb') aliases.push(b + ' #' + entry.num);
          }
        });
      }
      const item = {
        kind: navKind, collection: col.label, screen: col.letterScreen,
        label: entry.title, category: category, title: entry.title, aliases
      };
      if (isLetter) { item.letterId = entry.id; item.letterNum = entry.num; }
      else { item.entryId = entry.id; item.entryNum = entry.num; }
      items.push(item);
    });
  }

  /* Bible / Letter Studies (non-Matthew) — More Than a Man, Lamb of God, etc.
     Each chapter is its own target since these can be linked to with verse-
     like granularity (excerpt picker handles text-range selection). */
  if (Array.isArray(window.BIBLE_STUDIES)) {
    window.BIBLE_STUDIES.forEach(study => {
      if (!study || !Array.isArray(study.chapters)) return;
      const studyKey = (study.slug || study.id || '').toLowerCase();
      const studyTitleLc = (study.title || '').toLowerCase();
      study.chapters.forEach(ch => {
        if (!ch || !ch.id) return;
        const chTitle = ch.title || ('Chapter ' + (ch.num != null ? ch.num : ch.id));
        items.push({
          kind: 'study-letter-chapter',
          collection: study.title || 'Bible Study',
          screen: 'bible-study-chapter',
          studyId: study.slug || study.id,
          studyChapterId: ch.id,
          letterId: ch.id, // for openLinkPicker compat
          chapterNum: ch.num,
          label: chTitle,
          category: 'Bible Studies',
          title: chTitle,
          aliases: [
            chTitle.toLowerCase(),
            studyTitleLc,
            studyKey + ' ' + (ch.num != null ? ch.num : ''),
            studyKey + (ch.num != null ? ch.num : '')
          ].filter(Boolean)
        });
      });
    });
  }

  /* Matthew Study Bible chapters. */
  var _m = _matthew();
  if (_m && Array.isArray(_m.chapters)) {
    _m.chapters.forEach(ch => {
      items.push({
        kind: 'study-chapter',
        bookId: 'matthew', chapter: ch.num,
        screen: 'matthew-ch',
        label: 'Matthew Study Bible — Chapter ' + ch.num + (ch.title ? ': ' + ch.title : ''),
        category: 'Bible Studies', title: ch.title || ('Chapter ' + ch.num),
        aliases: [
          'matthew study ' + ch.num, 'msb ' + ch.num, 'msb' + ch.num,
          'matthew sb ' + ch.num, 'matthew study bible ' + ch.num
        ]
      });
    });
  }

  window.__NAV_INDEX = items;
  window.__NAV_INDEX_SIG = sig;
  return items;
}

/**
 * Map a MiniSearch content doc (VotSearchMini.search result `.doc`) to a
 * NavItem the LinkPicker can render + convert via navItemToEndpoint — the
 * bridge that lets the picker search TEXT, not just titles/references.
 *
 *   verse docs        → synthesized chapter+verse item (same shape as the
 *                       searchNavIndex Bible-ref hit; Matthew study verses
 *                       route to the study edition)
 *   letter/entry docs → the REAL nav item looked up by id (heading
 *                       disambiguates id collisions across collections);
 *                       Hidden Manna letters have no nav item → null →
 *                       excluded, preserving the never-index rule
 *   bible-study docs  → the study-chapter item (studyId + chapterNum)
 *
 * @param {any} doc
 * @returns {NavItem | null}
 */
export function contentDocToNavItem(doc) {
  if (!doc) return null;
  if (doc.kind === 'verse') {
    if (doc.volumeId === 'matthew-study') {
      return {
        kind: 'study-chapter', bookId: 'matthew',
        chapter: doc.chapterNum, verse: doc.verseNum,
        screen: 'matthew-ch',
        label: 'Matthew ' + doc.chapterNum + ':' + doc.verseNum,
        category: 'Study Bible', title: 'Matthew',
      };
    }
    return {
      kind: 'bible-chapter', bookId: doc.bookId,
      chapter: doc.chapterNum, verse: doc.verseNum,
      label: doc.ref, category: bookCategory(doc.bookId), title: doc.ref,
    };
  }
  const items = buildNavIndex();
  const ENTRY_KIND = { wtlb: 'wtlb-entry', blessed: 'blessed-entry', 'holy-day': 'holy-days-entry' };
  if (doc.kind === 'letter') {
    const matches = items.filter((i) => i.kind === 'letter' && i.letterId === doc.letterId);
    return matches.find((i) => i.collection === doc.heading) || matches[0] || null;
  }
  if (ENTRY_KIND[doc.kind]) {
    const matches = items.filter((i) => i.kind === ENTRY_KIND[doc.kind] && i.entryId === doc.letterId);
    return matches.find((i) => i.collection === doc.heading) || matches[0] || null;
  }
  if (doc.kind === 'bible-study') {
    return items.find((i) => i.kind === 'study-letter-chapter' && i.studyId === doc.letterId && i.chapterNum === doc.chapterNum) || null;
  }
  return null;
}

/**
 * Group the nav index into the Browse drill-down tree the LinkPicker's
 * Browse mode renders — the same top-down hierarchy the app's own menus
 * use, so finding a link target works exactly like navigating the app.
 *
 * @returns {{
 *   bibleBooks: Array<{bookId:string,title:string,category:string,chapters:NavItem[]}>,
 *   matthewChapters: NavItem[],
 *   collections: Array<{label:string,entries:NavItem[]}>,
 *   studies: Array<{label:string,chapters:NavItem[]}>
 * }}
 */
export function buildNavTree() {
  const items = buildNavIndex();
  const bibleBooks = [];
  const bookMap = new Map();
  const colMap = new Map();   // insertion order == COLLECTIONS registry order
  const studyMap = new Map();
  const matthewChapters = [];
  for (const it of items) {
    if (it.kind === 'bible-chapter') {
      // bookId 'matthew' is the STUDY edition (it lives in _allBooks so refs
      // resolve); in the tree it has its own "Matthew Study Bible" root —
      // listing it under The Holy Bible would show two identical "Matthew"
      // rows ('matthew-plain' is the plain-Bible one).
      if (it.bookId === 'matthew') continue;
      let b = bookMap.get(it.bookId);
      if (!b) {
        b = { bookId: it.bookId, title: it.title, category: it.category, chapters: [] };
        bookMap.set(it.bookId, b);
        bibleBooks.push(b); // _allBooks() iterates in canonical book order
      }
      b.chapters.push(it);
    } else if (it.kind === 'study-chapter') {
      matthewChapters.push(it);
    } else if (it.kind === 'study-letter-chapter') {
      if (!studyMap.has(it.collection)) studyMap.set(it.collection, []);
      studyMap.get(it.collection).push(it);
    } else {
      if (!colMap.has(it.category)) colMap.set(it.category, []);
      colMap.get(it.category).push(it);
    }
  }
  return {
    bibleBooks,
    matthewChapters,
    collections: Array.from(colMap, ([label, entries]) => ({ label, entries })),
    studies: Array.from(studyMap, ([label, chapters]) => ({ label, chapters })),
  };
}

/**
 * Fuzzy-search the nav index. Tries `parseRefStr` first (catches Bible-ref
 * queries like "Eph 6:5" with a 1000-score boost), then matches every
 * item's `aliases` (exact/starts-with/contains tiers + a title-contains
 * fallback). Returns the top `limit` items sorted by score.
 *
 * @param {string | null | undefined} query
 * @param {number} [limit]   defaults to 30 when omitted/falsy
 * @returns {NavItem[]}
 */
export function searchNavIndex(query, limit) {
  limit = limit || 30;
  if (!query) return [];
  const q = query.toLowerCase().trim();
  const items = buildNavIndex();
  const scored = [];

  /* Try Bible reference parser first (handles "Eph 6:5", "Genesis 1:1-3" etc). */
  const refP = parseRefStr(q);
  let bibleRefHit = null;
  if (refP) {
    const bookKey = findBook(refP.rawBook);
    if (bookKey) {
      const books = _allBooks();
      const bookEntry = books[bookKey];
      if (bookEntry && bookEntry.chapters) {
        const chRec = bookEntry.chapters.find(c => c.num === refP.chapter);
        if (chRec) {
          const isStudy = bookEntry.id === 'matthew';
          const lbl = bookEntry.title + ' ' + refP.chapter + (refP.verse != null ? ':' + refP.verse + (refP.verseEnd ? '-' + refP.verseEnd : '') : '');
          bibleRefHit = isStudy ? {
            kind: 'study-chapter', bookId: bookEntry.id,
            chapter: refP.chapter, verse: refP.verse, verseEnd: refP.verseEnd,
            screen: 'matthew-ch', label: lbl, category: 'Study Bible', title: bookEntry.title
          } : {
            kind: 'bible-chapter', bookId: bookEntry.id,
            chapter: refP.chapter, verse: refP.verse, verseEnd: refP.verseEnd,
            label: lbl, category: bookCategory(bookEntry.id), title: bookEntry.title
          };
          scored.push({ item: bibleRefHit, score: 1000 });
        }
      }
    }
  }

  /* Match against all aliases. Score by alias quality:
     - exact match: 900
     - starts-with: 700 - len-diff
     - contains: 400 - position
     - title contains: 200 */
  for (const item of items) {
    if (bibleRefHit &&
        (item.kind === 'bible-chapter' || item.kind === 'study-chapter') &&
        item.bookId === bibleRefHit.bookId && item.chapter === bibleRefHit.chapter) {
      continue; // Already added with verse info from the Bible-ref parser
    }
    let best = 0;
    for (const a of item.aliases) {
      if (a === q) { best = Math.max(best, 900); continue; }
      if (a.startsWith(q)) { best = Math.max(best, 700 - (a.length - q.length)); continue; }
      const idx = a.indexOf(q);
      if (idx >= 0) { best = Math.max(best, 400 - idx); continue; }
    }
    // Title-only contains (lowercase) — even partial title words match
    const titleLc = (item.title || '').toLowerCase();
    if (titleLc.includes(q)) best = Math.max(best, 200);
    if (best > 0) scored.push({ item: item, score: best });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Resolve the preview text for a nav item — used by LinkPicker rows.
 * Bible/study chapter items return the verse text (if `it.verse` set)
 * OR the chapter title/first heading. Other kinds return ''.
 *
 * @param {NavItem} it
 * @returns {string}
 */
export function navItemPreview(it) {
  if (it.kind === 'bible-chapter') {
    const b = _allBooks()[it.bookId];
    if (!b) return '';
    const ch = b.chapters && b.chapters.find(c => c.num === it.chapter);
    if (!ch) return '';
    if (it.verse) {
      const v = ch.sections && ch.sections.flatMap(s => s.verses).find(v => v.n === it.verse);
      return v ? v.text : '';
    }
    // Show chapter title or first verse
    return (ch.sections && ch.sections[0] && ch.sections[0].heading) || '';
  }
  if (it.kind === 'study-chapter') {
    const M = _matthew();
    if (!M) return '';
    const ch = M.chapters && M.chapters.find(c => c.num === it.chapter);
    if (!ch) return '';
    if (it.verse) {
      const v = ch.verses && ch.verses.find(v => v.n === it.verse);
      return v ? v.text : '';
    }
    return ch.title || '';
  }
  return '';
}

/**
 * Convert a NavItem into a link-endpoint object — shape varies by kind
 * (bible / letter / wtlb / blessed / holy-days / study / study-letter).
 * Returns null on unknown kind. Used when the user picks a target in
 * LinkPicker; the endpoint is what gets persisted to LinkStore.
 *
 * @param {NavItem} it
 * @returns {any}  endpoint object | null
 */
export function navItemToEndpoint(it) {
  if (it.kind === 'bible-chapter') {
    const hasVerse = it.verse != null;
    const key = hasVerse ? bibleHlKey(it.bookId, it.chapter, it.verse) : ('bible:' + it.bookId + ':' + it.chapter);
    return {
      type: 'bible', key,
      bookId: it.bookId, chapter: it.chapter, verse: hasVerse ? it.verse : null,
      label: it.label, preview: navItemPreview(it)
    };
  }
  if (it.kind === 'letter') {
    return {
      type: 'letter', key: 'letter:' + it.letterId + ':0',
      letterId: it.letterId, screen: it.screen, collection: it.collection,
      label: it.label, preview: ''
    };
  }
  if (it.kind === 'wtlb-entry' || it.kind === 'blessed-entry' || it.kind === 'holy-days-entry') {
    const _type = it.kind === 'holy-days-entry' ? 'holy-days' : it.kind === 'blessed-entry' ? 'blessed' : 'wtlb';
    return {
      type: _type, key: 'wtlb:' + it.entryId + ':0',
      entryId: it.entryId, screen: it.screen, collection: it.collection,
      label: it.label, preview: ''
    };
  }
  if (it.kind === 'study-chapter') {
    const v = it.verse || null;
    const key = v ? ('study:' + it.bookId + '-' + it.chapter + ':' + v) : ('study:' + it.bookId + '-' + it.chapter + ':0');
    return {
      type: 'study', key: key,
      bookId: it.bookId, chapter: it.chapter, verse: v,
      screen: it.screen || 'matthew-ch',
      label: it.label, preview: navItemPreview(it)
    };
  }
  if (it.kind === 'study-letter-chapter') {
    // Bible-study chapter (non-Matthew). The hlKey shape mirrors letters
    // (`letter:{chapterId}:0`) so per-block link icons work in LetterView,
    // which is what renders these chapters via the letterShim.
    return {
      type: 'study-letter', key: 'letter:' + it.studyChapterId + ':0',
      letterId: it.studyChapterId,
      studyId: it.studyId, studyChapterId: it.studyChapterId,
      screen: it.screen || 'bible-study-chapter',
      collection: it.collection,
      label: it.label, preview: ''
    };
  }
  return null;
}

/**
 * Build a SOURCE endpoint object from an hlKey + optional excerpt selection.
 * Parses the kind from the key prefix (bible/study/letter/wtlb/blessed/
 * holy-days/journal) and resolves the right screen/collection via
 * findEntryContext when applicable. Excerpt fields are spread in iff
 * sourceStart is provided.
 *
 * @param {string} sourceKey
 * @param {string | null | undefined} sourceLabel
 * @param {number | null | undefined} sourceStart
 * @param {number | null | undefined} sourceEnd
 * @param {string | null | undefined} sourceText
 * @returns {any}  source-endpoint object
 */
export function buildSourceEndpoint(sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText) {
  const parts = sourceKey.split(':');
  const excerpt = sourceStart != null ? { start: sourceStart, end: sourceEnd, text: sourceText } : {};
  if (parts[0] === 'bible') {
    return { type: 'bible', key: sourceKey, bookId: parts[1], chapter: parseInt(parts[2], 10), verse: parseInt(parts[3], 10), label: sourceLabel || sourceKey, ...excerpt };
  }
  if (parts[0] === 'study') {
    // Matthew Study Bible verse. parts[1] is "matthew-N", parts[2] is verse
    const m = parts[1].match(/^(.+)-(\d+)$/);
    const bookId = m ? m[1] : 'matthew';
    const chapter = m ? parseInt(m[2], 10) : null;
    const verse = parts[2] && parts[2] !== '0' ? parseInt(parts[2], 10) : null;
    return { type: 'study', key: sourceKey, bookId, chapter, verse, screen: 'matthew-ch', label: sourceLabel || sourceKey, ...excerpt };
  }
  // letter / wtlb / blessed / holy-days — look up so the source endpoint
  // carries the right screen + studyId so it can be navigated back to.
  // Pass parts[0] as a kind-hint so id collisions across collections (e.g.
  // "introduction" exists in both WTLB One and The Blessed) resolve to the
  // collection that matches the source key's prefix.
  if (parts[0] === 'letter' || parts[0] === 'wtlb' || parts[0] === 'blessed' || parts[0] === 'holy-days') {
    const id = parts[1];
    const ctx = findEntryContext(id, parts[0]);
    if (ctx && ctx.kind === 'study-letter') {
      return {
        type: 'study-letter', key: sourceKey,
        letterId: id, studyId: ctx.studyId, studyChapterId: ctx.studyChapterId,
        screen: ctx.screen, collection: ctx.collection,
        label: sourceLabel || ctx.title, ...excerpt
      };
    }
    if (ctx) {
      // `base` carries either letterId OR entryId based on ctx.kind; the
      // /** @type {any} */ cast keeps TS from rejecting the conditional
      // field assignment (would otherwise infer a strict literal shape).
      /** @type {any} */
      const base = {
        type: ctx.kind, key: sourceKey, screen: ctx.screen,
        collection: ctx.collection, label: sourceLabel || ctx.title, ...excerpt
      };
      if (ctx.kind === 'letter') base.letterId = id;
      else base.entryId = id;
      return base;
    }
    // Fallback: keep prior shape so we degrade gracefully on unknown ids
    if (parts[0] === 'letter') return { type: 'letter', key: sourceKey, letterId: id, label: sourceLabel || sourceKey, ...excerpt };
    if (parts[0] === 'wtlb')   return { type: 'wtlb',   key: sourceKey, entryId: id,  label: sourceLabel || sourceKey, ...excerpt };
    return { type: parts[0], key: sourceKey, label: sourceLabel || sourceKey, ...excerpt };
  }
  if (parts[0] === 'journal') {
    // journal:<entryId>:<blockIdx>  — the user's own journal entry can be
    // a link source. The endpoint navigates back to the entry viewer.
    const eid = parts[1];
    let label = sourceLabel;
    if (!label && typeof JournalStore !== 'undefined') {
      const je = JournalStore.get(eid);
      if (je && typeof JournalHelpers !== 'undefined') {
        label = 'Journal · ' + (JournalHelpers.entryDisplayTitle(je) || 'Untitled');
      }
    }
    return { type: 'journal', key: sourceKey, entryId: eid, screen: 'journal-viewer', label: label || sourceKey, ...excerpt };
  }
  return { type: parts[0], key: sourceKey, label: sourceLabel || sourceKey, ...excerpt };
}

