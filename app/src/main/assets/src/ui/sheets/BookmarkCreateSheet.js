/* ═══════════════════════════════════════════════════════════════
   BOOKMARK CREATE SHEET — pre-commit form for new bookmarks
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html; no import/export.
   Depends on: BookmarkStore (src/stores/bookmark-store.js), the
   bkmId() helper from the same module, and the LinkPicker CSS classes
   (.link-picker-overlay, .navpick-sheet, .navpick-header, etc.) which
   we reuse for visual consistency with the link-creation flow.

   The sheet replaces what used to be a silent BookmarkStore.add at
   the moment of action. Now both the SelectionToolbar bookmark action
   and the chapter-level NavButton open this sheet, giving the user a
   chance to refine the auto-derived label and to attach an optional
   thought ("why did I bookmark this?") in the SAME gesture as
   creation — instead of having to navigate to BookmarksScreen and
   long-press a row to add the reason after the fact.

   Layout:
     ┌───────────────────────────────────┐
     │ ✕    New Bookmark            ✓   │  header (red ✕, green ✓)
     ├───────────────────────────────────┤
     │ Source Label                      │  Cinzel gold eyebrow
     │ "selected text excerpt"           │  italic preview
     │                                   │
     │ LABEL                             │
     │ [.............................. ] │  text input
     │                                   │
     │ A THOUGHT (optional)              │
     │ [.............................. ] │  textarea
     │ [.............................. ] │
     └───────────────────────────────────┘

   Props:
     pending: {
       hlKey:        string,    // the bookmark's storage key (with optional :start-end)
       sourceLabel:  string,    // Cinzel eyebrow context, e.g. "Volume Two · The Wide Path"
       excerpt:      string,    // selected text or auto-derived preview (italic block)
       defaultLabel: string,    // pre-populated label input value
     }
     onConfirm: function({ hlKey, label, thought }) → void
     onCancel:  function() → void
═══════════════════════════════════════════════════════════════ */

function BookmarkCreateSheet({ pending, onConfirm, onCancel }) {
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  var labelRef = useRef(null);
  var _label = useState((pending && pending.defaultLabel) || '');
  var label = _label[0]; var setLabel = _label[1];
  var _thought = useState('');
  var thought = _thought[0]; var setThought = _thought[1];

  // Re-sync local state if a different `pending` arrives (chapter bookmark
  // immediately after a selection bookmark, etc.). Identifying by hlKey is
  // sufficient — the sheet is mounted only when pending is non-null and
  // unmounted on close, so this guards the edge case of back-to-back opens.
  useEffect(function() {
    setLabel((pending && pending.defaultLabel) || '');
    setThought('');
    // Focus the label input on mount so users can immediately refine it.
    setTimeout(function() {
      if (labelRef.current) {
        labelRef.current.focus();
        labelRef.current.select();
      }
    }, 60);
  }, [pending && pending.hlKey]);

  // Wire Android hardware back to dismiss the sheet (same pattern every
  // other overlay uses — save/restore the prior __closeSheet).
  useEffect(function() {
    if (!pending) return;
    var prev = window.__closeSheet;
    window.__closeSheet = onCancel;
    return function() { window.__closeSheet = prev || null; };
  }, [pending, onCancel]);

  if (!pending) return null;

  function commit() {
    // Allow blank labels — fall back to defaultLabel or a generic string.
    var trimmedLabel = label.trim() || pending.defaultLabel || 'Bookmark';
    var trimmedThought = thought.trim(); // empty string = no thought
    onConfirm({
      hlKey: pending.hlKey,
      label: trimmedLabel,
      thought: trimmedThought
    });
  }

  return React.createElement('div', {
    className: 'link-picker-overlay',
    onClick: onCancel
  },
    React.createElement('div', {
      className: 'link-picker-sheet navpick-sheet bkm-create-sheet',
      onClick: function(e) { e.stopPropagation(); }
    },
      // Header: ✕ Cancel · "New Bookmark" · ✓ Save
      React.createElement('div', { className: 'navpick-header' },
        React.createElement('button', {
          className: 'navpick-close navpick-close-undo',
          onClick: onCancel,
          'aria-label': 'Cancel'
        }, '×'),
        React.createElement('span', { className: 'navpick-title' }, 'New Bookmark'),
        React.createElement('button', {
          className: 'navpick-confirm-green',
          onClick: commit,
          'aria-label': 'Save bookmark',
          title: 'Save bookmark'
        },
          React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2.5', strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('polyline', { points: '20 6 9 17 4 12' })
          )
        )
      ),

      // Body
      React.createElement('div', { className: 'bkm-create-body' },
        // Source context — Cinzel eyebrow + italic excerpt
        pending.sourceLabel && React.createElement('div', { className: 'bkm-create-source' }, pending.sourceLabel),
        pending.excerpt && React.createElement('div', { className: 'bkm-create-excerpt' }, '“', pending.excerpt, '”'),

        // Label field
        React.createElement('div', { className: 'bkm-create-field-label' }, 'Label'),
        React.createElement('input', {
          ref: labelRef,
          className: 'bkm-create-label-input',
          type: 'text',
          value: label,
          onChange: function(e) { setLabel(e.target.value); },
          onKeyDown: function(e) {
            // Enter on the label input commits; Escape cancels (same as ✕)
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          },
          placeholder: 'A short name for this bookmark…',
          maxLength: 200
        }),

        // Thought field (optional)
        React.createElement('div', { className: 'bkm-create-field-label' },
          'A Thought',
          React.createElement('span', { className: 'bkm-create-field-hint' }, ' (optional — why did you save this?)')
        ),
        React.createElement('textarea', {
          className: 'bkm-create-thought-input',
          value: thought,
          onChange: function(e) { setThought(e.target.value); },
          onKeyDown: function(e) {
            // Escape cancels; Ctrl/Cmd+Enter commits without leaving the textarea
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
          },
          placeholder: 'A few words for your future self…',
          rows: 4
        })
      )
    )
  );
}
