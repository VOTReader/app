/* ═══════════════════════════════════════════════════════════════
   JOURNAL INBOUND CHIP — surfaces "N journal entries on this" on
   letter/chapter views.
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Depends on: React, JournalIndexStore.

   Defines the JournalChip React component. When the current
   letter/chapter/bookmark has any inbound journal references, this
   chip renders a journal icon + count badge in the nav bar.

   Usage from index.html wiring (added to letter/chapter view nav):
     React.createElement(JournalChip, { refKey, hlTick, onClick })

   The chip renders nothing (returns null) if there are zero
   references — zero-cost when unused.

   refKey examples:
     'letter:two/the-wide-path'
     'chapter:psalms:23'
     'bookmark:bkm_abc'
═══════════════════════════════════════════════════════════════ */

export function JournalChip({ refKey, hlTick, onClick, label }) {
  var useMemo = React.useMemo;
  // Hooks must be called unconditionally on every render — no early return
  // before useMemo, or React detects the changed hook count and throws.
  var ids = useMemo(function() {
    if (!refKey || typeof JournalIndexStore === 'undefined') return [];
    return JournalIndexStore.entriesReferencing(refKey);
  }, [refKey, hlTick]);
  if (!refKey || !ids || ids.length === 0) return null;

  return React.createElement('button', {
    className: 'nav-search-btn jrn-inbound-chip',
    onClick: function() { onClick && onClick(refKey, label); },
    title: ids.length + ' journal ' + (ids.length === 1 ? 'entry' : 'entries'),
    'aria-label': 'Journal entries'
  },
    React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round', style: { color: 'var(--gold)' } },
      React.createElement('path', { d: 'M7 4h10a2 2 0 012 2v14l-7-3-7 3V6a2 2 0 012-2z' }),
      React.createElement('path', { d: 'M9 9h6M9 13h4' })
    ),
    React.createElement('span', { className: 'jrn-inbound-chip-badge' }, ids.length)
  );
}

/* Build the refKey for the current context — exposed for index.html
   wiring convenience. */
export function jrnRefKeyForLetter(volKey, letterId) {
  return (volKey && letterId) ? ('letter:' + volKey + '/' + letterId) : null;
}
export function jrnRefKeyForChapter(bookId, chapter) {
  return (bookId && chapter != null) ? ('chapter:' + bookId + ':' + chapter) : null;
}
export function jrnRefKeyForBookmark(bookmarkId) {
  return bookmarkId ? ('bookmark:' + bookmarkId) : null;
}

/* Resolve a letter refKey from the collection's display label (e.g.
   'Volume Two') and a letterId. Used by LetterView and WtlbEntryView
   nav, which receive `volumeLabel` rather than the raw volKey. */
export function jrnRefKeyForLetterByLabel(volumeLabel, letterId) {
  if (!volumeLabel || !letterId || typeof COLLECTIONS === 'undefined') return null;
  for (var i = 0; i < COLLECTIONS.length; i++) {
    if (COLLECTIONS[i].label === volumeLabel) {
      return 'letter:' + COLLECTIONS[i].volKey + '/' + letterId;
    }
  }
  return null;
}
