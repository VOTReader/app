/* ═══════════════════════════════════════════════════════════════════════
   NotebookManagerSheet — Cluster D (esbuild bundle-d.js)
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

  return (
    <div className="nb-picker-overlay" onClick={onClose}>
      <div className="nb-picker" onClick={e => e.stopPropagation()}>
        <div className="nb-picker-header">
          <span className="nb-picker-title">Manage Notebooks</span>
          <button className="nb-picker-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="nb-picker-new">
          <input
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
                if (confirmDeleteId === nb.id) {
                  return (
                    <div key={nb.id} className="ann-chip-confirm" style={{ padding: '10px 12px' }}>
                      <span className="ann-chip-confirm-q">Delete “{nb.name}”? Notes will move to Uncategorized.</span>
                      <button className="ann-chip-confirm-btn ann-chip-confirm-cancel" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                      <button className="ann-chip-confirm-btn ann-chip-confirm-yes" onClick={() => deleteNb(nb.id)}>Yes, delete</button>
                    </div>
                  );
                }
                if (renameId === nb.id) {
                  return (
                    <div key={nb.id} className="nb-picker-row checked" style={{ gap: '8px' }}>
                      <input
                        className="nb-picker-new-input"
                        type="text"
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitRename(); } else if (e.key === 'Escape') cancelRename(); }}
                        maxLength={60}
                        style={{ flex: 1 }}
                      />
                      <button className="nb-picker-row-delete" onClick={cancelRename} title="Cancel">✕</button>
                      <button className="nb-picker-new-btn" onClick={commitRename}>Save</button>
                    </div>
                  );
                }
                const count = counts[nb.id] || 0;
                return (
                  <div key={nb.id} className="nb-picker-row" style={{ cursor: 'default' }}>
                    <span className="nb-picker-name">{nb.name}</span>
                    <span style={{ fontFamily: "'Cinzel',serif", fontSize: '0.52rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cream-muted)', marginRight: '8px' }}>{count}{count === 1 ? ' note' : ' notes'}</span>
                    <button className="nb-picker-row-delete" onClick={() => startRename(nb)} title="Rename" style={{ color: 'var(--cream-muted)', padding: '4px 8px' }}>✎</button>
                    <button className="nb-picker-row-delete" onClick={() => setConfirmDeleteId(nb.id)} title="Delete notebook" aria-label="Delete notebook">×</button>
                  </div>
                );
              })}
            </div>
        }
      </div>
    </div>
  );
}
