/* ═══════════════════════════════════════════════════════════════════════
   NoteSheet — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function NoteSheet({ groupId, startInEditMode, hlTick, setHlTick, onClose, onOpenNotebookPicker }) {
  const note = React.useMemo(() => NoteStore.get(groupId), [groupId, hlTick]);
  const segs = React.useMemo(() => AnnotationStore.getByGroup(groupId), [groupId, hlTick]);
  const [mode, setMode] = React.useState(startInEditMode ? 'edit' : 'read');
  const [body, setBody] = React.useState(note ? note.body || '' : '');
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [showColors, setShowColors] = React.useState(false);
  const textareaRef = React.useRef(null);

  React.useEffect(() => {
    if (mode === 'edit' && textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to end so Edit-after-existing-content lands at the tail
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [mode]);

  if (!note || !segs.length) {
    // Note record went missing — close
    return null;
  }
  const color = note.color || 'yellow';
  const anchor = note.fullText || segs.map(s => s.ann.text || '').join(' … ');
  const truncatedAnchor = anchor.length > 220 ? anchor.slice(0, 220) + '…' : anchor;

  const save = () => {
    NoteStore.update(groupId, { body });
    setHlTick(t => t + 1);
    onClose();
  };

  const cancelEdit = () => {
    setBody(note.body || '');
    if (startInEditMode && !note.body) {
      // Fresh new note, never saved — convert back to a plain highlight
      // so the selection the user made is preserved on screen.
      AnnotationStore.convertGroup(groupId, 'highlight');
      NoteStore.remove(groupId);
      setHlTick(t => t + 1);
      onClose();
      return;
    }
    setMode('read');
  };

  const recolor = (c) => {
    AnnotationStore.recolorGroup(groupId, c);
    NoteStore.update(groupId, { color: c });
    setHlTick(t => t + 1);
    setShowColors(false);
    setMenuOpen(false);
  };

  const remove = () => {
    AnnotationStore.removeGroup(groupId);
    NoteStore.remove(groupId);
    setHlTick(t => t + 1);
    onClose();
  };

  const share = () => {
    const text = anchor + (note.body ? '\n\n' + note.body : '');
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else navigator.clipboard.writeText(text).catch(() => {});
    setMenuOpen(false);
  };

  const closeOverlay = () => {
    if (menuOpen) { setMenuOpen(false); setConfirmDelete(false); setShowColors(false); return; }
    onClose();
  };

  // Blank notes are allowed — the body can be empty.
  const canSave = true;
  // Tapping the header color dot opens the color picker — works in either
  // mode AND closes any other panel that's open (menu, delete confirm).
  const openColorPicker = () => {
    setShowColors(true);
    setMenuOpen(false);
    setConfirmDelete(false);
  };

  return React.createElement("div", { className: "note-sheet-overlay", onClick: closeOverlay },
    React.createElement("div", { className: "note-sheet", onClick: e => e.stopPropagation() },
      // Header: color dot (tappable) · "Note" · ⋯ menu (read mode only)
      React.createElement("div", { className: "note-sheet-header" },
        React.createElement("button", {
          className: "note-sheet-color-dot ann-chip-color-btn",
          "data-color": color,
          onClick: openColorPicker,
          title: "Change color",
          "aria-label": "Change note color"
        }),
        React.createElement("div", { className: "note-sheet-title" }, mode === 'edit' ? (note.body ? 'Edit note' : 'New note') : 'Note'),
        mode === 'read' && React.createElement("button", {
          className: "note-sheet-menu-btn",
          onClick: () => { setMenuOpen(v => !v); setShowColors(false); setConfirmDelete(false); },
          "aria-label": "Options"
        },
          React.createElement("svg", { viewBox: "0 0 24 24", fill: "currentColor" },
            React.createElement("circle", { cx: "12", cy: "5", r: "1.7" }),
            React.createElement("circle", { cx: "12", cy: "12", r: "1.7" }),
            React.createElement("circle", { cx: "12", cy: "19", r: "1.7" })
          )
        )
      ),
      // Color picker takes over the body area when opened — by tapping the
      // header dot OR the ⋯ menu's "Change color" item.
      showColors
        ? React.createElement("div", { className: "note-sheet-menu-colors" },
            React.createElement("button", { className: "ann-chip-back", onClick: () => setShowColors(false), title: "Back" }, "‹"),
            HL_COLORS.map(c => React.createElement("button", {
              key: c,
              className: "ann-chip-color-btn" + (color === c ? ' active' : ''),
              "data-color": c,
              onClick: () => recolor(c),
              title: c
            }))
          )
        : React.createElement(React.Fragment, null,
            // Anchor text (italic quote)
            React.createElement("div", { className: "note-sheet-anchor" }, "“", truncatedAnchor, "”"),
            // Date row — read mode only. Shows when the note was last edited
            // (or when it was created if never edited). Subtle Cinzel caps
            // so it doesn't compete with the body content.
            mode === 'read' && (note.updated || note.created) && React.createElement("div", { className: "note-sheet-date" },
              relativeDate(note.updated || note.created)
            ),
            // Edit mode: always-visible color row so users can pick a color
            // without needing to open the ⋯ menu first.
            mode === 'edit' && React.createElement("div", { className: "note-edit-colors" },
              HL_COLORS.map(c => React.createElement("button", {
                key: c,
                className: "ann-chip-color-btn" + (color === c ? ' active' : ''),
                "data-color": c,
                onClick: () => recolor(c),
                title: c
              }))
            ),
            // Notebook chips (only in read mode and only if any are assigned)
            mode === 'read' && (note.notebookIds || []).length > 0 && React.createElement("div", { className: "note-sheet-nb-chips" },
              (note.notebookIds || []).map(id => {
                const nb = NotebookStore.get(id);
                if (!nb) return null;
                return React.createElement("span", { key: id, className: "note-sheet-nb-chip" },
                  React.createElement("svg", { viewBox: "0 0 24 24" },
                    React.createElement("path", { d: "M4 4h11l5 5v11a1 1 0 0 1-1 1H4z" }),
                    React.createElement("polyline", { points: "15 4 15 9 20 9" })
                  ),
                  nb.name
                );
              })
            ),
            // Body — read mode displays it; edit mode shows textarea
            mode === 'read' ? (
              note.body
                ? React.createElement("div", { className: "note-sheet-body" }, note.body)
                : React.createElement("div", { className: "note-sheet-empty" }, "Empty note. Tap ⋯ → Edit to add text.")
            ) : React.createElement("textarea", {
              ref: textareaRef, className: "note-sheet-textarea",
              value: body, onChange: e => setBody(e.target.value),
              placeholder: "Write your note…",
              onFocus: () => {
                setTimeout(() => {
                  try { textareaRef.current && textareaRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
                }, 220);
              }
            }),
            // Edit mode: notebook assignment row — always visible so users
            // can assign to a notebook during creation, not just after.
            mode === 'edit' && React.createElement("button", {
              className: "note-edit-nb-row",
              onClick: () => { onOpenNotebookPicker && onOpenNotebookPicker(groupId); }
            },
              React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" },
                React.createElement("path", { d: "M4 4h11l5 5v11a1 1 0 0 1-1 1H4z" }),
                React.createElement("polyline", { points: "15 4 15 9 20 9" })
              ),
              (note.notebookIds || []).length > 0
                ? ((note.notebookIds || []).map(id => { const nb = NotebookStore.get(id); return nb ? nb.name : null; }).filter(Boolean).join(', ') || "Add to notebook…")
                : "Add to notebook…"
            ),
            // Read mode: no Edit footer — use ⋯ → Edit. Edit mode: Cancel + Save.
            // Save is always enabled — blank notes are valid.
            mode === 'edit' && React.createElement("div", { className: "note-sheet-footer" },
              React.createElement("button", { className: "note-sheet-secondary", onClick: cancelEdit }, "Cancel"),
              React.createElement("button", { className: "note-sheet-save", onClick: save }, "Save")
            ),
            // ⋯ menu panel (read mode only). Color sub-panel was hoisted above
            // so the menu only carries the action items + delete confirm.
            mode === 'read' && menuOpen && React.createElement("div", { className: "note-sheet-menu" },
              confirmDelete
                ? React.createElement("div", { className: "ann-chip-confirm" },
                    React.createElement("span", { className: "ann-chip-confirm-q" }, "Delete this note?"),
                    React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-cancel", onClick: () => setConfirmDelete(false) }, "Cancel"),
                    React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-yes", onClick: remove }, "Yes, delete")
                  )
                : React.createElement(React.Fragment, null,
                    React.createElement("button", { className: "note-sheet-menu-item", onClick: () => { setMenuOpen(false); setMode('edit'); } }, "Edit note"),
                    React.createElement("button", { className: "note-sheet-menu-item", onClick: () => { setMenuOpen(false); openColorPicker(); } }, "Change color"),
                    React.createElement("button", {
                      className: "note-sheet-menu-item",
                      onClick: () => { setMenuOpen(false); onOpenNotebookPicker && onOpenNotebookPicker(groupId); }
                    }, ((note.notebookIds || []).length > 0 ? "Manage notebooks…" : "Add to notebook…")),
                    React.createElement("button", { className: "note-sheet-menu-item", onClick: share }, "Share"),
                    React.createElement("button", { className: "note-sheet-menu-item danger", onClick: () => setConfirmDelete(true) }, "Delete note")
                  )
            )
          )
    )
  );
}
