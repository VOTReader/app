/* ═══════════════════════════════════════════════════════════════════════
   BookmarkCreateSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function BookmarkCreateSheet({ pending, onConfirm, onCancel, onDelete, onOpen }) {
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  var labelRef = useRef(null);
  var isEditMode = !!(pending && pending.editId);

  var _label = useState(
    isEditMode ? (pending.currentLabel || '') : ((pending && pending.defaultLabel) || '')
  );
  var label = _label[0]; var setLabel = _label[1];
  var _thought = useState(isEditMode ? (pending.currentThought || '') : '');
  var thought = _thought[0]; var setThought = _thought[1];

  // Inline delete-confirm state (tap-confirm strip, never instant)
  var _confirmDel = useState(false);
  var confirmingDelete = _confirmDel[0]; var setConfirmingDelete = _confirmDel[1];

  // Track the values the sheet opened with so we can gate the Save button
  // on an actual change. In EDIT mode this prevents accidental no-op writes
  // (the user opens, glances, taps ✓ out of habit → silent no-op + 'updated'
  // timestamp bump). In CREATE mode we still want Save tappable on first
  // glance, so this ref just records the auto-derived defaults; the canSave
  // rule below treats CREATE differently (any non-empty label is fine).
  var initialRef = useRef({ label: '', thought: '' });

  // Re-sync local state if a different `pending` arrives. The two-key
  // dependency captures both mode (editId) and instance (hlKey), so
  // back-to-back opens (e.g. close edit → open create on another spot)
  // both reset cleanly. Names extracted to satisfy
  // react-hooks/exhaustive-deps's "no complex expressions in dep array".
  var pendingEditId = pending && pending.editId;
  var pendingHlKey = pending && pending.hlKey;
  useEffect(function() {
    if (!pending) return;
    if (pending.editId) {
      setLabel(pending.currentLabel || '');
      setThought(pending.currentThought || '');
      initialRef.current = {
        label: pending.currentLabel || '',
        thought: pending.currentThought || ''
      };
    } else {
      setLabel(pending.defaultLabel || '');
      setThought('');
      initialRef.current = {
        label: pending.defaultLabel || '',
        thought: ''
      };
    }
    setConfirmingDelete(false);
    // Focus the label input on mount so users can immediately refine it
    // in CREATE mode or jump straight to editing in EDIT mode.
    setTimeout(function() {
      if (labelRef.current) {
        labelRef.current.focus();
        labelRef.current.select();
      }
    }, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effect intent is re-sync ONLY when pending switches identity (editId/hlKey are the mode + instance keys). pending itself reads other fields at fire-time but tracking it would re-fire on every parent re-render. setLabel/setThought/setConfirmingDelete are tuple-unpacked useState setters (identity-stable).
  }, [pendingEditId, pendingHlKey]);

  // canSave drives both the visual disabled state and the keyboard-shortcut
  // guard. EDIT-mode: only if at least one field differs from what we
  // opened with (whitespace-tolerant). CREATE-mode: a non-empty label is
  // enough — the auto-derived default satisfies this on first render so
  // the fast "highlight → ✓" path stays one tap.
  var canSave;
  if (isEditMode) {
    canSave = label.trim() !== initialRef.current.label.trim()
           || thought.trim() !== initialRef.current.thought.trim();
  } else {
    canSave = label.trim().length > 0;
  }

  // Wire Android hardware back to dismiss (same save/restore pattern
  // every overlay in the app uses).
  useEffect(function() {
    if (!pending) return;
    var prev = window.__closeSheet;
    window.__closeSheet = onCancel;
    return function() { window.__closeSheet = prev || null; };
  }, [pending, onCancel]);

  if (!pending) return null;

  function commit() {
    var trimmedLabel = label.trim() || pending.defaultLabel || pending.currentLabel || 'Bookmark';
    var trimmedThought = thought.trim();
    onConfirm({
      editId: pending.editId || null,
      hlKey: pending.hlKey,
      label: trimmedLabel,
      thought: trimmedThought
    });
  }

  function handleDelete() {
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    if (typeof onDelete === 'function') onDelete(pending.editId);
  }

  function handleOpen() {
    if (typeof onOpen === 'function') onOpen(pending.editId);
  }

  var title = isEditMode ? 'Edit Bookmark' : 'New Bookmark';
  var saveTitle = isEditMode ? 'Save changes' : 'Save bookmark';

  return (
    <div className="link-picker-overlay" onClick={onCancel}>
      <div
        className={'link-picker-sheet navpick-sheet bkm-create-sheet' + (isEditMode ? ' bkm-create-sheet-edit' : '')}
        onClick={function(e) { e.stopPropagation(); }}
      >
        <div className="navpick-header">
          <button
            className="navpick-close navpick-close-undo"
            onClick={onCancel}
            aria-label="Cancel"
          >×</button>
          <span className="navpick-title">{title}</span>
          <button
            className="navpick-confirm-green"
            onClick={canSave ? commit : undefined}
            disabled={!canSave}
            aria-label={saveTitle}
            title={canSave ? saveTitle : (isEditMode ? 'No changes to save' : 'Add a label')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        </div>

        <div className="bkm-create-body">
          {pending.sourceLabel && <div className="bkm-create-source">{pending.sourceLabel}</div>}
          {pending.excerpt && <div className="bkm-create-excerpt">“{pending.excerpt}”</div>}

          <div className="bkm-create-field-label">Label</div>
          <input
            ref={labelRef}
            className="bkm-create-label-input"
            type="text"
            value={label}
            onChange={function(e) { setLabel(e.target.value); }}
            onKeyDown={function(e) {
              if (e.key === 'Enter') { e.preventDefault(); if (canSave) commit(); }
              else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
            }}
            placeholder="A short name for this bookmark…"
            maxLength={200}
          />

          <div className="bkm-create-field-label">
            A Thought
            <span className="bkm-create-field-hint"> (optional — why did you save this?)</span>
          </div>
          <textarea
            className="bkm-create-thought-input"
            value={thought}
            onChange={function(e) { setThought(e.target.value); }}
            onKeyDown={function(e) {
              if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
              else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (canSave) commit(); }
            }}
            placeholder="A few words for your future self…"
            rows={4}
          />

          {/* Edit-mode actions: Open Source + Delete (tap-confirm). Only
              rendered when we're editing an existing bookmark.
              `pending.atSource` is set true by callers who know the user is
              already on the bookmarked passage (currently: inline-icon tap
              in dom-bookmarks.js). In that case the Open Source button is
              a no-op so we hide it — keeps the EDIT sheet tighter and
              avoids the dead-action confusion. Future callers from a list
              surface (e.g. BookmarksScreen → row → Edit, if/when wired)
              will leave atSource unset and get the Open button by default. */}
          {isEditMode && (
            <div className="bkm-create-edit-actions">
              {!pending.atSource && (
                <button
                  className="bkm-create-edit-btn"
                  onClick={handleOpen}
                  title="Open this passage"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  <span>Open Source</span>
                </button>
              )}
              {!confirmingDelete && (
                <button
                  className="bkm-create-edit-btn bkm-create-edit-btn-danger"
                  onClick={handleDelete}
                  title="Delete this bookmark"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                  <span>Delete</span>
                </button>
              )}
              {confirmingDelete && (
                <ConfirmStrip
                  className="bkm-create-edit-confirm"
                  question="Delete bookmark?"
                  onCancel={function() { setConfirmingDelete(false); }}
                  onConfirm={handleDelete}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
