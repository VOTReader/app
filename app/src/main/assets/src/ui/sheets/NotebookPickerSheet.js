/* ═══════════════════════════════════════════════════════════════════════
   NotebookPickerSheet — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function NotebookPickerSheet({ groupId, hlTick, setHlTick, onClose }) {
  const note = React.useMemo(() => NoteStore.get(groupId), [groupId, hlTick]);
  const notebooks = React.useMemo(() => NotebookStore.list(), [hlTick]);
  const [newName, setNewName] = React.useState('');
  const [confirmDeleteNb, setConfirmDeleteNb] = React.useState(null); // notebook id or null
  const inputRef = React.useRef(null);

  if (!note) return null;
  const memberIds = new Set(note.notebookIds || []);

  const createNotebook = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const nb = NotebookStore.add(trimmed);
    if (nb) {
      // Auto-add the note to the freshly-created notebook
      NoteStore.toggleNotebook(groupId, nb.id);
      setHlTick(t => t + 1);
      setNewName('');
    }
  };

  const toggle = (nbId) => {
    NoteStore.toggleNotebook(groupId, nbId);
    setHlTick(t => t + 1);
  };

  const deleteNb = (nbId) => {
    NotebookStore.remove(nbId);
    setHlTick(t => t + 1);
    setConfirmDeleteNb(null);
  };

  return React.createElement("div", { className: "nb-picker-overlay", onClick: onClose },
    React.createElement("div", { className: "nb-picker", onClick: e => e.stopPropagation() },
      React.createElement("div", { className: "nb-picker-header" },
        React.createElement("span", { className: "nb-picker-title" }, memberIds.size > 0 ? "Manage Notebooks" : "Add to Notebook"),
        React.createElement("button", { className: "nb-picker-close", onClick: onClose, "aria-label": "Close" }, "×")
      ),
      React.createElement("div", { className: "nb-picker-new" },
        React.createElement("input", {
          ref: inputRef,
          className: "nb-picker-new-input",
          type: "text",
          placeholder: "New notebook name…",
          value: newName,
          onChange: e => setNewName(e.target.value),
          onKeyDown: e => { if (e.key === 'Enter') { e.preventDefault(); createNotebook(); } },
          maxLength: 60
        }),
        React.createElement("button", {
          className: "nb-picker-new-btn" + (newName.trim() ? '' : ' disabled'),
          onClick: createNotebook,
          disabled: !newName.trim()
        }, "Create")
      ),
      notebooks.length === 0
        ? React.createElement("div", { className: "nb-picker-empty" }, "No notebooks yet. Type a name above to create your first one.")
        : React.createElement("div", { className: "nb-picker-list" },
            notebooks.map(nb => {
              if (confirmDeleteNb === nb.id) {
                return React.createElement("div", { key: nb.id, className: "ann-chip-confirm", style: { padding: '10px 12px' } },
                  React.createElement("span", { className: "ann-chip-confirm-q" }, "Delete “", nb.name, "”? Notes will move to Uncategorized."),
                  React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-cancel", onClick: () => setConfirmDeleteNb(null) }, "Cancel"),
                  React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-yes", onClick: () => deleteNb(nb.id) }, "Yes, delete")
                );
              }
              const checked = memberIds.has(nb.id);
              return React.createElement("div", {
                key: nb.id,
                className: "nb-picker-row" + (checked ? ' checked' : ''),
                onClick: () => toggle(nb.id),
                role: "button"
              },
                React.createElement("span", { className: "nb-picker-check" },
                  checked && React.createElement("svg", { viewBox: "0 0 24 24" },
                    React.createElement("polyline", { points: "20 6 9 17 4 12" })
                  )
                ),
                React.createElement("span", { className: "nb-picker-name" }, nb.name),
                React.createElement("button", {
                  className: "nb-picker-row-delete",
                  onClick: (e) => { e.stopPropagation(); setConfirmDeleteNb(nb.id); },
                  title: "Delete notebook",
                  "aria-label": "Delete notebook"
                }, "×")
              );
            })
          )
    )
  );
}
