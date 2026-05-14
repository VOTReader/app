/* ═══════════════════════════════════════════════════════════════
   NAVIGATION INDEX
   Flat list of every navigable target (Bible chapter, letter,
   WTLB entry, study chapter, etc.) with aliases for shortcut
   matching. Built lazily, cached on window.__NAV_INDEX.
═══════════════════════════════════════════════════════════════ */
function buildNavIndex() {
  if (window.__NAV_INDEX) return window.__NAV_INDEX;
  const items = [];

  /* Bible books → chapters. Each book gets a chapter-level entry. */
  const books = _allBooks();
  Object.values(books).forEach(book => {
    if (!book || !book.chapters) return;
    const titleLc = book.title.toLowerCase();
    const titleNoSpace = titleLc.replace(/\s+/g, '');
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
          letterId: ch.id,
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
  return items;
}

function searchNavIndex(query, limit) {
  limit = limit || 30;
  if (!query) return [];
  const q = query.toLowerCase().trim();
  const items = buildNavIndex();
  const scored = [];

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

  for (const item of items) {
    if (bibleRefHit &&
        (item.kind === 'bible-chapter' || item.kind === 'study-chapter') &&
        item.bookId === bibleRefHit.bookId && item.chapter === bibleRefHit.chapter) {
      continue;
    }
    let best = 0;
    for (const a of item.aliases) {
      if (a === q) { best = Math.max(best, 900); continue; }
      if (a.startsWith(q)) { best = Math.max(best, 700 - (a.length - q.length)); continue; }
      const idx = a.indexOf(q);
      if (idx >= 0) { best = Math.max(best, 400 - idx); continue; }
    }
    const titleLc = (item.title || '').toLowerCase();
    if (titleLc.includes(q)) best = Math.max(best, 200);
    if (best > 0) scored.push({ item: item, score: best });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

function navItemPreview(it) {
  if (it.kind === 'bible-chapter') {
    const b = _allBooks()[it.bookId];
    if (!b) return '';
    const ch = b.chapters && b.chapters.find(c => c.num === it.chapter);
    if (!ch) return '';
    if (it.verse) {
      const v = ch.sections && ch.sections.flatMap(s => s.verses).find(v => v.n === it.verse);
      return v ? v.text : '';
    }
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

function navItemToEndpoint(it) {
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
