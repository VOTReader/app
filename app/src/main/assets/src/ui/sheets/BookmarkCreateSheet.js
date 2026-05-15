/* ═══════════════════════════════════════════════════════════════
   BOOKMARK CREATE / EDIT SHEET
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html; no import/export.
   Depends on: BookmarkStore (src/stores/bookmark-store.js), bkmId(),
   and the LinkPicker CSS classes (.link-picker-overlay, .navpick-sheet,
   .navpick-header, etc.) reused for visual consistency with the link-
   creation flow.

   One component, two modes:
     CREATE mode (pending.editId is null/undefined): pre-commit form
       opened by SelectionToolbar's Bookmark action and by the chapter-
       bookmark NavButton. Lets the user refine the auto-derived label
       and attach an optional thought BEFORE persisting.
     EDIT mode (pending.editId set): opened by tapping an existing
       inline bookmark icon. Loads the current label + thought into
       the same fields. Save → BookmarkStore.update; the body also
       offers Open (navigate to source) and Delete (with tap-confirm).

   Layout (CREATE):
     ┌───────────────────────────────────┐
     │ ✕    New Bookmark            ✓   │
     ├───────────────────────────────────┤
     │ Source Label                      │
     │ "selected text excerpt"           │
     │ LABEL                             │
     │ [..............................] │
     │ A THOUGHT (optional)              │
     │ [..............................] │
     └───────────────────────────────────┘

   Layout (EDIT) adds Open + Delete row at body end:
     ...
     │ [ ↗ Open Source ] [ 🗑 Delete  ]  │  bottom action row

   Props:
     pending: {
       hlKey:         string,    // bookmark storage key
       sourceLabel:   string,    // Cinzel eyebrow (e.g. "The Wide Path")
       excerpt:       string,    // italic preview block
       defaultLabel:  string,    // CREATE: pre-populated label
       editId?:       string,    // EDIT mode: existing bookmark id
       currentLabel?: string,    // EDIT mode: existing label
       currentThought?: string,  // EDIT mode: existing thought
     }
     onConfirm: function({ editId?, hlKey, label, thought }) → void
     onCancel:  function() → void
     onDelete:  function(editId) → void
     onOpen:    function(editId) → void   // navigates to bookmark source
═══════════════════════════════════════════════════════════════ */

function BookmarkCreateSheet({ pending, onConfirm, onCancel, onDelete, onOpen }) {
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

  // Re-sync local state if a different `pending` arrives. The two-key
  // dependency captures both mode (editId) and instance (hlKey), so
  // back-to-back opens (e.g. close edit → open create on another spot)
  // both reset cleanly.
  useEffect(function() {
    if (!pending) return;
    if (pending.editId) {
      setLabel(pending.currentLabel || '');
      setThought(pending.currentThought || '');
    } else {
      setLabel(pending.defaultLabel || '');
      setThought('');
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
  }, [pending && pending.editId, pending && pending.hlKey]);

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

  return React.createElement('div', {
    className: 'link-picker-overlay',
    onClick: onCancel
  },
    React.createElement('div', {
      className: 'link-picker-sheet navpick-sheet bkm-create-sheet' + (isEditMode ? ' bkm-create-sheet-edit' : ''),
      onClick: function(e) { e.stopPropagation(); }
    },
      React.createElement('div', { className: 'navpick-header' },
        React.createElement('button', {
          className: 'navpick-close navpick-close-undo',
          onClick: onCancel,
          'aria-label': 'Cancel'
        }, '×'),
        React.createElement('span', { className: 'navpick-title' }, title),
        React.createElement('button', {
          className: 'navpick-confirm-green',
          onClick: commit,
          'aria-label': saveTitle,
          title: saveTitle
        },
          React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2.5', strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('polyline', { points: '20 6 9 17 4 12' })
          )
        )
      ),

      React.createElement('div', { className: 'bkm-create-body' },
        pending.sourceLabel && React.createElement('div', { className: 'bkm-create-source' }, pending.sourceLabel),
        pending.excerpt && React.createElement('div', { className: 'bkm-create-excerpt' }, '“', pending.excerpt, '”'),

        React.createElement('div', { className: 'bkm-create-field-label' }, 'Label'),
        React.createElement('input', {
          ref: labelRef,
          className: 'bkm-create-label-input',
          type: 'text',
          value: label,
          onChange: function(e) { setLabel(e.target.value); },
          onKeyDown: function(e) {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          },
          placeholder: 'A short name for this bookmark…',
          maxLength: 200
        }),

        React.createElement('div', { className: 'bkm-create-field-label' },
          'A Thought',
          React.createElement('span', { className: 'bkm-create-field-hint' }, ' (optional — why did you save this?)')
        ),
        React.createElement('textarea', {
          className: 'bkm-create-thought-input',
          value: thought,
          onChange: function(e) { setThought(e.target.value); },
          onKeyDown: function(e) {
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
          },
          placeholder: 'A few words for your future self…',
          rows: 4
        }),

        // Edit-mode actions: Open Source + Delete (tap-confirm). Only
        // rendered when we're editing an existing bookmark.
        isEditMode && React.createElement('div', { className: 'bkm-create-edit-actions' },
          React.createElement('button', {
            className: 'bkm-create-edit-btn',
            onClick: handleOpen,
            title: 'Open this passage'
          },
            React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round' },
              React.createElement('path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }),
              React.createElement('polyline', { points: '15 3 21 3 21 9' }),
              React.createElement('line', { x1: '10', y1: '14', x2: '21', y2: '3' })
            ),
            React.createElement('span', null, 'Open Source')
          ),
          !confirmingDelete && React.createElement('button', {
            className: 'bkm-create-edit-btn bkm-create-edit-btn-danger',
            onClick: handleDelete,
            title: 'Delete this bookmark'
          },
            React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round' },
              React.createElement('polyline', { points: '3 6 5 6 21 6' }),
              React.createElement('path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }),
              React.createElement('path', { d: 'M10 11v6' }),
              React.createElement('path', { d: 'M14 11v6' })
            ),
            React.createElement('span', null, 'Delete')
          ),
          confirmingDelete && React.createElement('div', { className: 'ann-chip-confirm bkm-create-edit-confirm' },
            React.createElement('span', { className: 'ann-chip-confirm-q' }, 'Delete bookmark?'),
            React.createElement('button', { className: 'ann-chip-confirm-btn ann-chip-confirm-cancel', onClick: function() { setConfirmingDelete(false); } }, 'Cancel'),
            React.createElement('button', { className: 'ann-chip-confirm-btn ann-chip-confirm-yes', onClick: handleDelete }, 'Yes, delete')
          )
        )
      )
    )
  );
}
