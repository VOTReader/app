/* ═══════════════════════════════════════════════════════════════════════
   NotesIndexScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* Free globals, not imports: this screen ships in bundle-d (the lazy Personal
   Study bundle-g until lz1) and reads normalizeExcerptDisplay from the window slots
   bundle-d fills — one copy of each law, and no second module state. */
import { composeNotesExport, notesExportFilename, shareNotesExport } from '../../utils/notes-export.js';
import { clearNoteDraft } from '../../utils/note-draft.js';
import { snapshotGroups, offerUndoRemoved } from '../../utils/annotation-undo.js';
import { countOf } from '../../utils/download-tree.js';
import { relativeDate } from '../../utils/dates.js';
import { BarMenu } from '../components/RootNav.jsx';
import { ActionSheet } from '../components/SelectField.jsx';
import { ListGroup, ListRow, Segmented, UiButton, EmptyState } from '../components/UiParts.jsx';
import { ListSearch, ListLine } from '../components/LibraryList.jsx';

/** The notebook every unfiled note is in (X-hidden-decisions: "Uncategorized" becomes this). */
export const NOT_IN_A_NOTEBOOK = 'Not in a notebook';

/** A highlight colour id as a word: 'yellow' -> 'Yellow'. @param {string} c */
export const colourName = (c) => (c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Gold');

/** The menu's open row, by where the note lives. @param {any} nav */
export function openWords(nav) {
  if (nav.type === 'bible' || nav.type === 'study') return 'Open the passage';
  if (nav.type === 'journal') return 'Open the journal entry';
  return 'Open in the letter';
}

/** The notebook colours: gold (no tag) then the highlight colours. @param {{ value: string | null, onPick: (c: string | null) => void }} props */
/* POL6 (mock v2 l-nb-new): gold and seven muted colours, one row. A notebook keeps an older pick (pink, brown,
   gray): it is shown while chosen. The stored name is the highlight colour's; --nb-<name> is its muted dot. */
const NB_COLOURS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple'];
/** @param {string} c */
export const nbDotColour = (c) => 'var(--nb-' + c + ', var(--hl-' + c + '))';

function ColourDots({ value, onPick }) {
  const colours = value && NB_COLOURS.indexOf(value) < 0 ? NB_COLOURS.concat([value]) : NB_COLOURS;
  return (
    <div className="lib-colours" role="radiogroup" aria-label="Notebook colour">
      <button type="button" role="radio" aria-checked={!value} aria-label="Gold" className="lib-colour"
        style={{ background: 'var(--gold)' }} onClick={() => onPick(null)} />
      {colours.map((/** @type {string} */ c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={colourName(c)} className="lib-colour"
          style={{ background: nbDotColour(c) }} onClick={() => onPick(c)} />
      ))}
    </div>
  );
}

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

/** localStorage: the Notes tab the reader last chose. */
const NOTES_TAB_KEY = 'vot-notes-tab';
/** @returns {'notebooks' | 'all-notes' | null} */
function _lastTab() {
  try { const t = localStorage.getItem(NOTES_TAB_KEY); return t === 'notebooks' || t === 'all-notes' ? t : null; } catch (_e) { return null; }
}

/**
 * @param {{ onBack: () => void, onHome?: any, onOpenNote: (gid: string) => void, onEditNote?: (gid: string) => void,
 *   onMoveNote?: (gid: string) => void, onStartReading?: () => void, onNavigateToSource: (nav: any, meta?: any) => void,
 *   navOrigin?: any, theme?: any, onThemeChange?: any, onSearch?: any, onHistory?: any, onSettings?: any, historyEnabled?: any }} props
 */
export function NotesIndexScreen({ onBack, onHome: _onHome, onOpenNote, onEditNote, onMoveNote, onStartReading, onNavigateToSource, navOrigin = null, theme: _theme, onThemeChange: _onThemeChange, onSearch: _onSearch, onHistory: _onHistory, onSettings: _onSettings, historyEnabled: _historyEnabled }) {
  // Subscribe to NoteStore + NotebookStore mutations so the index re-renders
  // on any add/remove/rename/membership change.
  const noteVer = React.useSyncExternalStore(
    React.useCallback((cb) => NoteStore.subscribe(cb), []),
    () => NoteStore.getVersion()
  );
  const nbVer = React.useSyncExternalStore(
    React.useCallback((cb) => NotebookStore.subscribe(cb), []),
    () => NotebookStore.getVersion()
  );
  // All notes — annotations on letters, scripture, AND journal paragraphs.
  // Notes from inside journal entries are real annotations and belong here,
  // labeled with their journal source via noteSourceLabel. list() builds and
  // sorts a fresh array per call, so both lists are keyed on their store's
  // version: every memo below used to miss on every keystroke (sweep W69).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the store version: list() is a fresh array per call
  const allNotes = React.useMemo(() => NoteStore.list(), [noteVer]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the store version: list() is a fresh array per call
  const notebooks = React.useMemo(() => NotebookStore.list(), [nbVer]);
  // Restore the user's place (tab + drilled notebook) when returning from a
  // source tap-through. The navHandoff 'notesReturnCtx' slot is set in onRowTap
  // before we navigate away and consumed on this mount, so the back-pill ("Back
  // to Devotional") actually lands back in the Devotional drilled view.
  const _notesRet = (typeof window !== 'undefined' && window.navHandoff) ? window.navHandoff.peek('notesReturnCtx') : null;
  // Which tab opens (U03.8/U08.4): the one the reader last chose; before any choice, All notes while no notebook of
  // their own exists (Notebooks would show a lone "Uncategorized" row, one tap away from every note).
  const [tab, setTabState] = React.useState(() => (_notesRet && _notesRet.tab) || _lastTab() || (notebooks.length ? 'notebooks' : 'all-notes')); // 'notebooks' | 'all-notes'
  /** @param {'notebooks' | 'all-notes'} t */
  const setTab = (t) => { setTabState(t); try { localStorage.setItem(NOTES_TAB_KEY, t); } catch (_e) { /* the default next time */ } };
  const [drilledNbId, setDrilledNbId] = React.useState((_notesRet && _notesRet.drilledNbId) || null); // null | 'uncategorized' | <notebookId>
  // "Back to <source>" pill — set when this screen was opened as a link-out
  // (e.g. a journal entry's Notebook card). Mirrors the reading screens'
  // fromLetterStack pill so every journal card returns to its source in one
  // tap. Lives in component state (resets on unmount = single-shot), and a
  // note tap-through carries it in notesReturnCtx so the return trip keeps it
  // (sweep v027). Its one tap IS onBack (goNavOrigin), so the stash stamps the
  // navOrigin it was raised under and the pill comes back only while that is
  // still the origin: reopened some other way (top-nav Notes from the passage,
  // another tab) it would name a place Back no longer goes. The journal card's
  // own link-out stamps none; its slot is consumed by the mount that follows.
  const _retPill = _notesRet && _notesRet.backPill;
  const [backPill, setBackPill] = React.useState(
    (_retPill && (_retPill.origin === undefined || _retPill.origin === navOrigin)) ? _retPill : null);
  React.useEffect(() => { if (typeof window !== 'undefined' && window.navHandoff) window.navHandoff.clear('notesReturnCtx'); }, []);
  const [allNotesSort, setAllNotesSort] = React.useState('newest'); // 'newest' | 'oldest'
  const [drilledSort, setDrilledSort] = React.useState('newest');
  // One shared query filters the All Notes tab AND any drilled notebook —
  // the box is visible in both views, so the carried-over filter is never
  // hidden state. The Notebooks card grid has no box (cards aren't notes).
  const [searchQuery, setSearchQuery] = React.useState('');

  // Build the back-pill source label from the user's current location.
  // — Drilled into a user notebook: that notebook's name
  // — Drilled into the unfiled notes: "Not in a notebook"
  // — All Notes tab: "My Notes" (default)
  const currentSourceTitle = () => {
    if (drilledNbId === 'uncategorized') return NOT_IN_A_NOTEBOOK;
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
    // user to the exact list they tapped from (consumed on next mount), and
    // the live "Back to <source>" pill with the origin its tap leads to.
    window.navHandoff.set('notesReturnCtx', { tab: tab, drilledNbId: drilledNbId, backPill: backPill && { title: backPill.title, origin: navOrigin } });
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

  const drilledNb = drilledNbId && drilledNbId !== 'uncategorized' ? NotebookStore.get(drilledNbId) : null;
  const drilledTitle = drilledNbId === 'uncategorized' ? NOT_IN_A_NOTEBOOK : (drilledNb ? drilledNb.name : '');

  // ── Sheets (rule 13: one level each; a second level closes this one and opens its own) ──
  const [noteMenu, setNoteMenu] = React.useState(/** @type {any} */ (null));
  const [noteToDelete, setNoteToDelete] = React.useState(/** @type {any} */ (null));
  const [barMenu, setBarMenu] = React.useState(false);
  const [nbSheet, setNbSheet] = React.useState(/** @type {null | 'new' | 'rename' | 'colour' | 'delete'} */ (null));
  const [nbName, setNbName] = React.useState('');
  const [nbColour, setNbColour] = React.useState(/** @type {string | null} */ (null));
  const [nameTaken, setNameTaken] = React.useState('');
  const closeNbSheet = React.useCallback(() => { setNbSheet(null); setNameTaken(''); }, []);
  const closeNoteMenu = React.useCallback(() => setNoteMenu(null), []);
  const closeBarMenu = React.useCallback(() => setBarMenu(false), []);
  const closeDelete = React.useCallback(() => setNoteToDelete(null), []);

  const openNewNotebook = () => { setNbName(''); setNbColour(null); setNameTaken(''); setNbSheet('new'); };
  const createNotebook = () => {
    const trimmed = nbName.trim();
    if (!trimmed) return false;
    const nb = NotebookStore.add(trimmed);
    if (nb && nbColour) NotebookStore.setColor(nb.id, nbColour);
    return true;
  };
  const commitRename = () => {
    const trimmed = nbName.trim();
    if (!trimmed || !drilledNb) return false;
    // ds5 s11.3: a name another notebook has is refused; the sheet stays open and says so.
    if (NotebookStore.rename(drilledNb.id, trimmed) === false) { setNameTaken(trimmed); return false; }
    return true;
  };
  const deleteCurrent = () => {
    if (!drilledNb) return;
    NotebookStore.remove(drilledNb.id);
    setDrilledNbId(null);
  };
  /** @param {any} note */
  const deleteNote = (note) => {
    // The reader's own Remove offers Undo (AnnotationActionChip); so does this one: the note and its mark come back as they were.
    const snaps = typeof AnnotationStore !== 'undefined' ? snapshotGroups([note.groupId]) : [];
    clearNoteDraft(note.groupId);
    if (typeof AnnotationStore !== 'undefined') AnnotationStore.removeGroup(note.groupId);
    NoteStore.remove(note.groupId);
    offerUndoRemoved(snaps, 'Note deleted');
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
  // bar's Back AND the global back router (Android hardware back / web Escape),
  // which calls window.__screenBack.
  const popDrill = () => { setDrilledNbId(null); setNbSheet(null); setSearchQuery(''); };
  const handleNavBack = () => { if (drilledNbId) { popDrill(); } else { onBack(); } };
  React.useEffect(() => {
    // Register the screen-back interceptor only while drilled in. When not
    // drilled, no interceptor → the global router falls through to its normal
    // notes-index → origin route. See use-android-back.js §(1b).
    if (!drilledNbId) return undefined;
    const fn = () => { setDrilledNbId(null); setNbSheet(null); setSearchQuery(''); return true; };
    window.__screenBack = fn;
    return () => { if (window.__screenBack === fn) window.__screenBack = null; };
  }, [drilledNbId]);

  // The bar's menu holds the rare things (rule 11), and only shows when it holds something.
  const shownList = drilledNbId ? drilledNotesShown : allNotesShown;
  const barActions = [];
  if (shownList.length > 0) {
    barActions.push({ id: 'share', icon: 'share', label: drilledNbId ? 'Share as text' : 'Share all as text',
      onSelect: () => exportNotes(drilledNbId ? drilledTitle : 'My Notes', shownList) });
  }
  if (drilledNb) {
    barActions.push(
      { id: 'rename', icon: 'pen', label: 'Rename', onSelect: () => { setNbName(drilledNb.name); setNameTaken(''); setNbSheet('rename'); } },
      { id: 'colour', icon: 'spark', label: 'Colour', value: drilledNb.color ? colourName(drilledNb.color) : 'Gold', onSelect: () => setNbSheet('colour') },
      { id: 'delete', icon: 'trash', label: 'Delete notebook', danger: true, onSelect: () => setNbSheet('delete') },
    );
  }

  /** @param {any} note */
  const noteActions = (note) => {
    const nav = typeof noteSourceNav === 'function' ? noteSourceNav(note) : null;
    const nbs = (note.notebookIds || []).map((id) => NotebookStore.get(id)).filter(Boolean);
    /** @type {any[]} */
    const acts = [];
    if (nav) acts.push({ id: 'open', icon: 'book', label: openWords(nav), onSelect: () => navToSource(note, nav) });
    acts.push(
      { id: 'edit', icon: 'pen', label: 'Edit note', onSelect: () => (onEditNote ? onEditNote(note.groupId) : onOpenNote(note.groupId)) },
      { id: 'move', icon: 'journal', label: 'Move to a notebook', value: nbs.length ? (nbs.length === 1 ? nbs[0].name : countOf(nbs.length, 'notebook')) : 'Not in one',
        onSelect: () => { if (onMoveNote) onMoveNote(note.groupId); } },
      { id: 'share', icon: 'share', label: 'Share', onSelect: () => exportNotes(noteSourceLabel(note), [note]) },
      { id: 'delete', icon: 'trash', label: 'Delete note', danger: true, onSelect: () => setNoteToDelete(note) },
    );
    if (!onMoveNote) return acts.filter((a) => a.id !== 'move');
    return acts;
  };
  /** @param {any} note */
  const rowMenu = (note) => ({ label: 'Note options', onClick: () => setNoteMenu(note) });
  /** @param {any} note */
  const noteHead = (note) => (note.body || normalizeExcerptDisplay(note.fullText) || noteSourceLabel(note)).slice(0, 120);

  const emptyAll = (
    <EmptyState icon="note" title="No notes yet"
      text="Select some words while you read and tap Note. Every note you write collects here."
      action={onStartReading ? { label: 'Start reading', onClick: onStartReading } : null} />
  );
  const noMatch = <p className="lib-none">No notes match “{searchQuery.trim()}”.</p>;
  const cards = (/** @type {any[]} */ list, /** @type {any} */ hide) => (
    <div className="notes-index-list">
      {list.map((note) => <NoteRow key={note.groupId} note={note} onTap={onRowTap} onTapSegment={navToSource} hideNotebookId={hide} menu={rowMenu(note)} />)}
    </div>
  );

  return (
    <ScreenLayout utility={{
      title: drilledNbId ? drilledTitle : 'Notes',
      onBack: handleNavBack,
      backLabel: drilledNbId ? 'Back to Notebooks' : undefined,
      menu: barActions.length ? <BarMenu label={drilledNbId ? 'Notebook options' : 'Notes options'} onClick={() => setBarMenu(true)} /> : null,
    }}>
      <div className="notes-index-screen lib-screen">
        {backPill && (
          <div className="back-hint-row">
            <button
              className="back-hint-pill"
              onClick={() => { setBackPill(null); onBack(); }}
              aria-label={'Back to ' + backPill.title}
            >
              <span className="back-hint-lead"><span className="back-hint-arrow">‹</span>Back to</span>{' '}
              <span className="back-hint-title">{backPill.title}</span>
            </button>
          </div>
        )}
        {!drilledNbId && (
          <Segmented label="Notes view" className="lib-seg" value={tab}
            options={[{ id: 'all-notes', label: 'All notes' }, { id: 'notebooks', label: 'Notebooks' }]}
            onChange={(id) => setTab(/** @type {'notebooks' | 'all-notes'} */ (id))} />
        )}

        {/* ── ONE NOTEBOOK ── */}
        {drilledNbId && (
          <>
            {drilledNotes.length > 0 && <ListSearch placeholder="Search this notebook" value={searchQuery} onChange={setSearchQuery} />}
            {drilledNotes.length > 0 && <ListLine count={drilledNotesShown.length} of={drilledNotes.length} noun="note" sort={drilledSort} onSort={setDrilledSort} />}
            {drilledNotes.length === 0
              ? <EmptyState icon="journal" title="Nothing here yet"
                  text={drilledNbId === 'uncategorized' ? 'Notes that are not in a notebook collect here.' : 'Put a note here with Move to a notebook, in its menu.'}
                  action={{ label: 'All notes', onClick: () => { popDrill(); setTab('all-notes'); } }} />
              : drilledNotesShown.length === 0 ? noMatch : cards(drilledNotesShown, drilledNbId)}
            {drilledNbId === 'uncategorized' && drilledNotes.length > 0 && (
              <p className="lib-foot">Notes you have not filed stay here. Move one with its menu. A notebook you make can be renamed, recoloured, shared as text or deleted from the menu at the top.</p>
            )}
          </>
        )}

        {/* ── NOTEBOOKS ── */}
        {!drilledNbId && tab === 'notebooks' && (allNotes.length === 0 && notebooks.length === 0 ? emptyAll : (
          <>
            <ListGroup ariaLabel="Notebooks" className="lib-list">
              <ListRow one icon="note" title={NOT_IN_A_NOTEBOOK} value={countOf(counts.__uncategorized, 'note')} onClick={() => setDrilledNbId('uncategorized')} />
              {notebooks.map((nb) => (
                <ListRow key={nb.id} one title={nb.name} value={countOf(counts[nb.id] || 0, 'note')} onClick={() => setDrilledNbId(nb.id)}
                  lead={<span className="ui-row-lead" aria-hidden="true"><span className="lib-nb-dot" style={{ background: nb.color ? nbDotColour(nb.color) : 'var(--gold)' }} /></span>} />
              ))}
            </ListGroup>
            <UiButton wide icon="plus" className="lib-new" onClick={openNewNotebook}>New notebook</UiButton>
          </>
        ))}

        {/* ── ALL NOTES ── */}
        {!drilledNbId && tab === 'all-notes' && (allNotes.length === 0 ? emptyAll : (
          <>
            <ListSearch placeholder="Search notes" value={searchQuery} onChange={setSearchQuery} />
            <ListLine count={allNotesShown.length} of={allNotes.length} noun="note" sort={allNotesSort} onSort={setAllNotesSort} />
            {allNotesShown.length === 0 ? noMatch : cards(allNotesShown, undefined)}
          </>
        ))}
      </div>

      <ActionSheet open={barMenu} onClose={closeBarMenu} title={drilledNbId ? drilledTitle : 'Notes'} actions={barActions} portal />
      <ActionSheet open={!!noteMenu} onClose={closeNoteMenu} title={noteMenu ? noteHead(noteMenu) : ''}
        sub={noteMenu ? [noteSourceLabel(noteMenu), relativeDate(noteMenu.updated || noteMenu.created)].filter(Boolean).join(' · ') : ''}
        actions={noteMenu ? noteActions(noteMenu) : []} portal className="ui-row-sheet" />
      <ActionSheet open={!!noteToDelete} onClose={closeDelete} title="Delete this note?"
        confirm={{ label: 'Delete', danger: true, onConfirm: () => deleteNote(noteToDelete) }} portal>
        The note and the mark it sits on are removed from this phone.
      </ActionSheet>
      <ActionSheet open={nbSheet === 'new' || nbSheet === 'rename'} onClose={closeNbSheet}
        title={nbSheet === 'rename' ? 'Rename notebook' : 'New notebook'}
        confirm={{ label: nbSheet === 'rename' ? 'Save' : 'Create', onConfirm: nbSheet === 'rename' ? commitRename : createNotebook, disabled: !nbName.trim() }} portal>
        <label className="ui-field is-square lib-name">
          <input type="text" autoFocus value={nbName} placeholder="Notebook name" aria-label="Notebook name" maxLength={60}
            onChange={(e) => { setNbName(e.target.value); setNameTaken(''); }} />
        </label>
        {nameTaken ? <p className="lib-taken" role="alert">Another notebook is already called {nameTaken}.</p> : null}
        {nbSheet === 'new' ? (<><div className="lib-colour-label">Colour</div><ColourDots value={nbColour} onPick={setNbColour} /></>) : null}
      </ActionSheet>
      <ActionSheet open={nbSheet === 'colour'} onClose={closeNbSheet} title="Colour" sub={drilledTitle} portal>
        <ColourDots value={drilledNb ? drilledNb.color || null : null}
          onPick={(c) => { if (drilledNb) NotebookStore.setColor(drilledNb.id, c); closeNbSheet(); }} />
      </ActionSheet>
      <ActionSheet open={nbSheet === 'delete'} onClose={closeNbSheet} title={'Delete “' + drilledTitle + '”?'}
        confirm={{ label: 'Delete', danger: true, onConfirm: deleteCurrent }} portal>
        Its notes stay, in {NOT_IN_A_NOTEBOOK}.
      </ActionSheet>
    </ScreenLayout>
  );
}
