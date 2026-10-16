/* NotesScreen - the Notes tab (zv1; pictures 3c-notes, 3d-notes-journal, 8c-notes-empty, 3i-notes-notebooks).

   Everything the reader marked, newest first, under six chips with Journal second, and "+ Journal entry" in the top bar
   (Corbin 10-14 17:4x asked how to reach his journal: it is in plain view, one tap from the tab). The Notes chip leads
   with main's notebooks (Notebooks.jsx, mw9d). A real boot reads main's stores read only (notes-facts.js readMarks); a
   gate boot shows the seeded marks. A notebook deleted on its page comes back here with its Undo. */
import { Icon } from '../Icon.jsx';
import { definePlace } from '../places.js';
import { GATE_NOW, readGateId } from '../gate.js';
import { firstSaveWaits } from '../safari-gate.js';
import { LayerToast } from '../Sheet.jsx';
import { KINDS, LEDES, EMPTY, EMPTY_ALL, kindOf, marksOfKind } from '../notes-facts.js';
import { MarkRow, useMarks } from './MarkList.jsx';
import { NotebookCards, takeParting } from './Notebooks.jsx';
import { readNotebooks } from '../notebook-facts.js';

/** @param {import('../places.js').PlaceProps} props */
export function NotesScreen({ route, gate, desktop, go, replace, onReady }) {
  const kind = kindOf(route.kind);
  const { marks, pending } = useMarks(gate);
  const now = gate ? ((gate.facts && gate.facts.now) || GATE_NOW) : Date.now();
  const rows = marksOfKind(marks, kind);
  React.useEffect(() => { if (!pending) onReady(); }, [onReady, pending, kind]);
  const newEntry = () => newJournalEntry(go, !gate);
  // Delete notebook's Undo (its page has gone: only the top page is mounted)
  const [toast, setToast] = React.useState(() => (gate ? null : takeParting()));
  React.useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), toast.ms || 6000);
    return () => clearTimeout(t);
  }, [toast]);
  const toastEl = toast ? <LayerToast text={toast.text} act={toast.act} onAct={() => { setToast(null); if (toast.onAct) toast.onAct(); }} /> : null;
  const head = (
    <div className="page-head g tabroot">
      <h1 className="display">Notes</h1>
      <p className="lede">{LEDES[kind]}</p>
    </div>
  );
  // the tab is empty only with nothing marked and no notebook (a notebook is the reader's too, even with no notes in it)
  const books = kind === 'note';
  const anyBook = gate ? !!(gate.facts && gate.facts.notebooks && gate.facts.notebooks.length) : readNotebooks().length > 0;
  if (!marks.length && !anyBook) {
    return (
      <>
        {head}
        <div className="g">
          <div className="empty">
            <div className="ei"><Icon name="bookmark" /></div>
            <div className="t">{EMPTY_ALL.title}</div>
            <div className="s">{EMPTY_ALL.text}</div>
            <button type="button" className="btn2" onClick={newEntry}><Icon name="pen" />New journal entry</button>
          </div>
        </div>
        {toastEl}
      </>
    );
  }
  return (
    <>
      {head}
      <div className="g">
        <div className="chips kinds" role="group" aria-label="Show">
          {KINDS.map((k) => (
            <button key={k.id} type="button" className={'chip' + (k.id === kind ? ' on' : '')} aria-pressed={k.id === kind}
              onClick={() => { if (k.id !== kind) replace({ place: 'notes', kind: k.id }); }}>{k.label}</button>
          ))}
        </div>
      </div>
      {books && <NotebookCards gate={gate} marks={marks} desktop={desktop} go={go} listed={rows.length > 0} />}
      {rows.length ? (
        <div className={'g marks' + (books ? ' nbm' : '')}>
          {rows.map((m) => <MarkRow key={m.id} mark={m} now={now} onOpen={(r) => go(r)} />)}
        </div>
      ) : (
        <div className="g">
          <div className="empty">
            <div className="t">{EMPTY[kind] || EMPTY_ALL.title}</div>
            {kind === 'journal' ? <button type="button" className="btn2" onClick={newEntry}><Icon name="pen" />New journal entry</button> : null}
          </div>
        </div>
      )}
      {toastEl}
    </>
  );
}

/**
 * A new journal entry, as main's createAndEditJournal: the first save of a session in a Safari tab waits on the 7-day
 * notice (safari-gate.js; the shell draws it) and the tap opens nothing; after "Got it" the next tap opens the editor.
 * Never asked on a gate boot. @param {(r: any) => void} go @param {boolean} live
 */
function newJournalEntry(go, live) {
  if (live && firstSaveWaits()) return;
  go({ place: 'journal-entry' });
}

/** The top bar on Notes: "+ Journal entry" in words (one tap) and More (Settings). */
function NotesActions({ go }) {
  return (
    <>
      <button type="button" className="btn2 sm tbj" onClick={() => newJournalEntry(go, !readGateId())}><Icon name="plus" />Journal entry</button>
      <button type="button" className="ic" aria-label="More" onClick={() => go({ place: 'settings' })}><Icon name="more" /></button>
    </>
  );
}

definePlace('notes', {
  Screen: NotesScreen,
  title: () => 'Notes',
  actions: ({ go }) => <NotesActions go={go} />,
});
