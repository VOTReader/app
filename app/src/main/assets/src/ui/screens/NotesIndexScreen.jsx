/* ═══════════════════════════════════════════════════════════════════════
   NotesIndexScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function NotesIndexScreen({ onBack, onHome: _onHome, onOpenNote, onNavigateToSource, theme, onThemeChange, onSearch, onHistory, onSettings, historyEnabled: _historyEnabled }) {
  // Subscribe to NoteStore + NotebookStore mutations so the index re-renders
  // on any add/remove/rename/membership change.
  React.useSyncExternalStore(
    React.useCallback((cb) => NoteStore.subscribe(cb), []),
    () => NoteStore.getVersion()
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => NotebookStore.subscribe(cb), []),
    () => NotebookStore.getVersion()
  );
  // All notes — annotations on letters, scripture, AND journal paragraphs.
  // Notes from inside journal entries are real annotations and belong here,
  // labeled with their journal source via noteSourceLabel.
  const allNotes = NoteStore.list();
  const notebooks = NotebookStore.list();
  // Restore the user's place (tab + drilled notebook) when returning from a
  // source tap-through. The navHandoff 'notesReturnCtx' slot is set in onRowTap
  // before we navigate away and consumed on this mount, so the back-pill ("Back
  // to Devotional") actually lands back in the Devotional drilled view.
  const _notesRet = (typeof window !== 'undefined' && window.navHandoff) ? window.navHandoff.peek('notesReturnCtx') : null;
  const [tab, setTab] = React.useState((_notesRet && _notesRet.tab) || 'notebooks'); // 'notebooks' | 'all-notes'
  const [drilledNbId, setDrilledNbId] = React.useState((_notesRet && _notesRet.drilledNbId) || null); // null | 'uncategorized' | <notebookId>
  React.useEffect(() => { if (typeof window !== 'undefined' && window.navHandoff) window.navHandoff.clear('notesReturnCtx'); }, []);
  const [newNbInline, setNewNbInline] = React.useState(false);
  const [newNbName, setNewNbName] = React.useState('');
  const [renaming, setRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState('');
  const [confirmDeleteNb, setConfirmDeleteNb] = React.useState(false);
  const [allNotesSort, setAllNotesSort] = React.useState('newest'); // 'newest' | 'oldest'
  const [drilledSort, setDrilledSort] = React.useState('newest');

  // Build the back-pill source label from the user's current location.
  // — Drilled into a user notebook: that notebook's name
  // — Drilled into Uncategorized: "Uncategorized"
  // — All Notes tab: "My Notes" (default)
  const currentSourceTitle = () => {
    if (drilledNbId === 'uncategorized') return 'Uncategorized';
    if (drilledNbId) {
      const nb = NotebookStore.get(drilledNbId);
      if (nb && nb.name) return nb.name;
    }
    return 'My Notes';
  };

  const onRowTap = (note) => {
    const nav = noteSourceNav(note);
    if (nav) {
      window.navHandoff.set('pendingOpenNote', note.groupId);
      // Remember which tab/notebook we're in so the back-pill returns the
      // user to the exact list they tapped from (consumed on next mount).
      window.navHandoff.set('notesReturnCtx', { tab: tab, drilledNbId: drilledNbId });
      onNavigateToSource(nav, { sourceLetterTitle: currentSourceTitle() });
    } else {
      onOpenNote(note.groupId);
    }
  };

  // Count notes per notebook for the cards
  const counts = React.useMemo(() => {
    const c = { __uncategorized: 0 };
    notebooks.forEach(nb => { c[nb.id] = 0; });
    allNotes.forEach(n => {
      const ids = n.notebookIds || [];
      if (ids.length === 0) c.__uncategorized++;
      else ids.forEach(id => { if (id in c) c[id]++; });
    });
    return c;
  }, [allNotes, notebooks]);

  // Sort helper for newest/oldest
  const sortList = (list, mode) => {
    const arr = [...list];
    arr.sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0));
    if (mode === 'oldest') arr.reverse();
    return arr;
  };

  // Drilled-in notes for the current notebook
  const drilledNotes = React.useMemo(() => {
    if (!drilledNbId) return [];
    let list;
    if (drilledNbId === 'uncategorized') {
      list = allNotes.filter(n => !n.notebookIds || n.notebookIds.length === 0);
    } else {
      list = allNotes.filter(n => (n.notebookIds || []).includes(drilledNbId));
    }
    return sortList(list, drilledSort);
  }, [allNotes, drilledNbId, drilledSort]);

  const allNotesSorted = React.useMemo(() => sortList(allNotes, allNotesSort), [allNotes, allNotesSort]);

  const createNotebook = () => {
    const trimmed = newNbName.trim();
    if (!trimmed) return;
    NotebookStore.add(trimmed);
    setNewNbName('');
    setNewNbInline(false);
  };

  const drilledNb = drilledNbId && drilledNbId !== 'uncategorized' ? NotebookStore.get(drilledNbId) : null;
  const drilledTitle = drilledNbId === 'uncategorized' ? 'Uncategorized' : (drilledNb ? drilledNb.name : '');

  const startRename = () => {
    if (!drilledNb) return;
    setRenameValue(drilledNb.name);
    setRenaming(true);
  };
  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && drilledNb) {
      NotebookStore.rename(drilledNb.id, trimmed);
    }
    setRenaming(false);
  };
  const deleteCurrent = () => {
    if (!drilledNb) return;
    NotebookStore.remove(drilledNb.id);
    setConfirmDeleteNb(false);
    setDrilledNbId(null);
  };

  // ── Hierarchical back: a drilled-in notebook is its own navigation level ──
  // Unwind it to the Notebooks list before Back leaves the screen, so no level
  // is skipped. popDrill is the single source of that transition — used by the
  // nav-bar back arrow, the in-content ‹ button, AND the global back router
  // (Android hardware back / web Escape), which calls window.__screenBack.
  const popDrill = () => { setDrilledNbId(null); setRenaming(false); setConfirmDeleteNb(false); };
  const handleNavBack = () => { if (drilledNbId) { popDrill(); } else { onBack(); } };
  React.useEffect(() => {
    // Register the screen-back interceptor only while drilled in. When not
    // drilled, no interceptor → the global router falls through to its normal
    // notes-index → origin route. See use-android-back.js §(1b).
    if (!drilledNbId) return undefined;
    const fn = () => { setDrilledNbId(null); setRenaming(false); setConfirmDeleteNb(false); return true; };
    window.__screenBack = fn;
    return () => { if (window.__screenBack === fn) window.__screenBack = null; };
  }, [drilledNbId]);

  return (
    <ScreenLayout navChildren={LibraryNav({ onBack: handleNavBack, onSearch: onSearch, onHistory: onHistory, onSettings: onSettings, theme: theme, onThemeChange: onThemeChange })}>
      <div className="notes-index-screen">
        <div className="notes-index-header">
          <h1 className="notes-index-title">My Notes</h1>
          <span className="notes-index-count">{allNotes.length}{allNotes.length === 1 ? " note" : " notes"}</span>
        </div>
        {/* Tab strip — hidden while drilled in */}
        {!drilledNbId && (
          <div className="notes-tabs">
            <button
              className={"notes-tab" + (tab === 'notebooks' ? ' active' : '')}
              onClick={() => setTab('notebooks')}
            >Notebooks</button>
            <button
              className={"notes-tab" + (tab === 'all-notes' ? ' active' : '')}
              onClick={() => setTab('all-notes')}
            >All Notes</button>
          </div>
        )}
        {/* ── DRILLED VIEW (inside a notebook) ── */}
        {drilledNbId && (
          <>
            <div className="nb-drilled-header">
              <button className="nb-drilled-back" onClick={popDrill} title="Back to Notebooks" aria-label="Back to Notebooks">‹</button>
              {renaming
                ? <input
                    className="nb-drilled-rename"
                    autoFocus type="text" value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    // No onBlur commit — explicit Save/Cancel buttons own the
                    // commit so tapping a button doesn't race the blur handler
                    // (Android has no Escape key; blur-commit was non-obvious).
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitRename(); } else if (e.key === 'Escape') setRenaming(false); }}
                    maxLength={60}
                  />
                : <span className="nb-drilled-title">{drilledTitle}</span>
              }
              {/* Rename mode: explicit Save / Cancel. Otherwise (user notebooks
                  only, not Uncategorized): Rename / Delete. */}
              {renaming
                ? <>
                    <button className="nb-drilled-action" onClick={commitRename} title="Save name">Save</button>
                    <button className="nb-drilled-action" onClick={() => setRenaming(false)} title="Cancel rename">Cancel</button>
                  </>
                : drilledNb && <>
                    <button className="nb-drilled-action" onClick={startRename} title="Rename notebook">Rename</button>
                    <button className="nb-drilled-action danger" onClick={() => setConfirmDeleteNb(true)} title="Delete notebook">Delete</button>
                  </>
              }
            </div>
            {confirmDeleteNb && (
              <ConfirmStrip
                style={{ marginBottom: '0.8rem' }}
                question={`Delete “${drilledTitle}”? Notes will move to Uncategorized.`}
                onCancel={() => setConfirmDeleteNb(false)}
                onConfirm={deleteCurrent}
              />
            )}
            {drilledNotes.length > 0 && (
              <div className="notes-index-controls">
                <button
                  className="notes-index-sort-btn"
                  onClick={() => setDrilledSort(s => s === 'newest' ? 'oldest' : 'newest')}
                  style={{ marginLeft: 'auto' }} title="Toggle sort order"
                >{drilledSort === 'newest' ? "Sort: Newest ↓" : "Sort: Oldest ↑"}</button>
              </div>
            )}
            {drilledNotes.length === 0
              ? (
                  <div className="notes-empty">
                    <div className="notes-empty-title">Nothing here yet</div>
                    <div className="notes-empty-hint">
                      {drilledNbId === 'uncategorized'
                        ? "Notes that aren't in any notebook will appear here."
                        : "Add notes to this notebook from the ⋯ menu on any note."
                      }
                    </div>
                  </div>
                )
              : (
                  <div className="notes-index-list">
                    {drilledNotes.map(note => <NoteRow key={note.groupId} note={note} onTap={onRowTap} />)}
                  </div>
                )
            }
          </>
        )}
        {/* ── NOTEBOOKS TAB (cards) ── */}
        {!drilledNbId && tab === 'notebooks' && (
          <div className="nb-card-grid">
            <button
              className="nb-card uncategorized"
              onClick={() => setDrilledNbId('uncategorized')}
            >
              <span className="nb-card-eyebrow">Default</span>
              <span className="nb-card-name">Uncategorized</span>
              <span className="nb-card-count">{counts.__uncategorized}{counts.__uncategorized === 1 ? " note" : " notes"}</span>
              <span className="nb-card-arrow">›</span>
            </button>
            {notebooks.map(nb => (
              <button
                key={nb.id}
                className="nb-card"
                onClick={() => setDrilledNbId(nb.id)}
              >
                <span className="nb-card-eyebrow">Notebook</span>
                <span className="nb-card-name">{nb.name}</span>
                <span className="nb-card-count">{(counts[nb.id] || 0)}{(counts[nb.id] || 0) === 1 ? " note" : " notes"}</span>
                <span className="nb-card-arrow">›</span>
              </button>
            ))}
            {newNbInline
              ? (
                  <div className="nb-card" style={{ cursor: 'default' }}>
                    <div className="nb-card-create-form">
                      <input
                        className="nb-card-create-input"
                        autoFocus type="text"
                        placeholder="Notebook name…"
                        value={newNbName}
                        onChange={e => setNewNbName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createNotebook(); } else if (e.key === 'Escape') { setNewNbInline(false); setNewNbName(''); } }}
                        maxLength={60}
                      />
                      <div className="nb-card-create-actions">
                        <button className="note-sheet-secondary" onClick={() => { setNewNbInline(false); setNewNbName(''); }} style={{ padding: '7px 10px' }}>Cancel</button>
                        <button className={"note-sheet-save" + (newNbName.trim() ? '' : ' disabled')} onClick={createNotebook} disabled={!newNbName.trim()} style={{ padding: '7px 10px' }}>Create</button>
                      </div>
                    </div>
                  </div>
                )
              : (
                  <button
                    className="nb-card new-notebook"
                    onClick={() => setNewNbInline(true)}
                  >
                    <span className="nb-card-plus">+</span>
                    <span className="nb-card-name">New Notebook</span>
                  </button>
                )
            }
          </div>
        )}
        {/* ── ALL NOTES TAB ── */}
        {!drilledNbId && tab === 'all-notes' && (
          <>
            {allNotes.length > 0 && (
              <div className="notes-index-controls">
                <button
                  className="notes-index-sort-btn"
                  onClick={() => setAllNotesSort(s => s === 'newest' ? 'oldest' : 'newest')}
                  style={{ marginLeft: 'auto' }} title="Toggle sort order"
                >{allNotesSort === 'newest' ? "Sort: Newest ↓" : "Sort: Oldest ↑"}</button>
              </div>
            )}
            {allNotes.length === 0
              ? (
                  <div className="notes-empty">
                    <div className="notes-empty-title">No Notes Yet</div>
                    <div className="notes-empty-hint">Long-press text in any chapter, tap Note in the toolbar, and your notes will appear here.</div>
                  </div>
                )
              : (
                  <div className="notes-index-list">
                    {allNotesSorted.map(note => <NoteRow key={note.groupId} note={note} onTap={onRowTap} />)}
                  </div>
                )
            }
          </>
        )}
      </div>
    </ScreenLayout>
  );
}
