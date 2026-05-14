function NotesIndexScreen({ onBack, onOpenNote, onNavigateToSource, hlTick, setHlTick, theme, onThemeChange, onSearch, onHistory, historyEnabled }) {
  const allNotes = useMemo(() => NoteStore.list(), [hlTick]);
  const notebooks = useMemo(() => NotebookStore.list(), [hlTick]);
  const [tab, setTab] = useState('notebooks'); // 'notebooks' | 'all-notes'
  const [drilledNbId, setDrilledNbId] = useState(null); // null | 'uncategorized' | <notebookId>
  const [newNbInline, setNewNbInline] = useState(false);
  const [newNbName, setNewNbName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteNb, setConfirmDeleteNb] = useState(false);
  const [allNotesSort, setAllNotesSort] = useState('newest'); // 'newest' | 'oldest'
  const [drilledSort, setDrilledSort] = useState('newest');

  const onRowTap = (note) => {
    const nav = noteSourceNav(note);
    if (nav) {
      window.__pendingOpenNote = note.groupId;
      onNavigateToSource(nav);
    } else {
      onOpenNote(note.groupId);
    }
  };

  const counts = useMemo(() => {
    const c = { __uncategorized: 0 };
    notebooks.forEach(nb => { c[nb.id] = 0; });
    allNotes.forEach(n => {
      const ids = n.notebookIds || [];
      if (ids.length === 0) c.__uncategorized++;
      else ids.forEach(id => { if (id in c) c[id]++; });
    });
    return c;
  }, [allNotes, notebooks]);

  const sortList = (list, mode) => {
    const arr = [...list];
    arr.sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0));
    if (mode === 'oldest') arr.reverse();
    return arr;
  };

  const drilledNotes = useMemo(() => {
    if (!drilledNbId) return [];
    let list;
    if (drilledNbId === 'uncategorized') {
      list = allNotes.filter(n => !n.notebookIds || n.notebookIds.length === 0);
    } else {
      list = allNotes.filter(n => (n.notebookIds || []).includes(drilledNbId));
    }
    return sortList(list, drilledSort);
  }, [allNotes, drilledNbId, drilledSort]);

  const allNotesSorted = useMemo(() => sortList(allNotes, allNotesSort), [allNotes, allNotesSort]);

  const createNotebook = () => {
    const trimmed = newNbName.trim();
    if (!trimmed) return;
    NotebookStore.add(trimmed);
    setHlTick(t => t + 1);
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
      setHlTick(t => t + 1);
    }
    setRenaming(false);
  };
  const deleteCurrent = () => {
    if (!drilledNb) return;
    NotebookStore.remove(drilledNb.id);
    setHlTick(t => t + 1);
    setConfirmDeleteNb(false);
    setDrilledNbId(null);
  };

  return React.createElement(ScreenLayout, {
    navChildren: React.createElement(React.Fragment, null,
      React.createElement("button", { className: "nav-home nav-back-icon", onClick: onBack, title: "Back", "aria-label": "Back" }, "‹"),
      React.createElement("button", { className: "nav-search-btn", onClick: onSearch, title: "Search" },
        React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" },
          React.createElement("circle", { cx: "11", cy: "11", r: "8" }),
          React.createElement("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })
        )
      ),
      historyEnabled !== false && React.createElement("button", { className: "nav-search-btn", onClick: onHistory, title: "History" },
        React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("circle", { cx: "12", cy: "12", r: "9" }),
          React.createElement("polyline", { points: "12 7 12 12 15 15" })
        )
      ),
      React.createElement(ThemeBtn, { theme: theme, onThemeChange: onThemeChange })
    )
  },
    React.createElement("div", { className: "notes-index-screen" },
      React.createElement("div", { className: "notes-index-header" },
        React.createElement("h1", { className: "notes-index-title" }, "My Notes"),
        React.createElement("span", { className: "notes-index-count" }, allNotes.length, allNotes.length === 1 ? " note" : " notes")
      ),
      !drilledNbId && React.createElement("div", { className: "notes-tabs" },
        React.createElement("button", {
          className: "notes-tab" + (tab === 'notebooks' ? ' active' : ''),
          onClick: () => setTab('notebooks')
        }, "Notebooks"),
        React.createElement("button", {
          className: "notes-tab" + (tab === 'all-notes' ? ' active' : ''),
          onClick: () => setTab('all-notes')
        }, "All Notes")
      ),
      drilledNbId && React.createElement(React.Fragment, null,
        React.createElement("div", { className: "nb-drilled-header" },
          React.createElement("button", { className: "nb-drilled-back", onClick: () => { setDrilledNbId(null); setRenaming(false); setConfirmDeleteNb(false); }, title: "Back to Notebooks", "aria-label": "Back to Notebooks" }, "‹"),
          renaming
            ? React.createElement("input", {
                className: "nb-drilled-rename",
                autoFocus: true, type: "text", value: renameValue,
                onChange: e => setRenameValue(e.target.value),
                onKeyDown: e => { if (e.key === 'Enter') { e.preventDefault(); commitRename(); } else if (e.key === 'Escape') setRenaming(false); },
                onBlur: commitRename, maxLength: 60
              })
            : React.createElement("span", { className: "nb-drilled-title" }, drilledTitle),
          drilledNb && !renaming && React.createElement(React.Fragment, null,
            React.createElement("button", { className: "nb-drilled-action", onClick: startRename, title: "Rename notebook" }, "Rename"),
            React.createElement("button", { className: "nb-drilled-action danger", onClick: () => setConfirmDeleteNb(true), title: "Delete notebook" }, "Delete")
          )
        ),
        confirmDeleteNb && React.createElement("div", { className: "ann-chip-confirm", style: { padding: '10px 12px', marginBottom: '0.8rem' } },
          React.createElement("span", { className: "ann-chip-confirm-q" }, "Delete “", drilledTitle, "”? Notes will move to Uncategorized."),
          React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-cancel", onClick: () => setConfirmDeleteNb(false) }, "Cancel"),
          React.createElement("button", { className: "ann-chip-confirm-btn ann-chip-confirm-yes", onClick: deleteCurrent }, "Yes, delete")
        ),
        drilledNotes.length > 0 && React.createElement("div", { className: "notes-index-controls" },
          React.createElement("button", {
            className: "notes-index-sort-btn",
            onClick: () => setDrilledSort(s => s === 'newest' ? 'oldest' : 'newest'),
            style: { marginLeft: 'auto' }, title: "Toggle sort order"
          }, drilledSort === 'newest' ? "Newest first ↓" : "Oldest first ↑")
        ),
        drilledNotes.length === 0
          ? React.createElement("div", { className: "notes-empty" },
              React.createElement("div", { className: "notes-empty-title" }, "Nothing here yet"),
              React.createElement("div", { className: "notes-empty-hint" },
                drilledNbId === 'uncategorized'
                  ? "Notes that aren't in any notebook will appear here."
                  : "Add notes to this notebook from the ⋯ menu on any note."
              )
            )
          : React.createElement("div", { className: "notes-index-list" },
              drilledNotes.map(note => React.createElement(NoteRow, { key: note.groupId, note, onTap: onRowTap }))
            )
      ),
      !drilledNbId && tab === 'notebooks' && React.createElement("div", { className: "nb-card-grid" },
        React.createElement("button", {
          className: "nb-card uncategorized",
          onClick: () => setDrilledNbId('uncategorized')
        },
          React.createElement("span", { className: "nb-card-eyebrow" }, "Default"),
          React.createElement("span", { className: "nb-card-name" }, "Uncategorized"),
          React.createElement("span", { className: "nb-card-count" }, counts.__uncategorized, counts.__uncategorized === 1 ? " note" : " notes"),
          React.createElement("span", { className: "nb-card-arrow" }, "›")
        ),
        notebooks.map(nb => React.createElement("button", {
          key: nb.id,
          className: "nb-card",
          onClick: () => setDrilledNbId(nb.id)
        },
          React.createElement("span", { className: "nb-card-eyebrow" }, "Notebook"),
          React.createElement("span", { className: "nb-card-name" }, nb.name),
          React.createElement("span", { className: "nb-card-count" }, (counts[nb.id] || 0), (counts[nb.id] || 0) === 1 ? " note" : " notes"),
          React.createElement("span", { className: "nb-card-arrow" }, "›")
        )),
        newNbInline
          ? React.createElement("div", { className: "nb-card", style: { cursor: 'default' } },
              React.createElement("div", { className: "nb-card-create-form" },
                React.createElement("input", {
                  className: "nb-card-create-input",
                  autoFocus: true, type: "text",
                  placeholder: "Notebook name…",
                  value: newNbName,
                  onChange: e => setNewNbName(e.target.value),
                  onKeyDown: e => { if (e.key === 'Enter') { e.preventDefault(); createNotebook(); } else if (e.key === 'Escape') { setNewNbInline(false); setNewNbName(''); } },
                  maxLength: 60
                }),
                React.createElement("div", { className: "nb-card-create-actions" },
                  React.createElement("button", { className: "note-sheet-secondary", onClick: () => { setNewNbInline(false); setNewNbName(''); }, style: { padding: '7px 10px' } }, "Cancel"),
                  React.createElement("button", { className: "note-sheet-save" + (newNbName.trim() ? '' : ' disabled'), onClick: createNotebook, disabled: !newNbName.trim(), style: { padding: '7px 10px' } }, "Create")
                )
              )
            )
          : React.createElement("button", {
              className: "nb-card new-notebook",
              onClick: () => setNewNbInline(true)
            },
              React.createElement("span", { className: "nb-card-plus" }, "+"),
              React.createElement("span", { className: "nb-card-name" }, "New Notebook")
            )
      ),
      !drilledNbId && tab === 'all-notes' && React.createElement(React.Fragment, null,
        allNotes.length > 0 && React.createElement("div", { className: "notes-index-controls" },
          React.createElement("button", {
            className: "notes-index-sort-btn",
            onClick: () => setAllNotesSort(s => s === 'newest' ? 'oldest' : 'newest'),
            style: { marginLeft: 'auto' }, title: "Toggle sort order"
          }, allNotesSort === 'newest' ? "Newest first ↓" : "Oldest first ↑")
        ),
        allNotes.length === 0
          ? React.createElement("div", { className: "notes-empty" },
              React.createElement("div", { className: "notes-empty-title" }, "No Notes Yet"),
              React.createElement("div", { className: "notes-empty-hint" }, "Long-press text in any chapter, tap Note in the toolbar, and your notes will appear here.")
            )
          : React.createElement("div", { className: "notes-index-list" },
              allNotesSorted.map(note => React.createElement(NoteRow, { key: note.groupId, note, onTap: onRowTap }))
            )
      )
    )
  );
}
