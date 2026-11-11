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

import { UiIcon } from '../components/UiIcon.jsx';

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

  // r-nbpick (the UI pass, mock v2 readers): "Move to a notebook". A card of choices, first "Not in a
  // notebook" (ticked while the note is in none; a tap takes it out of every one), then each notebook with
  // its tick and a bin; "New notebook" with a field and Create; Cancel | Save at the foot.
  return (
    <div className="nb-picker-overlay" onClick={requestClose}>
      <div className="nb-picker rd-form-sheet rd-nb-sheet" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="notebook-picker-title" onClick={e => e.stopPropagation()}>
        <div className="ui-sheet-head">
          <h2 className="ui-sheet-title" id="notebook-picker-title">Move to a notebook</h2>
        </div>
        <div className="ui-group is-inset nb-picker-list">
          <button type="button" className={'ui-row is-one no-lead ui-row-press nb-picker-none' + (selected.size === 0 ? ' checked' : '')}
            role="checkbox" aria-checked={selected.size === 0} onClick={() => setSelected(new Set())}>
            <span className="ui-row-title">Not in a notebook</span>
            {selected.size === 0 && <span className="ui-row-mark is-tick"><UiIcon name="check" size="sm" /></span>}
          </button>
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
              // The toggle is its own checkbox button and Delete its sibling (sweep mw10: no nested control).
              <div key={nb.id} className={'nb-picker-row' + (checked ? ' checked' : '')} onClick={() => toggle(nb.id)}>
                <button type="button" className="ui-row is-one no-lead nb-picker-row-toggle" role="checkbox" aria-checked={checked}>
                  <span className="ui-row-title nb-picker-name">{nb.name}</span>
                  {checked && <span className="ui-row-mark is-tick"><UiIcon name="check" size="sm" /></span>}
                </button>
                <button
                  type="button"
                  className="ui-row-menu nb-picker-row-delete"
                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteNb(nb.id); }}
                  title={'Delete notebook ' + nb.name}
                  aria-label={'Delete notebook ' + nb.name}
                ><UiIcon name="trash" size="sm" /></button>
              </div>
            );
          })}
        </div>
        <div className="rd-label">New notebook</div>
        <div className="nb-picker-new">
          <div className="ui-field is-square rd-field">
            <input
              ref={inputRef}
              className="nb-picker-new-input"
              type="text"
              placeholder="Notebook name"
              aria-label="New notebook name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createNotebook(); } }}
              maxLength={60}
            />
          </div>
          <button type="button" className="ui-btn nb-picker-new-btn" onClick={createNotebook} disabled={!newName.trim()}>Create</button>
        </div>
        {notebooks.length === 0 && <p className="rd-note">No notebooks yet. Name one here to make your first.</p>}
        {/* The HONEST Save: nothing above commits until it. A dismissal with unsaved changes swaps the foot
            for a discard ConfirmStrip. Save is off while there is nothing to save. */}
        {confirmingDiscard ? (
          <ConfirmStrip
            className="nb-picker-discard-confirm"
            question="Discard changes?"
            yesLabel="Yes, discard"
            onCancel={() => setConfirmingDiscard(false)}
            onConfirm={onClose}
          />
        ) : (
          <div className="ui-btn-row rd-foot">
            <button type="button" className="ui-btn nb-picker-cancel" onClick={requestClose}>Cancel</button>
            <button type="button" className="ui-btn is-primary nb-picker-save" onClick={commit} disabled={!dirty}
              title={dirty ? 'Save notebook changes' : 'No changes to save'}>Save</button>
          </div>
        )}
      </div>
    </div>
  );
}
