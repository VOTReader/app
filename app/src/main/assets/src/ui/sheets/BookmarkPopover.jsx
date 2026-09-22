/* ═══════════════════════════════════════════════════════════════════════
   BookmarkPopover — the tap-an-existing-bookmark menu, Cluster D (bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   AppShellSheets mounts this in the ALWAYS-PRESENT app shell: any bookmark
   glyph in a chapter, a letter or the margin opens it through
   window.__openBookmarkPopover, on screens that have nothing to do with My
   Bookmarks. So when the screen left the cold-boot path for the lazy
   bundle-g, the popover stayed behind — a shell that reaches for a symbol
   inside a bundle the reader may never load is a shell that breaks.

   Free globals (filled by bundle-d before any lazy bundle loads): React,
   BookmarkStore, useFocusTrap, relativeDate, ConfirmStrip.
   ═══════════════════════════════════════════════════════════════════════ */

export function BookmarkPopover({ bkmIds, x, y, onClose, onNavigate, onDeleteDone }) {
  var useState = React.useState;
  var _ci = useState(null); var confirmingId = _ci[0]; var setConfirmingId = _ci[1];

  var bookmarks = (bkmIds || []).map(function(id) { return BookmarkStore.get(id); }).filter(Boolean);
  var popoverOpen = !!(bkmIds && bkmIds.length && bookmarks.length);
  var trapRef = useFocusTrap(popoverOpen);
  React.useEffect(function() {
    if (bkmIds && bkmIds.length && bookmarks.length === 0) onClose();
  }, [bkmIds, bookmarks.length, onClose]);
  if (!popoverOpen) return null;

  function doDelete(bkm) {
    BookmarkStore.remove(bkm.id);
    onDeleteDone && onDeleteDone();
    if (bookmarks.length <= 1) onClose();
    else setConfirmingId(null);
  }

  var popX = Math.max(8, Math.min(x - 80, window.innerWidth - 320));
  var popY = Math.max(8, y);

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 8800 }} aria-hidden="true" onClick={onClose} />
      <div
        className="bkm-popover"
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Bookmark actions"
        style={{ left: popX, top: popY, zIndex: 8801 }}
        onClick={function(e) { e.stopPropagation(); }}
      >
        {bookmarks.map(function(bkm) {
          var isConfirming = confirmingId === bkm.id;
          var dateStr = (typeof relativeDate === 'function') ? relativeDate(bkm.created) : '';
          var hasThought = !!(bkm.thought && bkm.thought.trim().length);

          return (
            <div key={bkm.id} className="bkm-popover-item">
              {!isConfirming && (
                <>
                  <div className="bkm-popover-label">{bkm.label || '(no label)'}</div>
                  {dateStr && <div className="bkm-popover-date">{dateStr}</div>}
                  {/* Legacy records may still carry a saved thought — keep
                      DISPLAYING user data; only the add/edit affordance was
                      removed (owner call, 2026-07-12). */}
                  {hasThought && <div className="bkm-popover-thought">{bkm.thought}</div>}
                  <div className="bkm-popover-actions">
                    <button className="bkm-popover-btn" onClick={function() { onNavigate(bkm); onClose(); }}>Open</button>
                    <button className="bkm-popover-btn bkm-popover-btn-danger" onClick={function() { setConfirmingId(bkm.id); }}>Delete</button>
                  </div>
                </>
              )}
              {isConfirming && (
                <ConfirmStrip
                  style={{ padding: '8px 10px' }}
                  question="Delete this bookmark?"
                  onCancel={function() { setConfirmingId(null); }}
                  onConfirm={function() { doDelete(bkm); }}
                />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
