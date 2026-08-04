/* ═══════════════════════════════════════════════════════════════════════
   NotebookPickerSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   TRANSACTIONAL since 2026-07-12 (owner call): membership toggles are
   buffered locally and committed only by the footer Save button. The ×,
   backdrop, Escape and Android back all discard — with a ConfirmStrip
   gate when there are unsaved changes — so closing the sheet mid-way
   never silently persists half a decision. (Before this, every row tap
   wrote straight to NoteStore and Save-less closing kept the changes.)

   Still IMMEDIATE (deliberately): creating a notebook (explicit "Create"
   button — the container is real and reusable even if this note's
   membership is discarded) and deleting a notebook (its own ConfirmStrip;
   store-side cleanup moves notes to Uncategorized).
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
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(false);
  // The BUFFERED membership set — seeded from the store at open, committed
  // by Save. Lazy initializer so it reads the store exactly once per mount
  // (the sheet is conditionally rendered, so each open is a fresh mount).
  const [selected, setSelected] = React.useState(
    () => new Set((NoteStore.get(groupId) || {}).notebookIds || [])
  );
  const inputRef = React.useRef(null);

  // Own modal-registry entry (moved out of AppShellSheets 2026-07-12):
  // Escape / Android back must route through requestClose so the unsaved-
  // changes discard gate applies to every dismissal path, not just the ×.
  useModalRegistry({ id: 'notebook-picker-sheet', dismiss: () => requestClose() });
  // [13] focus trap — Tab stays inside the picker (mounted = open).
  const trapRef = useFocusTrap(true);

  if (!note) return null;

  // Unsaved-change detection: symmetric difference between the buffer and
  // the store. Deleted notebooks are pruned from both sides by deleteNb /
  // the store's own cleanup, so a stale id never fakes dirtiness.
  const storedIds = new Set(note.notebookIds || []);
  const dirty = selected.size !== storedIds.size
    || [...selected].some((id) => !storedIds.has(id));

  const createNotebook = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const nb = NotebookStore.add(trimmed);
    if (nb) {
      // Pre-select the fresh notebook in the BUFFER — committed on Save.
      setSelected((prev) => { const next = new Set(prev); next.add(nb.id); return next; });
      setNewName('');
    }
  };

  const toggle = (nbId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(nbId)) next.delete(nbId); else next.add(nbId);
      return next;
    });
  };

  const deleteNb = (nbId) => {
    NotebookStore.remove(nbId);
    setSelected((prev) => { const next = new Set(prev); next.delete(nbId); return next; });
    setConfirmDeleteNb(null);
  };

  const commit = () => {
    // Apply the buffer as a diff through the store's existing toggle API.
    // Only ids of notebooks that still exist are added (a notebook deleted
    // while the sheet was open must not resurrect as a dangling id).
    const valid = new Set(NotebookStore.list().map((nb) => nb.id));
    const current = new Set(note.notebookIds || []);
    selected.forEach((id) => {
      if (!current.has(id) && valid.has(id)) NoteStore.toggleNotebook(groupId, id);
    });
    current.forEach((id) => {
      if (!selected.has(id)) NoteStore.toggleNotebook(groupId, id);
    });
    onClose();
  };

  // Single dismissal entry point — ×, backdrop, Escape, Android back.
  function requestClose() {
    if (confirmingDiscard) { setConfirmingDiscard(false); return; }
    if (dirty) { setConfirmingDiscard(true); return; }
    onClose();
  }

  return (
    <div className="nb-picker-overlay" onClick={requestClose}>
      <div className="nb-picker" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="notebook-picker-title" onClick={e => e.stopPropagation()}>
        <div className="nb-picker-header">
          <span className="nb-picker-title" id="notebook-picker-title">{storedIds.size > 0 ? "Manage Notebooks" : "Add to Notebook"}</span>
          <button className="nb-picker-close" onClick={requestClose} aria-label="Close">×</button>
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
                const checked = selected.has(nb.id);
                return (
                  <div
                    key={nb.id}
                    className={"nb-picker-row" + (checked ? ' checked' : '')}
                    onClick={() => toggle(nb.id)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(nb.id); }
                    }}
                    role="button"
                    tabIndex={0}
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
        {/* Footer — the HONEST Save: nothing above commits until this button.
            Swaps to a discard ConfirmStrip when a dismissal arrives with
            unsaved changes. Save is disabled when there's nothing to save. */}
        {confirmingDiscard ? (
          <ConfirmStrip
            className="nb-picker-discard-confirm"
            question="Discard changes?"
            yesLabel="Yes, discard"
            onCancel={() => setConfirmingDiscard(false)}
            onConfirm={onClose}
          />
        ) : (
          <div className="nb-picker-footer">
            <button className="nb-picker-cancel" onClick={requestClose}>Cancel</button>
            <button
              className="nb-picker-save"
              onClick={commit}
              disabled={!dirty}
              title={dirty ? 'Save notebook changes' : 'No changes to save'}
            >Save</button>
          </div>
        )}
      </div>
    </div>
  );
}
