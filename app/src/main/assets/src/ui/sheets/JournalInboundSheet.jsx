/* ═══════════════════════════════════════════════════════════════════════
   JournalInboundSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function JournalInboundSheet({ refKey, resourceLabel, onClose, onOpenEntry }) {
  var ids = (typeof JournalIndexStore !== 'undefined') ? JournalIndexStore.entriesReferencing(refKey) : [];
  var entries = ids
    .map(function(id) { return JournalStore.get(id); })
    .filter(function(e) { return !!e; })
    .sort(function(a, b) { return (b.updated || b.created || 0) - (a.updated || a.created || 0); });

  var headerText = entries.length === 1
    ? '1 journal entry'
    : entries.length + ' journal entries';

  return (
    <div className="note-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div className="note-sheet" onClick={(e) => { e.stopPropagation(); }} style={{ maxWidth: '480px' }}>
        <div className="note-sheet-header">
          <span className="note-sheet-title" style={{ flex: 1 }}>{headerText}{resourceLabel ? ' · ' + resourceLabel : ''}</span>
          <button className="note-sheet-menu-btn" onClick={onClose} aria-label="Close" style={{ fontSize: '18px' }}>×</button>
        </div>
        {entries.length === 0
          ? <div style={{ padding: '40px 20px', textAlign: 'center', fontStyle: 'italic', color: 'var(--cream-dim)', fontFamily: 'EB Garamond, serif' }}>No journal entries reference this yet.</div>
          : <div className="jrn-inbound-list">
              {entries.map(function(e) {
                var title = JournalHelpers.entryDisplayTitle(e) || 'Untitled';
                return (
                  <div
                    key={e.id}
                    className="jrn-inbound-item"
                    role="button"
                    onClick={() => { onOpenEntry && onOpenEntry(e); }}
                  >
                    <div className="jrn-inbound-title">{title}</div>
                    <div className="jrn-inbound-date">{JournalHelpers.longDate(e.updated || e.created)}</div>
                    <div className="jrn-inbound-preview">{JournalHelpers.previewText(e, 100)}</div>
                  </div>
                );
              })}
            </div>
        }
      </div>
    </div>
  );
}
