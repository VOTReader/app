/* ═══════════════════════════════════════════════════════════════════════
   NotebookPickerSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function NotebookPickerSheet({ groupId, onClose }) {
  // Subscribe to both stores. The note's notebookIds list is in NoteStore;
  // the available notebooks list is in NotebookStore.
  React.useSyncExternalStore(
    React.useCallback((cb) => NoteStore.subscribe(cb), []),
    () => NoteStore.getVersion()
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => NotebookStore.subscribe(cb), []),
    () => NotebookStore.getVersion()
  );
  const note = NoteStore.get(groupId);
  const notebooks = NotebookStore.list();
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
      if (window.__bumpHlTick) window.__bumpHlTick();
      setNewName('');
    }
  };

  const toggle = (nbId) => {
    NoteStore.toggleNotebook(groupId, nbId);
    if (window.__bumpHlTick) window.__bumpHlTick();
  };

  const deleteNb = (nbId) => {
    NotebookStore.remove(nbId);
    if (window.__bumpHlTick) window.__bumpHlTick();
    setConfirmDeleteNb(null);
  };

  return (
    <div className="nb-picker-overlay" onClick={onClose}>
      <div className="nb-picker" onClick={e => e.stopPropagation()}>
        <div className="nb-picker-header">
          <span className="nb-picker-title">{memberIds.size > 0 ? "Manage Notebooks" : "Add to Notebook"}</span>
          <button className="nb-picker-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="nb-picker-new">
          <input
            ref={inputRef}
            className="nb-picker-new-input"
            type="text"
            placeholder="New notebook name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createNotebook(); } }}
            maxLength={60}
          />
          <button
            className={"nb-picker-new-btn" + (newName.trim() ? '' : ' disabled')}
            onClick={createNotebook}
            disabled={!newName.trim()}
          >Create</button>
        </div>
        {notebooks.length === 0
          ? <div className="nb-picker-empty">No notebooks yet. Type a name above to create your first one.</div>
          : <div className="nb-picker-list">
              {notebooks.map(nb => {
                if (confirmDeleteNb === nb.id) {
                  return (
                    <ConfirmStrip
                      key={nb.id}
                      question={`Delete “${nb.name}”? Notes will move to Uncategorized.`}
                      onCancel={() => setConfirmDeleteNb(null)}
                      onConfirm={() => deleteNb(nb.id)}
                    />
                  );
                }
                const checked = memberIds.has(nb.id);
                return (
                  <div
                    key={nb.id}
                    className={"nb-picker-row" + (checked ? ' checked' : '')}
                    onClick={() => toggle(nb.id)}
                    role="button"
                  >
                    <span className="nb-picker-check">
                      {checked && (
                        <svg viewBox="0 0 24 24">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <span className="nb-picker-name">{nb.name}</span>
                    <button
                      className="nb-picker-row-delete"
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteNb(nb.id); }}
                      title="Delete notebook"
                      aria-label="Delete notebook"
                    >×</button>
                  </div>
                );
              })}
            </div>
        }
      </div>
    </div>
  );
}
