/* ===================================================================
   Tab metadata helpers — content key, progress flag, scroll key, describe
   ===================================================================
   Global-scope module. Concatenates with index.html via <script src>.
   Bundled helpers (P5e):
   - describeTab
   - tabContentKey
   - tabHasProgressBar
   - scrollKeyForTab
   =================================================================== */


export function describeTab(tab) {
  // Returns { title, subtitle } for the card. Falls back gracefully.
  const s = tab.screen || 'home';
  const resolveBook = (id) => id ? id === 'matthew' ? MATTHEW : id === 'matthew-plain' ? MATTHEW_PLAIN : BOOKS[id] : null;
  const book = resolveBook(tab.bookId);

  // Scripture flow
  if (s === 'matthew-ch' || s === 'bible-ch') {
    const title = book ? `${book.title} · Ch. ${tab.chapterNum ?? '?'}` : 'Reading';
    const ot = book && OT_BOOK_IDS && OT_BOOK_IDS.has(book.id);
    const subtitle = book ?
    book.id === 'matthew' || book.id === 'matthew-plain' ? 'New Testament · Gospels' : ot ? 'Old Testament' : 'New Testament' :
    'Scripture';
    return { title, subtitle };
  }
  if (s === 'bible-idx' || s === 'matthew-idx') {
    const title = book ? book.title : 'Book';
    return { title, subtitle: book && OT_BOOK_IDS && OT_BOOK_IDS.has(book.id) ? 'Old Testament' : 'New Testament' };
  }
  if (s === 'scriptures-home') return { title: 'Scriptures', subtitle: 'The Scriptures of Truth' };
  if (s === 'scripture-genre') return { title: tab.genreId || 'Scriptures', subtitle: 'Browse by genre' };

  // Volumes & letter collections (via COLLECTIONS registry)
  const _ltrCol = COL_BY_LETTER_SC.get(s);
  if (_ltrCol) {
    const l = colLetterArr(_ltrCol).find(e => e.id === tab.letterId);
    return { title: l?.title || (_ltrCol.kind === 'letter' ? 'Letter' : 'Entry'), subtitle: _ltrCol.label };
  }
  const _idxCol = COL_BY_INDEX_SC.get(s);
  if (_idxCol) return { title: _idxCol.label, subtitle: _idxCol.kind === 'letter' ? 'Letter index' : 'Entry index' };
  if (s === 'volumes-home') return { title: 'Volumes', subtitle: 'The Volumes of Truth' };

  // Studies
  if (s === 'studies-home') return { title: 'Studies', subtitle: 'Letter Studies · Matthew Study Bible' };
  if (s === 'bible-study-index') {
    const _study = _studies().find(st => st.slug === tab.studyId);
    return { title: _study?.title || 'Study', subtitle: 'Bible Letter Study' };
  }
  if (s === 'bible-study-chapter') {
    const _study = _studies().find(st => st.slug === tab.studyId);
    const _ch = _study && _study.chapters && _study.chapters.find(c => c.id === tab.studyChapterId);
    return { title: _ch?.title || 'Study Chapter', subtitle: _study?.title || 'Bible Letter Study' };
  }

  // Meta
  if (s === 'garden-view') return { title: `The Garden · Page ${tab.gardenPage ?? 1}`, subtitle: 'A Return to The Garden' };
  if (s === 'search') return { title: tab.searchQuery ? `"${tab.searchQuery}"` : 'Search', subtitle: 'Full-text search' };
  if (s === 'history') return { title: 'History', subtitle: 'Recently visited' };
  if (s === 'settings') return { title: 'Settings', subtitle: 'App configuration' };

  // Default → Home
  return { title: 'Home', subtitle: 'VOT Study Bible' };
}

export function tabContentKey(tab) {
  return `${tab.screen || 'home'}|${tab.bookId || ''}|${tab.chapterNum ?? ''}|${tab.letterId || ''}|${tab.studyId || ''}|${tab.studyChapterId || ''}|${tab.genreId || ''}|${tab.gardenPage ?? ''}`;
}

export function tabHasProgressBar(tab) {
  return READING_SCREENS.has(tab.screen);
}

export function scrollKeyForTab(tab) {
  const s = tab.screen;
  if (s === 'matthew-ch' || s === 'bible-ch') return `${tab.bookId}-${tab.chapterNum}`;
  if (s === 'bible-study-chapter') return `study-${tab.studyId || ''}-${tab.studyChapterId || ''}`;
  if (s === 'hm-letter') return `entry-${tab.letterId}`;
  const _sc = COL_BY_LETTER_SC.get(s);
  if (_sc) {
    const pfx = _sc.kind === 'holy-days' ? 'holyday' : _sc.kind === 'letter' ? 'letter' : _sc.kind;
    return `${pfx}-${tab.letterId}`;
  }
  return s || 'home';
}

