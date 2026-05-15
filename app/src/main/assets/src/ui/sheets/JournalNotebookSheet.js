/* ═══════════════════════════════════════════════════════════════
   JOURNAL NOTEBOOK SHEET — assign/manage notebooks for an entry
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Depends on: React, JournalStore, JournalNotebookStore.

   Mirrors the NotebookPickerSheet UX exactly (same look + feel) but
   operates on the journal's parallel JournalNotebookStore.

   Props:
     entryId               — which journal entry's membership we're editing
     memberIds (Set|Array) — current notebook ids the entry belongs to
     onClose()
     onChanged(memberIds)  — called after each toggle/create with the new Set
═══════════════════════════════════════════════════════════════ */

function JournalNotebookSheet({ entryId, memberIds, onClose, onChanged }) {
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  var initial = new Set(memberIds instanceof Set ? Array.from(memberIds) : (memberIds || []));
  var _members = useState(initial);
  var members = _members[0];
  var setMembers = _members[1];

  var _notebooks = useState(JournalNotebookStore.list());
  var notebooks = _notebooks[0];
  var setNotebooks = _notebooks[1];

  var _newName = useState('');
  var newName = _newName[0];
  var setNewName = _newName[1];

  var _confirmDelete = useState(null);
  var confirmDelete = _confirmDelete[0];
  var setConfirmDelete = _confirmDelete[1];

  var inputRef = useRef(null);

  useEffect(function() {
    setTimeout(function() { if (inputRef.current) inputRef.current.focus(); }, 60);
  }, []);

  function reload() {
    setNotebooks(JournalNotebookStore.list());
  }

  function toggle(nbId) {
    var next = new Set(Array.from(members));
    if (next.has(nbId)) next.delete(nbId); else next.add(nbId);
    setMembers(next);
    if (entryId && typeof JournalStore !== 'undefined') {
      JournalStore.update(entryId, { notebookIds: Array.from(next) });
    }
    if (onChanged) onChanged(next);
  }

  function createNotebook() {
    var trimmed = newName.trim();
    if (!trimmed) return;
    var nb = JournalNotebookStore.add(trimmed);
    if (!nb) return;
    setNewName('');
    reload();
    // Auto-add the current entry to the new notebook
    if (entryId) {
      var next = new Set(Array.from(members));
      next.add(nb.id);
      setMembers(next);
      JournalStore.update(entryId, { notebookIds: Array.from(next) });
      if (onChanged) onChanged(next);
    }
  }

  function deleteNb(nbId) {
    JournalNotebookStore.remove(nbId);
    var next = new Set(Array.from(members));
    next.delete(nbId);
    setMembers(next);
    if (entryId) JournalStore.update(entryId, { notebookIds: Array.from(next) });
    if (onChanged) onChanged(next);
    setConfirmDelete(null);
    reload();
  }

  return React.createElement('div', { className: 'nb-picker-overlay', onClick: onClose },
    React.createElement('div', { className: 'nb-picker', onClick: function(e) { e.stopPropagation(); } },
      React.createElement('div', { className: 'nb-picker-header' },
        React.createElement('span', { className: 'nb-picker-title' }, members.size > 0 ? 'Manage Notebooks' : 'Add to Notebook'),
        React.createElement('button', { className: 'nb-picker-close', onClick: onClose, 'aria-label': 'Close' }, '×')
      ),
      React.createElement('div', { className: 'nb-picker-new' },
        React.createElement('input', {
          ref: inputRef,
          className: 'nb-picker-new-input',
          type: 'text',
          placeholder: 'New notebook name…',
          value: newName,
          onChange: function(e) { setNewName(e.target.value); },
          onKeyDown: function(e) { if (e.key === 'Enter') { e.preventDefault(); createNotebook(); } },
          maxLength: 60
        }),
        React.createElement('button', {
          className: 'nb-picker-new-btn' + (newName.trim() ? '' : ' disabled'),
          onClick: createNotebook,
          disabled: !newName.trim()
        }, 'Create')
      ),
      notebooks.length === 0
        ? React.createElement('div', { className: 'nb-picker-empty' }, 'No notebooks yet. Type a name above to create your first one.')
        : React.createElement('div', { className: 'nb-picker-list' },
            notebooks.map(function(nb) {
              if (confirmDelete === nb.id) {
                return React.createElement('div', { key: nb.id, className: 'ann-chip-confirm', style: { padding: '10px 12px' } },
                  React.createElement('span', { className: 'ann-chip-confirm-q' }, 'Delete "', nb.name, '"? Entries will move to Uncategorized.'),
                  React.createElement('button', { className: 'ann-chip-confirm-btn ann-chip-confirm-cancel', onClick: function() { setConfirmDelete(null); } }, 'Cancel'),
                  React.createElement('button', { className: 'ann-chip-confirm-btn ann-chip-confirm-yes', onClick: function() { deleteNb(nb.id); } }, 'Yes, delete')
                );
              }
              var checked = members.has(nb.id);
              return React.createElement('div', {
                key: nb.id,
                className: 'nb-picker-row' + (checked ? ' checked' : ''),
                onClick: function() { toggle(nb.id); },
                role: 'button'
              },
                React.createElement('span', { className: 'nb-picker-check' },
                  checked && React.createElement('svg', { viewBox: '0 0 24 24' },
                    React.createElement('polyline', { points: '20 6 9 17 4 12' })
                  )
                ),
                React.createElement('span', { className: 'nb-picker-row-name' }, nb.name),
                React.createElement('button', {
                  className: 'nb-picker-row-delete',
                  onClick: function(e) { e.stopPropagation(); setConfirmDelete(nb.id); },
                  'aria-label': 'Delete notebook'
                }, '×')
              );
            })
          )
    )
  );
}
