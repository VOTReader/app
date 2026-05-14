function NoteSheet({ groupId, startInEditMode, hlTick, setHlTick, onClose, onOpenNotebookPicker }) {
  const note = useMemo(() => NoteStore.get(groupId), [groupId, hlTick]);
  const segs = useMemo(() => AnnotationStore.getByGroup(groupId), [groupId, hlTick]);
  const [mode, setMode] = useState(startInEditMode ? 'edit' : 'read');
  const [body, setBody] = useState(note ? note.body || '' : '');
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (mode === 'edit' && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [mode]);

  if (!note || !segs.length) {
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

  const openColorPicker = () => {
    setShowColors(true);
    setMenuOpen(false);
    setConfirmDelete(false);
  };

  return React.createElement("div", { className: "note-sheet-overlay", onClick: closeOverlay },
    React.createElement("div", { className: "note-sheet", onClick: e => e.stopPropagation() },
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
            React.createElement("div", { className: "note-sheet-anchor" }, "“", truncatedAnchor, "”"),
            mode === 'edit' && React.createElement("div", { className: "note-edit-colors" },
              HL_COLORS.map(c => React.createElement("button", {
                key: c,
                className: "ann-chip-color-btn" + (color === c ? ' active' : ''),
                "data-color": c,
                onClick: () => recolor(c),
                title: c
              }))
            ),
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
            mode === 'edit' && React.createElement("div", { className: "note-sheet-footer" },
              React.createElement("button", { className: "note-sheet-secondary", onClick: cancelEdit }, "Cancel"),
              React.createElement("button", { className: "note-sheet-save", onClick: save }, "Save")
            ),
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
