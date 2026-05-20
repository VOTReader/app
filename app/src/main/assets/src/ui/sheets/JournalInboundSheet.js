/* ═══════════════════════════════════════════════════════════════
   JOURNAL INBOUND SHEET — "N journal entries reference this" list
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Depends on: React, JournalStore, JournalIndexStore, JournalHelpers.

   Renders a bottom sheet listing every journal entry that references
   the resource identified by `refKey`. Tap a row → opens that entry.

   Props:
     refKey                — e.g. 'letter:two/the-wide-path'
     resourceLabel         — e.g. 'The Wide Path'  (for the sheet header)
     onClose()
     onOpenEntry(entry)    — caller navigates to JournalViewerScreen with this entry
═══════════════════════════════════════════════════════════════ */

export function JournalInboundSheet({ refKey, resourceLabel, onClose, onOpenEntry }) {
  var ids = (typeof JournalIndexStore !== 'undefined') ? JournalIndexStore.entriesReferencing(refKey) : [];
  var entries = ids
    .map(function(id) { return JournalStore.get(id); })
    .filter(function(e) { return !!e; })
    .sort(function(a, b) { return (b.updated || b.created || 0) - (a.updated || a.created || 0); });

  var headerText = entries.length === 1
    ? '1 journal entry'
    : entries.length + ' journal entries';

  return React.createElement('div', { className: 'note-sheet-overlay', onClick: function(e) { if (e.target === e.currentTarget) onClose && onClose(); } },
    React.createElement('div', { className: 'note-sheet', onClick: function(e) { e.stopPropagation(); }, style: { maxWidth: '480px' } },
      React.createElement('div', { className: 'note-sheet-header' },
        React.createElement('span', { className: 'note-sheet-title', style: { flex: 1 } }, headerText, resourceLabel ? ' · ' + resourceLabel : ''),
        React.createElement('button', { className: 'note-sheet-menu-btn', onClick: onClose, 'aria-label': 'Close', style: { fontSize: '18px' } }, '×')
      ),
      entries.length === 0
        ? React.createElement('div', { style: { padding: '40px 20px', textAlign: 'center', fontStyle: 'italic', color: 'var(--cream-dim)', fontFamily: 'EB Garamond, serif' } }, 'No journal entries reference this yet.')
        : React.createElement('div', { className: 'jrn-inbound-list' },
            entries.map(function(e) {
              var title = JournalHelpers.entryDisplayTitle(e) || 'Untitled';
              return React.createElement('div', {
                key: e.id,
                className: 'jrn-inbound-item',
                role: 'button',
                onClick: function() { onOpenEntry && onOpenEntry(e); }
              },
                React.createElement('div', { className: 'jrn-inbound-title' }, title),
                React.createElement('div', { className: 'jrn-inbound-date' }, JournalHelpers.longDate(e.updated || e.created)),
                React.createElement('div', { className: 'jrn-inbound-preview' }, JournalHelpers.previewText(e, 100))
              );
            })
          )
    )
  );
}
