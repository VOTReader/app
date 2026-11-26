/* ═══════════════════════════════════════════════════════════════════════
   JournalInsertSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { normalizeExcerptDisplay } from '../../utils/excerpt-display.js';
import { foldLower } from '../../utils/fold-accents.js';
import { UiIcon } from '../components/UiIcon.jsx';
import { SheetHandle } from '../components/SheetHandle.jsx';
import { openJournalLinkPicker } from '../../utils/journal-link-picker.js';
import { NOT_IN_A_NOTEBOOK } from '../../data/notebook-label.js';

/** The note picker lists the newest this many (a long list is slow to draw). */
var NOTE_PICKER_CAP = 200;

export function JournalInsertSheet(props) {
  var useState = React.useState;

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
  var trapRef = useFocusTrap(true);

  function close() { try { onClose && onClose(); } catch (_e) { /* helper may throw on malformed data; treat as missing */ } }

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
  function openCardPicker() { if (window.__openLinkPickerForTarget) close(); openJournalLinkPicker('card', onInsertBlock); }
  function openExcerptPicker() { if (window.__openLinkPickerForTarget) close(); openJournalLinkPicker('excerpt', onInsertBlock); }

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

  // mock v2 l-jins: ten tiles in four groups, all in one view (no scrolling).
  function tile(icon, label, onClick) {
    return (
      <button type="button" className="jrn-ins-tile" onClick={onClick}>
        <UiIcon name={icon} size="sm" />
        <span>{label}</span>
      </button>
    );
  }

  function renderMenu() {
    return (
      <div className="jrn-ins-groups">
        <div className="jrn-ins-label">From the library</div>
        <div className="jrn-ins-tiles">
          {tile('note', 'Letter or chapter', openCardPicker)}
          {tile('quote', 'Excerpt', openExcerptPicker)}
        </div>
        <div className="jrn-ins-label">From your notes and marks</div>
        <div className="jrn-ins-tiles">
          {tile('mark', 'Bookmark', pickBookmark)}
          {tile('pen', 'Note', pickNote)}
          {tile('journal', 'Journal entry', pickJournal)}
          {tile('list', 'Notebook', pickNotebook)}
        </div>
        <div className="jrn-ins-label">Capture</div>
        <div className="jrn-ins-tiles">
          {tile('img', 'Photo', pickImage)}
          {tile('mic', 'Voice recording', pickAudio)}
        </div>
        <div className="jrn-ins-label">Text</div>
        <div className="jrn-ins-tiles">
          {tile('plus', 'Paragraph', insertBodyText)}
          {tile('minus', 'Divider', insertDivider)}
        </div>
      </div>
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
            : mode === 'pick-notebook' ? 'Search notebooks…'
            : 'Search notes…'}
          aria-label={mode === 'pick-journal' ? 'Search journal entries'
            : mode === 'pick-bookmark' ? 'Search bookmarks'
            : mode === 'pick-notebook' ? 'Search notebooks'
            : 'Search notes'}
          value={query}
          onChange={function(e) { setQuery(e.target.value); }}
        />
      </div>
    );
  }

  function filterByText(items, getText) {
    // accents off on both sides (i18n-text-n4)
    var q = foldLower(query.trim());
    if (!q) return items;
    return items.filter(function(item) {
      var hay = getText(item) || '';
      return foldLower(hay).indexOf(q) >= 0;
    });
  }

  function renderBookmarkPicker() {
    // A copy: all() is the store's live cache, and its next save would persist this order.
    var bms = (typeof BookmarkStore !== 'undefined') ? BookmarkStore.all().slice() : [];
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
            ? <div className="jrn-picker-empty">{bms.length === 0 ? 'No bookmarks yet. Select text in any chapter or letter and tap Bookmark.' : 'No matches.'}</div>
            : filtered.map(function(b) {
                return (
                  <button key={b.id} type="button" className="jrn-picker-item" onClick={function() { chooseBookmark(b); }}>
                    <span className="jrn-picker-spine" aria-hidden="true">BK</span>
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
      try { src = noteLabel(n) || ''; } catch (_e) { /* helper may throw on malformed data; treat as missing */ }
      return (n.body || '') + ' ' + normalizeExcerptDisplay(n.fullText) + ' ' + src;
    });
    return (
      <>
        {searchPill()}
        <div className="jrn-picker-results">
          {filtered.length === 0
            ? <div className="jrn-picker-empty">{notes.length === 0 ? 'No notes yet. Select text in any chapter or letter and tap Note.' : 'No matches.'}</div>
            : filtered.slice(0, NOTE_PICKER_CAP).map(function(n) {
                var anchor = normalizeExcerptDisplay(n.fullText).substring(0, 80);
                var label = (n.body || '').substring(0, 60) || anchor || 'Note';
                var src = '';
                try { src = noteLabel(n); } catch (_e) { /* helper may throw on malformed data; treat as missing */ }
                return (
                  <button key={n.groupId} type="button" className="jrn-picker-item" onClick={function() { chooseNote(n); }}>
                    <span className="jrn-picker-spine" aria-hidden="true">NT</span>
                    <span className="jrn-picker-text">
                      <span className="jrn-picker-label" style={{ fontStyle: 'italic', textTransform: 'none', fontFamily: 'var(--font-body)' }}>{label}</span>
                      <span className="jrn-picker-cat">{src}</span>
                    </span>
                  </button>
                );
              })}
          {/* id-datasafe 129: the list stops at NOTE_PICKER_CAP; say so, and how to reach the rest. */}
          {filtered.length > NOTE_PICKER_CAP && (
            <div className="jrn-picker-empty jrn-picker-cap">{'Showing ' + NOTE_PICKER_CAP + ' of ' + filtered.length + ' notes. Search to find the others.'}</div>
          )}
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
      try { title = JournalHelpers.entryDisplayTitle(e) || ''; } catch (_err) { /* helper may throw on malformed data; treat as missing */ }
      try { preview = JournalHelpers.previewText(e, 400) || ''; } catch (_err) { /* helper may throw on malformed data; treat as missing */ }
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
                try { title = JournalHelpers.entryDisplayTitle(e) || 'Untitled'; } catch (_err) { title = 'Untitled'; }
                try { preview = JournalHelpers.previewText(e, 80) || ''; } catch (_err) { /* helper may throw on malformed data; treat as missing */ }
                var dateStr = '';
                try { dateStr = JournalHelpers.shortDate(e.created); } catch (_err) { /* helper may throw on malformed data; treat as missing */ }
                return (
                  <button key={e.id} type="button" className="jrn-picker-item" onClick={function() { chooseJournal(e); }}>
                    <span className="jrn-picker-spine" aria-hidden="true">JR</span>
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
    try { dateStr = JournalHelpers.shortDate(fresh.created); } catch (_err) { /* helper may throw on malformed data; treat as missing */ }
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
            <span className="jrn-picker-spine" aria-hidden="true">JR</span>
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

  // ── Notebook picker: Not in a notebook + every user notebook ──
  function renderNotebookPicker() {
    var nbs = (typeof NotebookStore !== 'undefined') ? NotebookStore.list() : [];
    // One note list per render, counted into every notebook at once: each row used to re-list (and
    // re-sort) every note to count its own (sweep W69). A note lists a notebook once however often
    // its ids repeat it, as the old indexOf test did.
    /** @type {Map<string, number>} */
    var counts = new Map();
    var uncategorized = 0;
    try {
      var all = (typeof NoteStore !== 'undefined') ? NoteStore.list() : [];
      all.forEach(function(n) {
        var ids = n.notebookIds || [];
        if (ids.length === 0) uncategorized++;
        else new Set(ids).forEach(function(id) { counts.set(id, (counts.get(id) || 0) + 1); });
      });
    } catch (_e) { counts = new Map(); uncategorized = 0; }
    var noteCount = function(nbId) { return nbId === 'uncategorized' ? uncategorized : (counts.get(nbId) || 0); };
    var rows = [{ id: 'uncategorized', name: NOT_IN_A_NOTEBOOK }].concat(nbs);
    var q = foldLower(query.trim());
    // The unfiled bucket also answers to its id ("uncategorized", its name until product-8), so "uncat" finds it.
    if (q) rows = rows.filter(function(nb) { return foldLower(nb.name || '').indexOf(q) >= 0 || (nb.id === 'uncategorized' && nb.id.indexOf(q) >= 0); });
    return (
      <>
        {searchPill()}
        <div className="jrn-picker-results">
          {rows.length === 0
            ? <div className="jrn-picker-empty">No notebooks match.</div>
            : rows.map(function(nb) {
                var cnt = noteCount(nb.id);
                return (
                  <button key={nb.id} type="button" className="jrn-picker-item" onClick={function() { chooseNotebook(nb.id); }}>
                    <span className="jrn-picker-spine" aria-hidden="true">NB</span>
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
      <div className="note-sheet jrn-insert-sheet" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="journal-insert-title" onClick={function(e) { e.stopPropagation(); }} style={{ maxWidth: '480px' }}>
        {/* the grabber (rule 13); its x is hidden here, the header keeps the one Close */}
        <SheetHandle onClose={close} />
        <div className="note-sheet-header">
          {mode !== 'menu' && (
            <button className="note-sheet-menu-btn" onClick={back} aria-label="Back" style={{ fontSize: 'var(--fsc-18)' }}>‹</button>
          )}
          <span className="note-sheet-title" id="journal-insert-title" style={{ flex: 1 }}>{titleStr()}</span>
          <button type="button" className="note-sheet-menu-btn jrn-ins-close" onClick={close} aria-label="Close"><UiIcon name="x" /></button>
        </div>
        {body()}
      </div>
    </div>
  );
}
