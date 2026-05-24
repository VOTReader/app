/* ═══════════════════════════════════════════════════════════════════════
   JournalInsertSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function JournalInsertSheet(props) {
  var useState = React.useState;
  var useMemo = React.useMemo;

  var onClose = props.onClose;
  var onInsertBlock = props.onInsertBlock;
  var onInsertImage = props.onInsertImage;
  var onRecordAudio = props.onRecordAudio;
  var excludeJournalId = props.excludeJournalId;

  var _mode = useState('menu');
  var mode = _mode[0]; var setMode = _mode[1];

  var _q = useState('');
  var query = _q[0]; var setQuery = _q[1];

  // Journal block-picker state: which entry the user drilled into.
  var _drilled = useState(null);
  var drilledEntry = _drilled[0]; var setDrilledEntry = _drilled[1];

  function close() { try { onClose && onClose(); } catch (e) { /* helper may throw on malformed data; treat as missing */ } }

  function emitBlock(block) {
    if (!block) { close(); return; }
    try { onInsertBlock && onInsertBlock(block); }
    catch (e) { console.warn('JournalInsertSheet emitBlock failed', e); }
    close();
  }

  // ── Block constructors ────────────────────────────────────
  function insertDivider() { emitBlock(JournalHelpers.newBlock('divider')); }
  function insertBodyText() { emitBlock(JournalHelpers.newBlock('p', { text: '' })); }

  // ── Card / Excerpt via LinkPicker ────────────────────────
  function openCardPicker() {
    if (typeof window.__openLinkPickerForTarget !== 'function') {
      console.warn('LinkPicker bridge unavailable');
      return;
    }
    close();
    window.__openLinkPickerForTarget('card', function(target, item) {
      try {
        var block = targetToJournalBlock(target, item, false);
        if (block && onInsertBlock) onInsertBlock(block);
      } catch (e) { console.warn('Insert card failed', e); }
    });
  }
  function openExcerptPicker() {
    if (typeof window.__openLinkPickerForTarget !== 'function') {
      console.warn('LinkPicker bridge unavailable');
      return;
    }
    close();
    window.__openLinkPickerForTarget('excerpt', function(target, item) {
      try {
        var block = targetToJournalBlock(target, item, true);
        if (block && onInsertBlock) onInsertBlock(block);
      } catch (e) { console.warn('Insert excerpt failed', e); }
    });
  }

  function targetToJournalBlock(target, item, asExcerpt) {
    if (!target) return null;
    var t = target.type;
    if (t === 'bible' || t === 'study') {
      var hasText = !!(target.text && target.text.length);
      var hasVerse = target.verse != null;
      if (asExcerpt && hasText) {
        var ref = target.label || ((target.bookId || '') + ' ' + (target.chapter || '')
          + (hasVerse ? (':' + target.verse + (target.verseEnd ? '-' + target.verseEnd : '')) : ''));
        return JournalHelpers.newBlock('verse-block', {
          ref: ref,
          text: target.text,
          partial: !!target.partial,
          bookId: target.bookId,
          chapter: target.chapter,
          verse: target.verse || null,
          verseEnd: target.verseEnd || null,
          isStudy: t === 'study'
        });
      }
      if (target.bookId != null && target.chapter != null) {
        return JournalHelpers.newBlock('chapter-card', {
          bookId: target.bookId,
          chapter: target.chapter,
          isStudy: t === 'study'
        });
      }
      return null;
    }
    if (t === 'letter' || t === 'wtlb' || t === 'blessed' || t === 'holy-days' || t === 'study-letter') {
      var letterId = target.letterId || target.entryId || target.studyChapterId;
      var volKey = target.volKey;
      if (!volKey && target.collection && typeof COLLECTIONS !== 'undefined') {
        for (var i = 0; i < COLLECTIONS.length; i++) {
          if (COLLECTIONS[i].label === target.collection) { volKey = COLLECTIONS[i].volKey; break; }
        }
      }
      if (!volKey && item && item.collection && typeof COLLECTIONS !== 'undefined') {
        for (var j = 0; j < COLLECTIONS.length; j++) {
          if (COLLECTIONS[j].label === item.collection) { volKey = COLLECTIONS[j].volKey; break; }
        }
      }
      var extra = { volKey: volKey, letterId: letterId };
      if (t === 'study-letter') {
        extra.studyId = target.studyId;
        extra.studyChapterId = target.studyChapterId || letterId;
      }
      if (asExcerpt && target.text) {
        extra.excerpt = target.text;
        extra.blockKey = target.blockKey || null;
        extra.start = target.start != null ? target.start : null;
        extra.end = target.end != null ? target.end : null;
      }
      if (!volKey || !letterId) return null;
      return JournalHelpers.newBlock('letter-card', extra);
    }
    return null;
  }

  function pickBookmark() { setQuery(''); setMode('pick-bookmark'); }
  function pickNote() { setQuery(''); setMode('pick-note'); }
  function pickJournal() { setQuery(''); setMode('pick-journal'); }
  function pickNotebook() { setQuery(''); setMode('pick-notebook'); }

  function chooseNotebook(nbId) {
    if (!nbId) { close(); return; }
    emitBlock(JournalHelpers.newBlock('notebook-card', { notebookId: nbId }));
  }

  function pickImage() { close(); try { onInsertImage && onInsertImage(); } catch (e) { console.warn('pickImage failed', e); } }
  function pickAudio() { close(); try { onRecordAudio && onRecordAudio(); } catch (e) { console.warn('pickAudio failed', e); } }

  function chooseBookmark(b) {
    if (!b || !b.id) { close(); return; }
    emitBlock(JournalHelpers.newBlock('bookmark-card', { bookmarkId: b.id }));
  }
  function chooseNote(n) {
    if (!n || !n.groupId) { close(); return; }
    emitBlock(JournalHelpers.newBlock('note-card', { noteGroupId: n.groupId }));
  }
  function chooseJournal(e) {
    if (!e || !e.id) { close(); return; }
    setQuery('');
    setDrilledEntry(e);
    setMode('pick-journal-block');
  }

  function chooseWholeEntry(e) {
    if (!e || !e.id) { close(); return; }
    emitBlock(JournalHelpers.newBlock('journal-card', { entryId: e.id }));
  }

  function chooseEntryBlock(sourceEntry, block) {
    if (!sourceEntry || !block) { close(); return; }
    var embedded = JournalHelpers.embedBlockFromJournal(sourceEntry, block);
    if (embedded) emitBlock(embedded);
    else close();
  }

  // ── Menu icons (SVG icons for visual polish) ──────────────
  var ICONS = {
    card: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <line x1="7" y1="10" x2="17" y2="10" />
        <line x1="7" y1="14" x2="13" y2="14" />
      </svg>
    ),
    excerpt: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9h.01M6 15h.01" />
        <line x1="10" y1="8" x2="20" y2="8" />
        <line x1="10" y1="12" x2="20" y2="12" />
        <line x1="10" y1="16" x2="16" y2="16" />
        <path d="M3 4v16" />
      </svg>
    ),
    bookmark: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3a1 1 0 0 0-1 1v17l7-4 7 4V4a1 1 0 0 0-1-1H6z" />
      </svg>
    ),
    note: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="14" y2="17" />
      </svg>
    ),
    journal: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 4H8a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h11z" />
        <line x1="9" y1="9" x2="16" y2="9" />
        <line x1="9" y1="13" x2="16" y2="13" />
      </svg>
    ),
    notebook: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4z" />
        <polyline points="15 4 15 9 20 9" />
        <line x1="8" y1="14" x2="15" y2="14" />
      </svg>
    ),
    image: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="1.6" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    ),
    audio: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <line x1="12" y1="18" x2="12" y2="21" />
        <line x1="9" y1="21" x2="15" y2="21" />
      </svg>
    ),
    divider: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="12" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="18" cy="12" r="1.5" />
      </svg>
    ),
    body: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="7" x2="20" y2="7" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="17" x2="14" y2="17" />
      </svg>
    )
  };

  function insertItem(icon, label, desc, onClick) {
    return (
      <button type="button" className="jrn-insert-item" onClick={onClick}>
        <span className="jrn-insert-icon">{icon}</span>
        <span className="jrn-insert-text">
          <span className="jrn-insert-label">{label}</span>
          <span className="jrn-insert-desc">{desc}</span>
        </span>
      </button>
    );
  }

  function renderMenu() {
    return (
      <>
        <div className="jrn-insert-section">
          <h4>From the Library</h4>
          <div className="jrn-insert-list">
            {insertItem(ICONS.card,    'Card',    'Embed a chapter or letter title',         openCardPicker)}
            {insertItem(ICONS.excerpt, 'Excerpt', 'Embed a portion — pick word-precise text', openExcerptPicker)}
          </div>
        </div>
        <div className="jrn-insert-section">
          <h4>From Your Annotations</h4>
          <div className="jrn-insert-list">
            {insertItem(ICONS.bookmark, 'Bookmark',      'Pull in a saved passage',         pickBookmark)}
            {insertItem(ICONS.note,     'Note',          'Reference one of your annotations', pickNote)}
            {insertItem(ICONS.journal,  'Journal Entry', 'Link to another journal entry',   pickJournal)}
            {insertItem(ICONS.notebook, 'Notebook',      'Link to a notebook of notes',     pickNotebook)}
          </div>
        </div>
        <div className="jrn-insert-section">
          <h4>Capture</h4>
          <div className="jrn-insert-list">
            {insertItem(ICONS.image, 'Image',           'From device gallery',     pickImage)}
            {insertItem(ICONS.audio, 'Voice Recording', 'Record a memo or prayer', pickAudio)}
          </div>
        </div>
        <div className="jrn-insert-section" style={{ paddingBottom: '20px' }}>
          <h4>Text</h4>
          <div className="jrn-insert-list">
            {insertItem(ICONS.body, 'Body Text', 'A new line to write freely', insertBodyText)}
            {insertItem(ICONS.divider, 'Divider', '3-diamond ornament', insertDivider)}
          </div>
        </div>
      </>
    );
  }

  // ── Pickers with search (LinkPicker-style for journal pick) ─
  function searchPill() {
    return (
      <div className="jrn-picker-search-row">
        <input
          className="jrn-picker-search"
          type="text"
          autoFocus
          placeholder={mode === 'pick-journal' ? 'Search journal entries…'
            : mode === 'pick-bookmark' ? 'Search bookmarks…'
            : 'Search notes…'}
          value={query}
          onChange={function(e) { setQuery(e.target.value); }}
        />
      </div>
    );
  }

  function filterByText(items, getText) {
    var q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(function(item) {
      var hay = getText(item) || '';
      return hay.toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderBookmarkPicker() {
    var bms = (typeof BookmarkStore !== 'undefined') ? BookmarkStore.all() : [];
    bms.sort(function(a, b) { return (b.updated || b.created || 0) - (a.updated || a.created || 0); });
    var sourceLabel = (typeof _bookmarkSourceLabel === 'function') ? _bookmarkSourceLabel : function() { return ''; };
    var filtered = filterByText(bms, function(b) {
      return (b.label || '') + ' ' + (b.thought || '') + ' ' + (sourceLabel(b.hlKey) || '');
    });
    return (
      <>
        {searchPill()}
        <div className="jrn-picker-results">
          {filtered.length === 0
            ? <div className="jrn-picker-empty">{bms.length === 0 ? 'No bookmarks yet.' : 'No matches.'}</div>
            : filtered.map(function(b) {
                return (
                  <button key={b.id} type="button" className="jrn-picker-item" onClick={function() { chooseBookmark(b); }}>
                    <span className="jrn-picker-spine">BK</span>
                    <span className="jrn-picker-text">
                      <span className="jrn-picker-label">{b.label || 'Bookmark'}</span>
                      <span className="jrn-picker-cat">{sourceLabel(b.hlKey)}</span>
                    </span>
                  </button>
                );
              })}
        </div>
      </>
    );
  }

  function renderNotePicker() {
    var notes = [];
    try {
      if (typeof NoteStore !== 'undefined') {
        notes = (typeof NoteStore.list === 'function')
          ? NoteStore.list()
          : Object.values(NoteStore.all() || {});
      }
    } catch (e) { console.warn('NoteStore read failed', e); notes = []; }
    if (!Array.isArray(notes)) notes = [];
    notes.sort(function(a, b) { return (b.updated || b.created || 0) - (a.updated || a.created || 0); });
    var noteLabel = (typeof noteSourceLabel === 'function') ? noteSourceLabel : function() { return ''; };
    var filtered = filterByText(notes, function(n) {
      var src = '';
      try { src = noteLabel(n) || ''; } catch (e) { /* helper may throw on malformed data; treat as missing */ }
      return (n.body || '') + ' ' + (n.fullText || '') + ' ' + src;
    });
    return (
      <>
        {searchPill()}
        <div className="jrn-picker-results">
          {filtered.length === 0
            ? <div className="jrn-picker-empty">{notes.length === 0 ? 'No notes yet.' : 'No matches.'}</div>
            : filtered.slice(0, 200).map(function(n) {
                var anchor = (n.fullText || '').substring(0, 80);
                var label = (n.body || '').substring(0, 60) || anchor || 'Note';
                var src = '';
                try { src = noteLabel(n); } catch (e) { /* helper may throw on malformed data; treat as missing */ }
                return (
                  <button key={n.groupId} type="button" className="jrn-picker-item" onClick={function() { chooseNote(n); }}>
                    <span className="jrn-picker-spine">NT</span>
                    <span className="jrn-picker-text">
                      <span className="jrn-picker-label" style={{ fontStyle: 'italic', textTransform: 'none', fontFamily: 'EB Garamond, serif' }}>{label}</span>
                      <span className="jrn-picker-cat">{src}</span>
                    </span>
                  </button>
                );
              })}
        </div>
      </>
    );
  }

  function renderJournalPicker() {
    var entries = [];
    try { entries = (typeof JournalStore !== 'undefined') ? JournalStore.all() : []; }
    catch (e) { console.warn('JournalStore.all failed', e); entries = []; }
    entries = entries.filter(function(e) { return e.id !== excludeJournalId; });

    var filtered = filterByText(entries, function(e) {
      var title = '';
      var preview = '';
      try { title = JournalHelpers.entryDisplayTitle(e) || ''; } catch (err) { /* helper may throw on malformed data; treat as missing */ }
      try { preview = JournalHelpers.previewText(e, 400) || ''; } catch (err) { /* helper may throw on malformed data; treat as missing */ }
      var tags = (e.tags || []).join(' ');
      return title + ' ' + preview + ' ' + tags;
    });

    return (
      <>
        {searchPill()}
        <div className="jrn-picker-results">
          {filtered.length === 0
            ? <div className="jrn-picker-empty">{entries.length === 0 ? 'No other journal entries yet.' : 'No matches.'}</div>
            : filtered.map(function(e) {
                var title = '';
                var preview = '';
                try { title = JournalHelpers.entryDisplayTitle(e) || 'Untitled'; } catch (err) { title = 'Untitled'; }
                try { preview = JournalHelpers.previewText(e, 80) || ''; } catch (err) { /* helper may throw on malformed data; treat as missing */ }
                var dateStr = '';
                try { dateStr = JournalHelpers.shortDate(e.created); } catch (err) { /* helper may throw on malformed data; treat as missing */ }
                return (
                  <button key={e.id} type="button" className="jrn-picker-item" onClick={function() { chooseJournal(e); }}>
                    <span className="jrn-picker-spine">JR</span>
                    <span className="jrn-picker-text">
                      <span className="jrn-picker-label">{title}</span>
                      <span className="jrn-picker-cat">{dateStr + (preview ? ' · ' + preview : '')}</span>
                    </span>
                  </button>
                );
              })}
        </div>
      </>
    );
  }

  // ── Per-block picker (drilled into one journal entry) ─────
  function renderJournalBlockPicker() {
    var e = drilledEntry;
    if (!e) return null;
    var fresh = (typeof JournalStore !== 'undefined') ? (JournalStore.get(e.id) || e) : e;
    var blocks = (fresh.blocks || []).filter(JournalHelpers.isEmbeddableBlock);
    var dateStr = '';
    try { dateStr = JournalHelpers.shortDate(fresh.created); } catch (err) { /* helper may throw on malformed data; treat as missing */ }
    var title = JournalHelpers.entryDisplayTitle(fresh) || 'Untitled';
    return (
      <>
        <div className="jrn-blockpick-header">
          <div className="jrn-blockpick-title">{title}</div>
          <div className="jrn-blockpick-date">{dateStr}</div>
        </div>
        {/* Whole-entry option pinned at the top */}
        <div className="jrn-picker-results" style={{ paddingBottom: 0 }}>
          <button
            type="button"
            className="jrn-picker-item jrn-blockpick-whole"
            onClick={function() { chooseWholeEntry(fresh); }}
          >
            <span className="jrn-picker-spine">JR</span>
            <span className="jrn-picker-text">
              <span className="jrn-picker-label">Link the Whole Entry</span>
              <span className="jrn-picker-cat">Inserts a card that opens this entry</span>
            </span>
          </button>
        </div>
        <div className="jrn-blockpick-divider">or pick a specific block</div>
        <div className="jrn-picker-results">
          {blocks.length === 0
            ? <div className="jrn-picker-empty">This entry has no embeddable blocks yet.</div>
            : blocks.map(function(b) {
                var spine = b.type === 'image' ? 'IMG'
                  : b.type === 'audio' ? 'REC'
                  : b.type === 'quote' ? '“ ”'
                  : b.type === 'h2' ? 'H'
                  : 'TXT';
                var desc = JournalHelpers.describeBlock(b);
                return (
                  <button
                    key={b.id}
                    type="button"
                    className="jrn-picker-item"
                    onClick={function() { chooseEntryBlock(fresh, b); }}
                  >
                    <span className="jrn-picker-spine">{spine}</span>
                    <span className="jrn-picker-text">
                      <span className="jrn-picker-label">
                        {b.type === 'image' ? 'Image' : b.type === 'audio' ? 'Voice Recording' : 'Text Excerpt'}
                      </span>
                      <span className="jrn-picker-cat">{desc}</span>
                    </span>
                  </button>
                );
              })}
        </div>
      </>
    );
  }

  // ── Notebook picker — Uncategorized + every user notebook ──
  function renderNotebookPicker() {
    var nbs = (typeof NotebookStore !== 'undefined') ? NotebookStore.list() : [];
    var noteCount = function(nbId) {
      try {
        var all = (typeof NoteStore !== 'undefined') ? NoteStore.list() : [];
        if (nbId === 'uncategorized') return all.filter(function(n) { return !n.notebookIds || n.notebookIds.length === 0; }).length;
        return all.filter(function(n) { return (n.notebookIds || []).indexOf(nbId) >= 0; }).length;
      } catch (e) { return 0; }
    };
    var rows = [{ id: 'uncategorized', name: 'Uncategorized' }].concat(nbs);
    var q = query.trim().toLowerCase();
    if (q) rows = rows.filter(function(nb) { return (nb.name || '').toLowerCase().indexOf(q) >= 0; });
    return (
      <>
        {searchPill()}
        <div className="jrn-picker-results">
          {rows.length === 0
            ? <div className="jrn-picker-empty">{nbs.length === 0 ? 'No notebooks yet — Uncategorized is always available.' : 'No matches.'}</div>
            : rows.map(function(nb) {
                var cnt = noteCount(nb.id);
                return (
                  <button key={nb.id} type="button" className="jrn-picker-item" onClick={function() { chooseNotebook(nb.id); }}>
                    <span className="jrn-picker-spine">NB</span>
                    <span className="jrn-picker-text">
                      <span className="jrn-picker-label">{nb.name}</span>
                      <span className="jrn-picker-cat">{cnt + (cnt === 1 ? ' note' : ' notes')}</span>
                    </span>
                  </button>
                );
              })}
        </div>
      </>
    );
  }

  function titleStr() {
    if (mode === 'pick-bookmark') return 'Pick Bookmark';
    if (mode === 'pick-note') return 'Pick Note';
    if (mode === 'pick-journal') return 'Link a Journal Entry';
    if (mode === 'pick-journal-block') return 'Pick from Entry';
    if (mode === 'pick-notebook') return 'Link a Notebook';
    return 'Insert';
  }

  function body() {
    if (mode === 'pick-bookmark') return renderBookmarkPicker();
    if (mode === 'pick-note')     return renderNotePicker();
    if (mode === 'pick-journal')  return renderJournalPicker();
    if (mode === 'pick-journal-block') return renderJournalBlockPicker();
    if (mode === 'pick-notebook') return renderNotebookPicker();
    return renderMenu();
  }

  function back() {
    setQuery('');
    if (mode === 'pick-journal-block') { setDrilledEntry(null); setMode('pick-journal'); }
    else setMode('menu');
  }

  return (
    <div className="note-sheet-overlay" onClick={function(e) { if (e.target === e.currentTarget) close(); }}>
      <div className="note-sheet jrn-insert-sheet" onClick={function(e) { e.stopPropagation(); }} style={{ maxWidth: '480px' }}>
        <div className="note-sheet-header">
          {mode !== 'menu' && (
            <button className="note-sheet-menu-btn" onClick={back} aria-label="Back" style={{ fontSize: '18px' }}>‹</button>
          )}
          <span className="note-sheet-title" style={{ flex: 1 }}>{titleStr()}</span>
          <button className="note-sheet-menu-btn" onClick={close} aria-label="Close" style={{ fontSize: '18px' }}>×</button>
        </div>
        {body()}
      </div>
    </div>
  );
}
