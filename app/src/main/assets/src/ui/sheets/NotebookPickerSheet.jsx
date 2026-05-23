/* ═══════════════════════════════════════════════════════════════════════
   NotebookPickerSheet — Cluster D (esbuild bundle-d.js)
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
                    <div key={nb.id} className="ann-chip-confirm" style={{ padding: '10px 12px' }}>
                      <span className="ann-chip-confirm-q">Delete “{nb.name}”? Notes will move to Uncategorized.</span>
                      <button className="ann-chip-confirm-btn ann-chip-confirm-cancel" onClick={() => setConfirmDeleteNb(null)}>Cancel</button>
                      <button className="ann-chip-confirm-btn ann-chip-confirm-yes" onClick={() => deleteNb(nb.id)}>Yes, delete</button>
                    </div>
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
