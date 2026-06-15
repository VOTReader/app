/* ===================================================================
   Tab metadata helpers — content key, progress flag, scroll key, describe
   ===================================================================
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   Bundled helpers (P5e):
   - describeTab
   - tabContentKey
   - tabHasProgressBar
   - scrollKeyForTab
   =================================================================== */

/**
 * The tab-state shape these helpers consume. Sourced from useTabs (P6k-A)
 * and the tabField setters; every field is optional (a fresh tab on home
 * has only `screen: 'home'`). Bare-name globals (MATTHEW, BOOKS, etc.)
 * are typed via the auto-generated globals.d.ts and read at runtime.
 *
 * @typedef {{
 *   screen?: string,
 *   bookId?: string,
 *   chapterNum?: number | null,
 *   letterId?: string | null,
 *   studyId?: string | null,
 *   studyChapterId?: string | null,
 *   genreId?: string | null,
 *   gardenPage?: number | null,
 *   searchQuery?: string | null
 * }} TabState
 */

/**
 * Resolve a TabState into the display title/subtitle pair used by the
 * Tabs Overview cards. Falls back gracefully — every branch ends with a
 * defined return, and the final default lands on Home.
 *
 * @param {TabState} tab
 * @returns {{ title: string, subtitle: string }}
 */
export function describeTab(tab) {
  // Returns { title, subtitle } for the card. Falls back gracefully.
  const s = tab.screen || 'home';
  // Q8: BOOKS *and* MATTHEW / MATTHEW_PLAIN are ALL lazy-loaded (bundle-a-bible
  // / bundle-a-matthew). Describing a Matthew tab while its corpus hasn't loaded
  // — e.g. the Tabs overview opened from a Bible screen, where only the bible
  // corpus is present — must NOT throw a bare-identifier ReferenceError. It did:
  // MATTHEW/MATTHEW_PLAIN were unguarded, so describeTab() threw "MATTHEW is not
  // defined", which crashed the whole AppShellOverlays render into its
  // ErrorBoundary fallback={null} — the overview (and every other overlay)
  // silently vanished and never came back (the boundary has no reset). typeof-
  // guard all three; a null book falls back to a generic 'Reading' label.
  const resolveBook = (id) => {
    if (!id) return null;
    if (id === 'matthew') return (typeof MATTHEW !== 'undefined') ? MATTHEW : null;
    if (id === 'matthew-plain') return (typeof MATTHEW_PLAIN !== 'undefined') ? MATTHEW_PLAIN : null;
    return (typeof BOOKS !== 'undefined') ? BOOKS[id] : null;
  };
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

/**
 * Build the dedup key for a tab — used by `deduplicateTabs` to fold tabs
 * whose visible content matches into a single entry. Pipe-separated field
 * concatenation; unset numerics serialize as empty (so chapter=0 and
 * chapter=undefined would collide, but chapter is 1-indexed in this app).
 *
 * @param {TabState} tab
 * @returns {string}
 */
export function tabContentKey(tab) {
  return `${tab.screen || 'home'}|${tab.bookId || ''}|${tab.chapterNum ?? ''}|${tab.letterId || ''}|${tab.studyId || ''}|${tab.studyChapterId || ''}|${tab.genreId || ''}|${tab.gardenPage ?? ''}`;
}

/**
 * True iff this tab is on a screen where the dwell-based read-tracking
 * progress bar should render. Driven by the READING_SCREENS module global
 * (declared in index.html / globals.d.ts).
 *
 * @param {TabState} tab
 * @returns {boolean}
 */
export function tabHasProgressBar(tab) {
  return READING_SCREENS.has(tab.screen);
}

/**
 * Build the scroll-position key for a tab — used by useScrollMemory to
 * save/restore scroll between navigations. Different screen kinds get
 * different prefixes (bible vs. study vs. letter) so per-tab restoration
 * doesn't collide across genres.
 *
 * @param {TabState} tab
 * @returns {string}
 */
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

