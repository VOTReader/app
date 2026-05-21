/* ═══════════════════════════════════════════════════════════════════════
   NotebookManagerSheet — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function NotebookManagerSheet({ hlTick, setHlTick, onClose }) {
  const notebooks = React.useMemo(() => NotebookStore.list(), [hlTick]);
  const [newName, setNewName] = React.useState('');
  const [renameId, setRenameId] = React.useState(null);    // notebook id being renamed
  const [renameValue, setRenameValue] = React.useState('');
  const [confirmDeleteId, setConfirmDeleteId] = React.useState(null);

  const counts = React.useMemo(() => {
    const map = {};
    NoteStore.list().forEach(n => {
      (n.notebookIds || []).forEach(id => { map[id] = (map[id] || 0) + 1; });
    });
    return map;
  }, [hlTick]);

  const createNotebook = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    NotebookStore.add(trimmed);
    setHlTick(t => t + 1);
    setNewName('');
  };

  const startRename = (nb) => { setRenameId(nb.id); setRenameValue(nb.name); };
  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && renameId) {
      NotebookStore.rename(renameId, trimmed);
      setHlTick(t => t + 1);
    }
    setRenameId(null);
    setRenameValue('');
  };
  const cancelRename = () => { setRenameId(null); setRenameValue(''); };

  const deleteNb = (id) => {
    NotebookStore.remove(id);
    setHlTick(t => t + 1);
    setConfirmDeleteId(null);
  };

  return React.createElement("div", { className: "nb-picker-overlay", onClick: onClose },
    React.createElement("div", { className: "nb-picker", onClick: e => e.stopPropagation() },
      React.createElement("div", { className: "nb-picker-header" },
        React.createElement("span", { className: "nb-picker-title" }, "Manage Notebooks"),
        React.createElement("button", { className: "nb-picker-close", onClick: onClose, "aria-label": "Close" }, "×")
      ),
      React.createElement("div", { className: "nb-picker-new" },
        React.createElement("input", {
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
              if (confirmDeleteId === nb.id) {
                return React.createElement("div", { key: nb.id, className: "ann-chip-confirm", style: { padding: '10px 12px' } },
                  React.createElement("span", { className: "ann-chip-confirm-q" }, "Delete “", nb.name, "”? Notes will move to Uncategorized."),
                  React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-cancel", onClick: () => setConfirmDeleteId(null) }, "Cancel"),
                  React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-yes", onClick: () => deleteNb(nb.id) }, "Yes, delete")
                );
              }
              if (renameId === nb.id) {
                return React.createElement("div", { key: nb.id, className: "nb-picker-row checked", style: { gap: '8px' } },
                  React.createElement("input", {
                    className: "nb-picker-new-input",
                    type: "text",
                    autoFocus: true,
                    value: renameValue,
                    onChange: e => setRenameValue(e.target.value),
                    onKeyDown: e => { if (e.key === 'Enter') { e.preventDefault(); commitRename(); } else if (e.key === 'Escape') cancelRename(); },
                    maxLength: 60,
                    style: { flex: 1 }
                  }),
                  React.createElement("button", { className: "nb-picker-row-delete", onClick: cancelRename, title: "Cancel" }, "✕"),
                  React.createElement("button", { className: "nb-picker-new-btn", onClick: commitRename }, "Save")
                );
              }
              const count = counts[nb.id] || 0;
              return React.createElement("div", { key: nb.id, className: "nb-picker-row", style: { cursor: 'default' } },
                React.createElement("span", { className: "nb-picker-name" }, nb.name),
                React.createElement("span", { style: { fontFamily: "'Cinzel',serif", fontSize: '0.52rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cream-muted)', marginRight: '8px' } }, count, count === 1 ? ' note' : ' notes'),
                React.createElement("button", { className: "nb-picker-row-delete", onClick: () => startRename(nb), title: "Rename", style: { color: 'var(--cream-muted)', padding: '4px 8px' } }, "✎"),
                React.createElement("button", { className: "nb-picker-row-delete", onClick: () => setConfirmDeleteId(nb.id), title: "Delete notebook", "aria-label": "Delete notebook" }, "×")
              );
            })
          )
    )
  );
}
