/* ═══════════════════════════════════════════════════════════════════════
   dom-journal-chip — Cluster C (esbuild bundle-c.js)
   ═══════════════════════════════════════════════════════════════════════
   Defines JournalChip + the jrnRefKey helper functions. JournalChip is a
   normal React component; the helpers are pure refKey builders.
   ═══════════════════════════════════════════════════════════════════════ */

export function JournalChip({ refKey, onClick, label }) {
  // Subscribe to JournalIndexStore — chip count updates when an entry
  // gains/loses a reference to this refKey.
  React.useSyncExternalStore(
    React.useCallback(function(cb) { return (typeof JournalIndexStore !== 'undefined') ? JournalIndexStore.subscribe(cb) : function() {}; }, []),
    function() { return (typeof JournalIndexStore !== 'undefined') ? JournalIndexStore.getVersion() : 0; }
  );
  var ids = (!refKey || typeof JournalIndexStore === 'undefined')
    ? []
    : JournalIndexStore.entriesReferencing(refKey);
  if (!refKey || !ids || ids.length === 0) return null;

  return (
    <button
      className="nav-search-btn jrn-inbound-chip"
      onClick={function() { onClick && onClick(refKey, label); }}
      title={ids.length + ' journal ' + (ids.length === 1 ? 'entry' : 'entries')}
      aria-label="Journal entries"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--gold)' }}>
        <path d="M7 4h10a2 2 0 012 2v14l-7-3-7 3V6a2 2 0 012-2z" />
        <path d="M9 9h6M9 13h4" />
      </svg>
      <span className="jrn-inbound-chip-badge">{ids.length}</span>
    </button>
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
   'Volume Two') and a letterId. */
export function jrnRefKeyForLetterByLabel(volumeLabel, letterId) {
  if (!volumeLabel || !letterId || typeof COLLECTIONS === 'undefined') return null;
  for (var i = 0; i < COLLECTIONS.length; i++) {
    if (COLLECTIONS[i].label === volumeLabel) {
      return 'letter:' + COLLECTIONS[i].volKey + '/' + letterId;
    }
  }
  return null;
}
