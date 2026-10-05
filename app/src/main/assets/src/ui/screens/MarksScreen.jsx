/* ═══════════════════════════════════════════════════════════════════════
   MarksScreen — "Marks & notes" (rs3, overhaul; sheet 25 + the canvas's
   Marks board). Cluster G (esbuild bundle-g.js, lazy).
   ═══════════════════════════════════════════════════════════════════════
   Highlights, underlines, notes and bookmarks under one roof: one list,
   newest first, with chips to narrow it (All · Highlights · Notes ·
   Bookmarks) and a Notebooks chip that opens the notebooks. A row opens
   its place in the text, the way each kind's own screen does:
     highlight  _collectMarks() (HighlightsScreen) -> _bookmarkSourceEndpoint
     note       NoteStore.list() -> noteSourceNav, with the pendingOpenNote
                handoff so the note sheet opens on arrival (NotesIndexScreen)
     bookmark   BookmarkStore.all() -> _bookmarkSourceEndpoint (BookmarksScreen)
   The per-kind screens keep their tools (colour filter, export, labels,
   delete); a filtered view ends with a row that opens them, so nothing is
   lost by moving the reader here first.
   ═══════════════════════════════════════════════════════════════════════ */

import { _collectMarks, _hlColorHex } from './HighlightsScreen.jsx';
import { useStoreVersionByName } from '../../hooks/use-store-version.js';
import { relativeDate } from '../../utils/dates.js';
import { normalizeExcerptDisplay } from '../../utils/excerpt-display.js';

const MARK_STORES = Object.freeze(['AnnotationStore', 'NoteStore', 'NotebookStore', 'BookmarkStore']);

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'highlight', label: 'Highlights' },
  { id: 'note', label: 'Notes' },
  { id: 'bookmark', label: 'Bookmarks' },
];

/** @param {string} hlKey */
function _srcLabel(hlKey) {
  return (typeof _bookmarkSourceLabel === 'function') ? String(_bookmarkSourceLabel(hlKey) || '') : String(hlKey || '');
}
/** @param {string} hlKey */
function _srcEndpoint(hlKey) {
  return (typeof _bookmarkSourceEndpoint === 'function') ? _bookmarkSourceEndpoint(hlKey) : null;
}

/**
 * Every mark, note and bookmark as one row shape, unsorted.
 * @returns {{ id: string, kind: 'highlight'|'note'|'bookmark', sub: string, place: string, title: string, quote: string, at: number, color?: string, raw: any }[]}
 */
export function collectMarksAndNotes() {
  const rows = [];
  for (const m of _collectMarks()) {
    rows.push({
      id: 'h:' + m.groupId, kind: 'highlight', sub: m.kind === 'underline' ? 'Underline' : 'Highlight',
      place: _srcLabel(m.hlKey), title: m.text || '', quote: '', at: m.updated || m.created || 0, color: m.color, raw: m,
    });
  }
  const notes = (typeof NoteStore !== 'undefined' && typeof NoteStore.list === 'function') ? NoteStore.list() : [];
  for (const n of notes) {
    const nbs = (n.notebookIds || []).map((id) => (typeof NotebookStore !== 'undefined' ? NotebookStore.get(id) : null)).filter(Boolean);
    rows.push({
      id: 'n:' + n.groupId, kind: 'note', sub: nbs.length ? 'Note · ' + nbs.map((nb) => nb.name).join(', ') : 'Note',
      place: (typeof noteSourceLabel === 'function') ? noteSourceLabel(n) : '', title: n.body || '',
      quote: normalizeExcerptDisplay(n.fullText || ''), at: n.updated || n.created || 0, color: n.color, raw: n,
    });
  }
  const bookmarks = (typeof BookmarkStore !== 'undefined' && typeof BookmarkStore.all === 'function') ? BookmarkStore.all() : [];
  for (const b of bookmarks) {
    rows.push({
      id: 'b:' + b.id, kind: 'bookmark', sub: 'Bookmark', place: _srcLabel(b.hlKey),
      title: b.label || _srcLabel(b.hlKey), quote: b.thought || '', at: b.updated || b.created || 0, raw: b,
    });
  }
  return rows;
}

function KindIcon({ row }) {
  if (row.kind === 'highlight') {
    return <span className="marks-row-bar" aria-hidden="true" style={row.raw.kind === 'underline' ? undefined : { background: _hlColorHex(row.color) }} data-underline={row.raw.kind === 'underline' ? '' : undefined} />;
  }
  if (row.kind === 'bookmark') {
    return <svg className="marks-row-icon" width="18" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M6 3.5h12v17l-6-4.5-6 4.5z" /></svg>;
  }
  return <svg className="marks-row-icon" width="18" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M5 3.5h10l4 4v13H5zM8.5 11h7M8.5 14.5h7M8.5 18h4" /></svg>;
}

/**
 * @param {{ onBack: any, onNavigateToSource: any, onOpenHighlights: any, onOpenNotes: any, onOpenNotebooks: any,
 *   onOpenBookmarks: any, onSearch?: any, onHistory?: any, onSettings?: any, theme?: any, onThemeChange?: any }} props
 */
export function MarksScreen({ onBack, onNavigateToSource, onOpenHighlights, onOpenNotes, onOpenNotebooks, onOpenBookmarks, onSearch }) {
  // Fixed list, stable hook order: each store's version re-renders the list when it changes.
  MARK_STORES.forEach(useStoreVersionByName);
  const [filter, setFilter] = React.useState('all');
  const [newest, setNewest] = React.useState(true);
  // The Library root's search field lands here with the box focused (navHandoff 'marksFocusSearch').
  const [focusSearch] = React.useState(() => !!(window.navHandoff && window.navHandoff.take('marksFocusSearch')));
  const [query, setQuery] = React.useState('');
  const searchRef = React.useRef(/** @type {HTMLInputElement | null} */ (null));
  React.useEffect(() => { if (focusSearch && searchRef.current) searchRef.current.focus(); }, [focusSearch]);

  const all = collectMarksAndNotes();
  const counts = { highlight: 0, note: 0, bookmark: 0 };
  for (const r of all) counts[r.kind]++;
  const q = query.trim().toLowerCase();
  const shown = all
    .filter((r) => filter === 'all' || r.kind === filter)
    .filter((r) => !q || (r.place + ' ' + r.title + ' ' + r.quote + ' ' + r.sub).toLowerCase().includes(q))
    .sort((a, b) => (a.at !== b.at ? (newest ? b.at - a.at : a.at - b.at) : (a.id < b.id ? -1 : 1)));

  const open = (r) => {
    if (r.kind === 'note') {
      const nav = (typeof noteSourceNav === 'function') ? noteSourceNav(r.raw) : null;
      if (!nav) return;
      window.navHandoff.set('pendingOpenNote', r.raw.groupId);
      onNavigateToSource(nav, { sourceLetterTitle: 'Marks & notes' });
      return;
    }
    const ep = _srcEndpoint(r.raw.hlKey);
    if (ep) onNavigateToSource(ep, { sourceLetterTitle: 'Marks & notes' });
  };
  const tools = {
    highlight: { label: 'Colours, underlines and removing marks', go: onOpenHighlights },
    note: { label: 'Export notes and edit notebooks', go: onOpenNotes },
    bookmark: { label: 'Rename, add a thought or remove bookmarks', go: onOpenBookmarks },
  }[filter];
  const emptyText = q ? 'Nothing matches "' + query.trim() + '".'
    : filter === 'all' ? 'Nothing marked yet. Press and hold a passage to highlight it, add a note, or bookmark the page.'
      : filter === 'highlight' ? 'No highlights yet. Press and hold a passage, then choose a colour.'
        : filter === 'note' ? 'No notes yet. Press and hold a passage, then choose Note.'
          : 'No bookmarks yet. Tap the bookmark in the top bar while reading.';

  return (
    <ScreenLayout navChildren={LibraryNav({ onBack, backTitle: 'Back', backLabel: 'Library', hide: ['settings', 'history', 'theme'], onSearch })}>
      <div className="root-page marks-page">
        <h1 className="settings-title marks-title">Marks &amp; notes</h1>
        <label className="root-search marks-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
          <input ref={searchRef} type="search" className="marks-search-input" placeholder="Search your marks and notes…" aria-label="Search your marks and notes" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="marks-chips" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={'marks-chip' + (filter === f.id ? ' on' : '')} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}{f.id !== 'all' && counts[f.id] ? <span className="marks-chip-n">{' ' + counts[f.id]}</span> : null}
            </button>
          ))}
          <button type="button" className="marks-chip" onClick={onOpenNotebooks}>Notebooks</button>
        </div>
        <div className="marks-sort">
          <button type="button" className="marks-sort-btn" onClick={() => setNewest((v) => !v)} aria-label={newest ? 'Newest first. Show oldest first' : 'Oldest first. Show newest first'}>
            {newest ? 'Newest' : 'Oldest'} <span aria-hidden="true">▾</span>
          </button>
        </div>
        {shown.length === 0 ? <p className="marks-empty">{emptyText}</p> : (
          <ul className="root-list marks-list">
            {shown.map((r) => (
              <li key={r.id} className="root-item">
                <button type="button" className={'marks-row marks-' + r.kind} onClick={() => open(r)}>
                  <KindIcon row={r} />
                  <span className="marks-row-text">
                    {r.place ? <span className="marks-row-place">{r.place}</span> : null}
                    {r.title ? <span className="marks-row-title">{r.title}</span> : null}
                    {r.quote ? <span className="marks-row-quote">{r.kind === 'note' ? '“' + r.quote + '”' : r.quote}</span> : null}
                    <span className="marks-row-sub">{r.sub}{r.at ? ' · ' + relativeDate(r.at) : ''}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {tools && tools.go ? (
          <ul className="root-list marks-tools">
            <li className="root-item">
              <button type="button" className="root-row" onClick={tools.go}>
                <span className="root-row-text"><span className="root-row-title">{FILTERS.find((f) => f.id === filter).label}: all tools</span><span className="root-row-sub">{tools.label}</span></span>
                <svg className="root-row-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M9 5.5l6.5 6.5L9 18.5" /></svg>
              </button>
            </li>
          </ul>
        ) : null}
      </div>
    </ScreenLayout>
  );
}
