/* ═══════════════════════════════════════════════════════════════
   JOURNAL INSERT SHEET — block + inline insertion menu
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Depends on: React, JournalHelpers, JournalMediaStore,
     searchNavIndex, navItemToEndpoint, COL_NAV_ICON, BookmarkStore,
     NoteStore, JournalStore.

   The sheet has multiple "modes":
     'menu'         — the main 4-section list of insertable types
     'pick-letter'  — library search picker (letters + chapters + verses)
     'pick-bookmark'— flat list of the user's bookmarks
     'pick-note'    — flat list of the user's notes
     'pick-journal' — flat list of OTHER journal entries to link
     'verse-input'  — text input for a scripture ref

   Props:
     onClose()
     onInsertBlock(block)      — appends to caller's block list
     onInsertImage()           — caller handles the file picker
     onRecordAudio()           — caller opens the recording sheet
     onInsertInline(token)     — inserts at caller's caret in the active textarea
     excludeJournalId          — current entry id, to omit from journal-pick
═══════════════════════════════════════════════════════════════ */

function JournalInsertSheet({ onClose, onInsertBlock, onInsertImage, onRecordAudio, onInsertInline, excludeJournalId }) {
  var useState = React.useState;
  var useRef = React.useRef;

  var _mode = useState('menu');
  var mode = _mode[0];
  var setMode = _mode[1];

  var _query = useState('');
  var query = _query[0];
  var setQuery = _query[1];

  var _verseRef = useState('');
  var verseRef = _verseRef[0];
  var setVerseRef = _verseRef[1];

  function close() { onClose && onClose(); }

  function emitBlock(block) {
    onInsertBlock && onInsertBlock(block);
    close();
  }

  // Insertion handlers per block type
  function insertHeading() { emitBlock(JournalHelpers.newBlock('h2', { text: '' })); }
  function insertQuote()   { emitBlock(JournalHelpers.newBlock('quote', { text: '', cite: '' })); }
  function insertDivider() { emitBlock(JournalHelpers.newBlock('divider')); }

  function pickLetter() { setMode('pick-letter'); setQuery(''); }
  function pickBookmark() { setMode('pick-bookmark'); }
  function pickNote() { setMode('pick-note'); }
  function pickJournal() { setMode('pick-journal'); }
  function pickVerseRef() { setMode('verse-input'); setVerseRef(''); }

  function pickImage() { close(); onInsertImage && onInsertImage(); }
  function pickAudio() { close(); onRecordAudio && onRecordAudio(); }

  function insertInlineRef() {
    close();
    onInsertInline && onInsertInline('{{ref:Book X:Y}}');
  }

  // Library nav search → letter/chapter cards
  function libraryResults() {
    if (typeof searchNavIndex !== 'function') return [];
    return searchNavIndex(query.trim(), 30);
  }
  function chooseNavItem(item) {
    if (!item) return;
    var k = item.kind;

    // Letter-shaped: nav index uses kind 'letter' | 'wtlb' | 'blessed' |
    // 'holy-days', with `letterId` (NOT id) and `collection` (COL.label).
    if (k === 'letter' || k === 'wtlb' || k === 'blessed' || k === 'holy-days') {
      var volKey = item.volKey;
      if (!volKey && item.collection && typeof COLLECTIONS !== 'undefined') {
        for (var i = 0; i < COLLECTIONS.length; i++) {
          if (COLLECTIONS[i].label === item.collection) { volKey = COLLECTIONS[i].volKey; break; }
        }
      }
      var letterId = item.letterId || item.id || item.entryId;
      if (volKey && letterId) {
        emitBlock(JournalHelpers.newBlock('letter-card', { volKey: volKey, letterId: letterId }));
        return;
      }
    }

    // Bible chapter (kind 'bible-chapter' from nav index)
    if (k === 'bible-chapter' || k === 'bible') {
      if (item.verse != null && item.verse !== '' && item.verse !== 0) {
        var bookName = item.title || item.bookId;
        var refStr = bookName + ' ' + item.chapter + ':' + item.verse + (item.verseEnd ? ('-' + item.verseEnd) : '');
        emitBlock(JournalHelpers.newBlock('verse-block', { ref: refStr }));
      } else if (item.bookId != null && item.chapter != null) {
        emitBlock(JournalHelpers.newBlock('chapter-card', { bookId: item.bookId, chapter: item.chapter }));
      }
      return;
    }

    // Matthew Study Bible chapter
    if (k === 'study-chapter' || k === 'matthew' || k === 'study') {
      if (item.bookId && item.chapter != null) {
        emitBlock(JournalHelpers.newBlock('chapter-card', { bookId: item.bookId, chapter: item.chapter }));
      }
      return;
    }
  }

  function chooseBookmark(b) {
    emitBlock(JournalHelpers.newBlock('bookmark-card', { bookmarkId: b.id }));
  }
  function chooseNote(n) {
    emitBlock(JournalHelpers.newBlock('note-card', { noteGroupId: n.groupId }));
  }
  function chooseJournal(e) {
    emitBlock(JournalHelpers.newBlock('journal-card', { entryId: e.id }));
  }
  function submitVerseRef() {
    var v = (verseRef || '').trim();
    if (!v) return;
    emitBlock(JournalHelpers.newBlock('verse-block', { ref: v }));
  }

  function renderMenu() {
    return React.createElement(React.Fragment, null,
      // Text section
      React.createElement('div', { className: 'jrn-insert-section' },
        React.createElement('h4', null, 'Text'),
        React.createElement('div', { className: 'jrn-insert-list' },
          insertItem('H', 'Heading', 'Section title (H2)', insertHeading),
          insertItem('"', 'Block Quote', 'Quoted passage with citation', insertQuote),
          insertItem('❖', 'Divider', '3-diamond ornament', insertDivider)
        )
      ),
      // From your library
      React.createElement('div', { className: 'jrn-insert-section' },
        React.createElement('h4', null, 'From Your Library'),
        React.createElement('div', { className: 'jrn-insert-list' },
          insertItem('L', 'Letter or chapter card', 'Embed a card from any collection', pickLetter),
          insertItem('B', 'Bookmark', 'Pull in a saved passage', pickBookmark),
          insertItem('N', 'Note', 'Reference one of your annotations', pickNote),
          insertItem('V', 'Scripture verse', 'Insert a full verse block', pickVerseRef),
          insertItem('J', 'Link to journal entry', 'Connect to another entry', pickJournal)
        )
      ),
      // Capture
      React.createElement('div', { className: 'jrn-insert-section' },
        React.createElement('h4', null, 'Capture'),
        React.createElement('div', { className: 'jrn-insert-list' },
          insertItem('I', 'Image', 'From device gallery', pickImage),
          insertItem('A', 'Voice recording', 'Record a memo or prayer', pickAudio)
        )
      ),
      // Inline
      onInsertInline && React.createElement('div', { className: 'jrn-insert-section', style: { paddingBottom: '20px' } },
        React.createElement('h4', null, 'Inline'),
        React.createElement('div', { className: 'jrn-insert-list' },
          insertItem('{}', 'Scripture reference', 'Tappable inline citation', insertInlineRef)
        )
      )
    );
  }

  function insertItem(iconText, label, desc, onClick) {
    return React.createElement('button', { type: 'button', className: 'jrn-insert-item', onClick: onClick },
      React.createElement('span', { className: 'jrn-insert-icon' }, iconText),
      React.createElement('span', { className: 'jrn-insert-text' },
        React.createElement('span', { className: 'jrn-insert-label' }, label),
        React.createElement('span', { className: 'jrn-insert-desc' }, desc)
      )
    );
  }

  function renderPickerSearch(placeholder) {
    return React.createElement('div', { style: { padding: '12px 16px' } },
      React.createElement('input', {
        autoFocus: true,
        className: 'jrn-search',
        type: 'text',
        placeholder: placeholder,
        value: query,
        onChange: function(e) { setQuery(e.target.value); }
      })
    );
  }

  function renderLibraryPicker() {
    var results = libraryResults();
    return React.createElement(React.Fragment, null,
      renderPickerSearch('Letter, chapter, or "Eph 6:5"…'),
      React.createElement('div', { className: 'jrn-picker-results' },
        results.length === 0
          ? React.createElement('div', { style: { fontStyle: 'italic', color: 'var(--cream-dim)', padding: '20px', textAlign: 'center', fontFamily: 'EB Garamond, serif' } }, query.trim() ? 'No matches.' : 'Start typing to search.')
          : results.map(function(r, i) {
              var item = r.item || r;
              var icon = '?';
              if (item.collection && typeof COL_NAV_ICON !== 'undefined') {
                icon = COL_NAV_ICON.get(item.collection) || '?';
              } else if (item.kind === 'bible') icon = 'OT';
              else if (item.kind === 'matthew') icon = 'MT';
              return React.createElement('button', { key: i, type: 'button', className: 'jrn-picker-item', onClick: function() { chooseNavItem(item); } },
                React.createElement('span', { className: 'jrn-picker-spine' }, icon),
                React.createElement('span', { className: 'jrn-picker-text' },
                  React.createElement('span', { className: 'jrn-picker-label' }, item.label),
                  React.createElement('span', { className: 'jrn-picker-cat' }, item.category || '')
                )
              );
            })
      )
    );
  }

  function renderBookmarkPicker() {
    var bms = (typeof BookmarkStore !== 'undefined') ? BookmarkStore.all() : [];
    bms.sort(function(a, b) { return (b.updated || b.created || 0) - (a.updated || a.created || 0); });
    var sourceLabel = (typeof _bookmarkSourceLabel === 'function') ? _bookmarkSourceLabel : function() { return ''; };
    return React.createElement('div', { className: 'jrn-picker-results', style: { padding: '12px 14px 24px' } },
      bms.length === 0
        ? React.createElement('div', { style: { fontStyle: 'italic', color: 'var(--cream-dim)', padding: '20px', textAlign: 'center', fontFamily: 'EB Garamond, serif' } }, 'No bookmarks yet.')
        : bms.map(function(b) {
            return React.createElement('button', { key: b.id, type: 'button', className: 'jrn-picker-item', onClick: function() { chooseBookmark(b); } },
              React.createElement('span', { className: 'jrn-picker-spine' }, 'BK'),
              React.createElement('span', { className: 'jrn-picker-text' },
                React.createElement('span', { className: 'jrn-picker-label' }, b.label || 'Bookmark'),
                React.createElement('span', { className: 'jrn-picker-cat' }, sourceLabel(b.hlKey))
              )
            );
          })
    );
  }

  function renderNotePicker() {
    var notes = (typeof NoteStore !== 'undefined') ? NoteStore.all() : [];
    notes.sort(function(a, b) { return (b.updated || b.created || 0) - (a.updated || a.created || 0); });
    var noteLabel = (typeof noteSourceLabel === 'function') ? noteSourceLabel : function() { return ''; };
    return React.createElement('div', { className: 'jrn-picker-results', style: { padding: '12px 14px 24px' } },
      notes.length === 0
        ? React.createElement('div', { style: { fontStyle: 'italic', color: 'var(--cream-dim)', padding: '20px', textAlign: 'center', fontFamily: 'EB Garamond, serif' } }, 'No notes yet.')
        : notes.slice(0, 200).map(function(n) {
            var anchor = (n.fullText || '').substring(0, 80);
            var label = (n.body || '').substring(0, 60) || anchor || 'Note';
            return React.createElement('button', { key: n.groupId, type: 'button', className: 'jrn-picker-item', onClick: function() { chooseNote(n); } },
              React.createElement('span', { className: 'jrn-picker-spine' }, 'NT'),
              React.createElement('span', { className: 'jrn-picker-text' },
                React.createElement('span', { className: 'jrn-picker-label', style: { fontStyle: 'italic', textTransform: 'none', fontFamily: 'EB Garamond, serif' } }, label),
                React.createElement('span', { className: 'jrn-picker-cat' }, noteLabel(n))
              )
            );
          })
    );
  }

  function renderJournalPicker() {
    var entries = (typeof JournalStore !== 'undefined') ? JournalStore.all() : [];
    entries = entries.filter(function(e) { return e.id !== excludeJournalId; });
    return React.createElement('div', { className: 'jrn-picker-results', style: { padding: '12px 14px 24px' } },
      entries.length === 0
        ? React.createElement('div', { style: { fontStyle: 'italic', color: 'var(--cream-dim)', padding: '20px', textAlign: 'center', fontFamily: 'EB Garamond, serif' } }, 'No other journal entries yet.')
        : entries.map(function(e) {
            var title = JournalHelpers.entryDisplayTitle(e) || 'Untitled';
            var preview = JournalHelpers.previewText(e, 60);
            return React.createElement('button', { key: e.id, type: 'button', className: 'jrn-picker-item', onClick: function() { chooseJournal(e); } },
              React.createElement('span', { className: 'jrn-picker-spine' }, 'JR'),
              React.createElement('span', { className: 'jrn-picker-text' },
                React.createElement('span', { className: 'jrn-picker-label' }, title),
                React.createElement('span', { className: 'jrn-picker-cat' }, JournalHelpers.shortDate(e.created) + (preview ? ' · ' + preview : ''))
              )
            );
          })
    );
  }

  function renderVerseInput() {
    return React.createElement('div', { style: { padding: '14px 18px 24px' } },
      React.createElement('input', {
        autoFocus: true, className: 'jrn-search', type: 'text', placeholder: 'e.g. John 3:16',
        value: verseRef, onChange: function(e) { setVerseRef(e.target.value); },
        onKeyDown: function(e) { if (e.key === 'Enter') { e.preventDefault(); submitVerseRef(); } }
      }),
      React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' } },
        React.createElement('button', { className: 'jrn-rec-cancel', onClick: function() { setMode('menu'); } }, 'Cancel'),
        React.createElement('button', { className: 'jrn-rec-stop', onClick: submitVerseRef, disabled: !verseRef.trim() }, 'Insert')
      )
    );
  }

  function title() {
    if (mode === 'pick-letter') return 'Letter or Chapter';
    if (mode === 'pick-bookmark') return 'Pick Bookmark';
    if (mode === 'pick-note') return 'Pick Note';
    if (mode === 'pick-journal') return 'Link to Journal';
    if (mode === 'verse-input') return 'Scripture Verse';
    return 'Insert';
  }

  return React.createElement('div', { className: 'note-sheet-overlay', onClick: function(e) { if (e.target === e.currentTarget) close(); } },
    React.createElement('div', { className: 'note-sheet', onClick: function(e) { e.stopPropagation(); }, style: { maxWidth: '480px' } },
      React.createElement('div', { className: 'note-sheet-header' },
        mode !== 'menu' && React.createElement('button', { className: 'note-sheet-menu-btn', onClick: function() { setMode('menu'); }, 'aria-label': 'Back', style: { fontSize: '18px' } }, '‹'),
        React.createElement('span', { className: 'note-sheet-title', style: { flex: 1 } }, title()),
        React.createElement('button', { className: 'note-sheet-menu-btn', onClick: close, 'aria-label': 'Close', style: { fontSize: '18px' } }, '×')
      ),
      mode === 'menu' ? renderMenu() :
      mode === 'pick-letter' ? renderLibraryPicker() :
      mode === 'pick-bookmark' ? renderBookmarkPicker() :
      mode === 'pick-note' ? renderNotePicker() :
      mode === 'pick-journal' ? renderJournalPicker() :
      mode === 'verse-input' ? renderVerseInput() :
      renderMenu()
    )
  );
}
