/* ═══════════════════════════════════════════════════════════════════════
   NotesIndexScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { normalizeExcerptDisplay } from '../../utils/excerpt-display.js';
import { composeNotesExport, notesExportFilename, shareNotesExport } from '../../utils/notes-export.js';

/**
 * Case-insensitive full-text filter for the Notes index — matches a note's
 * body, its anchor excerpt (fullText, display-normalized so queries match
 * what NoteRow actually renders, including legacy collapsed-line records),
 * and its source label ("Genesis 1:1-3", a letter title, "Journal · …").
 * A blank query returns the list unchanged.
 *
 * @param {any[]} notes
 * @param {string} query
 * @returns {any[]}
 */
export function filterNotesByQuery(notes, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return notes;
  return notes.filter(note =>
    (note.body || '').toLowerCase().includes(q) ||
    normalizeExcerptDisplay(note.fullText).toLowerCase().includes(q) ||
    noteSourceLabel(note).toLowerCase().includes(q)
  );
}

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
  // "Back to <source>" pill — set when this screen was opened as a link-out
  // (e.g. a journal entry's Notebook card). Mirrors the reading screens'
  // fromLetterStack pill so every journal card returns to its source in one
  // tap. Lives in component state (resets on unmount = single-shot).
  const [backPill, setBackPill] = React.useState((_notesRet && _notesRet.backPill) || null);
  React.useEffect(() => { if (typeof window !== 'undefined' && window.navHandoff) window.navHandoff.clear('notesReturnCtx'); }, []);
  const [newNbInline, setNewNbInline] = React.useState(false);
  const [newNbName, setNewNbName] = React.useState('');
  const [renaming, setRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState('');
  // [11] notebook color-tag swatch row (drilled header's Color action).
  const [colorPicking, setColorPicking] = React.useState(false);
  const [confirmDeleteNb, setConfirmDeleteNb] = React.useState(false);
  const [allNotesSort, setAllNotesSort] = React.useState('newest'); // 'newest' | 'oldest'
  const [drilledSort, setDrilledSort] = React.useState('newest');
  // One shared query filters the All Notes tab AND any drilled notebook —
  // the box is visible in both views, so the carried-over filter is never
  // hidden state. The Notebooks card grid has no box (cards aren't notes).
  const [searchQuery, setSearchQuery] = React.useState('');

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

  // ONE navigation path for both the whole-row tap and a per-segment tap on the
  // source line — same pendingOpenNote stash, same notesReturnCtx, same pill
  // title; only the endpoint differs.
  const navToSource = (note, nav) => {
    window.navHandoff.set('pendingOpenNote', note.groupId);
    // Remember which tab/notebook we're in so the back-pill returns the
    // user to the exact list they tapped from (consumed on next mount).
    window.navHandoff.set('notesReturnCtx', { tab: tab, drilledNbId: drilledNbId });
    onNavigateToSource(nav, { sourceLetterTitle: currentSourceTitle() });
  };

  const onRowTap = (note) => {
    const nav = noteSourceNav(note);
    if (nav) navToSource(note, nav);
    else onOpenNote(note.groupId);
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

  const drilledNotesShown = React.useMemo(() => filterNotesByQuery(drilledNotes, searchQuery), [drilledNotes, searchQuery]);
  const allNotesShown = React.useMemo(() => filterNotesByQuery(allNotesSorted, searchQuery), [allNotesSorted, searchQuery]);

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

  // "Share as text" — compose the visible list as a markdown document and
  // hand it to the platform share/save path (notes-export.js owns the
  // format; noteSourceLabel resolves each note's source the same way the
  // rows render it, degrading to the raw slug when a title can't resolve).
  const exportNotes = (title, list) => {
    shareNotesExport({
      title,
      filename: notesExportFilename(title),
      text: composeNotesExport({ title, notes: list, resolveLabel: noteSourceLabel }),
    });
  };

  // ── Hierarchical back: a drilled-in notebook is its own navigation level ──
  // Unwind it to the Notebooks list before Back leaves the screen, so no level
  // is skipped. popDrill is the single source of that transition — used by the
  // nav-bar back arrow, the in-content ‹ button, AND the global back router
  // (Android hardware back / web Escape), which calls window.__screenBack.
  const popDrill = () => { setDrilledNbId(null); setRenaming(false); setConfirmDeleteNb(false); setColorPicking(false); };
  const handleNavBack = () => { if (drilledNbId) { popDrill(); } else { onBack(); } };
  React.useEffect(() => {
    // Register the screen-back interceptor only while drilled in. When not
    // drilled, no interceptor → the global router falls through to its normal
    // notes-index → origin route. See use-android-back.js §(1b).
    if (!drilledNbId) return undefined;
    const fn = () => { setDrilledNbId(null); setRenaming(false); setConfirmDeleteNb(false); setColorPicking(false); return true; };
    window.__screenBack = fn;
    return () => { if (window.__screenBack === fn) window.__screenBack = null; };
  }, [drilledNbId]);

  return (
    <ScreenLayout navChildren={LibraryNav({ onBack: handleNavBack, onSearch: onSearch, onHistory: onHistory, onSettings: onSettings, theme: theme, onThemeChange: onThemeChange })}>
      <div className="notes-index-screen">
        {backPill && (
          <div className="back-hint-row">
            <button
              className="back-hint-pill"
              onClick={() => { setBackPill(null); onBack(); }}
              aria-label={'Back to ' + backPill.title}
            >
              <span className="back-hint-arrow">‹</span>Back to{' '}
              <span className="back-hint-title">{backPill.title}</span>
            </button>
          </div>
        )}
        {/* Top-level header only. While drilled, the notebook's own name IS
            the screen title (.nb-drilled-title below) — rendering both stacked
            two headers on top of each other. */}
        {!drilledNbId && (
          <div className="notes-index-header">
            <h1 className="notes-index-title">My Notes</h1>
            <span className="notes-index-count">{allNotes.length}{allNotes.length === 1 ? " note" : " notes"}</span>
          </div>
        )}
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
            {/* Two rows: the name owns the title row (with the back chevron and
                a right-aligned count), the actions sit below it. One flex row
                for all of it made the name the only shrinkable item, so at a
                large --font-scale the buttons crushed it to an ellipsis. */}
            <div className="nb-drilled-header">
              <div className="nb-drilled-titlerow">
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
                  : <>
                      <h1 className="nb-drilled-title">{drilledTitle}</h1>
                      <span className="nb-drilled-count">{drilledNotes.length}{drilledNotes.length === 1 ? " note" : " notes"}</span>
                    </>
                }
              </div>
              {/* Rename mode: explicit Save / Cancel. Otherwise (user notebooks
                  only, not Uncategorized): Rename / Delete. */}
              <div className="nb-drilled-actions">
                {renaming
                  ? <>
                      <button className="nb-drilled-action" onClick={commitRename} title="Save name">Save</button>
                      <button className="nb-drilled-action" onClick={() => setRenaming(false)} title="Cancel rename">Cancel</button>
                    </>
                  : <>
                      {drilledNotes.length > 0 && (
                        <button className="nb-drilled-action" onClick={() => exportNotes(drilledTitle, drilledNotes)} title="Share notebook as text">Share</button>
                      )}
                      {drilledNb && <>
                        <button className="nb-drilled-action" onClick={startRename} title="Rename notebook">Rename</button>
                        <button className="nb-drilled-action" onClick={() => setColorPicking(v => !v)} title="Color tag">Color</button>
                        <button className="nb-drilled-action danger" onClick={() => setConfirmDeleteNb(true)} title="Delete notebook">Delete</button>
                      </>}
                    </>
                }
              </div>
            </div>
            {/* [11] color-tag picker — the HL_COLORS swatches + a gold
                "default" swatch that clears the tag. */}
            {colorPicking && drilledNb && (
              <div className="nb-color-row" role="radiogroup" aria-label="Notebook color">
                <button
                  className={'nb-color-swatch default' + (!drilledNb.color ? ' selected' : '')}
                  style={{ background: 'var(--gold)' }}
                  aria-label="Default gold"
                  onClick={() => { NotebookStore.setColor(drilledNb.id, null); setColorPicking(false); }}
                />
                {(typeof HL_COLORS !== 'undefined' ? HL_COLORS : []).map(c => (
                  <button
                    key={c}
                    className={'nb-color-swatch' + (drilledNb.color === c ? ' selected' : '')}
                    style={{ background: 'var(--hl-' + c + ')' }}
                    aria-label={c}
                    onClick={() => { NotebookStore.setColor(drilledNb.id, c); setColorPicking(false); }}
                  />
                ))}
              </div>
            )}
            {confirmDeleteNb && (
              <ConfirmStrip
                style={{ marginBottom: '0.8rem' }}
                question={`Delete “${drilledTitle}”? Notes will move to Uncategorized.`}
                onCancel={() => setConfirmDeleteNb(false)}
                onConfirm={deleteCurrent}
              />
            )}
            <input
              className="notes-index-search"
              type="search"
              placeholder="Search notes…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
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
              : drilledNotesShown.length === 0
                ? (
                    <div className="notes-empty">
                      <div className="notes-empty-title">No Matches</div>
                      <div className="notes-empty-hint">Try a different search term.</div>
                    </div>
                  )
                : (
                    <div className="notes-index-list">
                      {drilledNotesShown.map(note => <NoteRow key={note.groupId} note={note} onTap={onRowTap} onTapSegment={navToSource} hideNotebookId={drilledNbId} />)}
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
                <span className="nb-card-name">
                  {/* [11] color-tag dot — absent color renders gold. */}
                  <span className="nb-card-dot" style={{ background: nb.color ? 'var(--hl-' + nb.color + ')' : 'var(--gold)' }} />
                  {nb.name}
                </span>
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
            <input
              className="notes-index-search"
              type="search"
              placeholder="Search notes…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {allNotes.length > 0 && (
              <div className="notes-index-controls">
                <button
                  className="notes-index-sort-btn"
                  onClick={() => exportNotes('My Notes', allNotesSorted)}
                  title="Share all notes as text"
                >Share as Text</button>
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
              : allNotesShown.length === 0
                ? (
                    <div className="notes-empty">
                      <div className="notes-empty-title">No Matches</div>
                      <div className="notes-empty-hint">Try a different search term.</div>
                    </div>
                  )
                : (
                    <div className="notes-index-list">
                      {allNotesShown.map(note => <NoteRow key={note.groupId} note={note} onTap={onRowTap} onTapSegment={navToSource} />)}
                    </div>
                  )
            }
          </>
        )}
      </div>
    </ScreenLayout>
  );
}
