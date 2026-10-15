/* NotesScreen - the Notes tab (zv1; pictures 3c-notes, 3d-notes-journal, 8c-notes-empty).

   Everything the reader marked, newest first, under six chips with Journal second, and "+ Journal entry" in the top bar
   (Corbin 10-14 17:4x asked how to reach his journal: it is in plain view, one tap from the tab). A real boot reads main's
   stores read only (notes-facts.js readMarks); a gate boot shows the seeded marks. */
import { Icon } from '../Icon.jsx';
import { definePlace } from '../places.js';
import { GATE_NOW } from '../gate.js';
import { askVotCorpus, askAudioSyncSections } from '../corpus.js';
import { KINDS, LEDES, EMPTY, EMPTY_ALL, kindOf, marksOfKind, metaLine, readMarks } from '../notes-facts.js';

/** @param {{ mark: import('../notes-facts.js').Mark, now: number, onOpen: (m: any) => void }} props */
function MarkRow({ mark: m, now, onOpen }) {
  const open = m.open ? () => onOpen(m.open) : undefined;
  const keys = open ? { role: 'button', tabIndex: 0, onClick: open,
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } } : {};
  let body;
  if (m.kind === 'highlight') {
    body = <div className="mq"><span className={'hl ' + (m.colour || 'gold')}>{m.text}</span></div>;
  } else if (m.kind === 'note') {
    body = <>{m.quote ? <div className="mq">{m.quote}</div> : null}{m.note ? <div className="mn">{m.note}</div> : null}</>;
  } else {
    const icon = m.kind === 'journal' ? 'journal' : m.kind === 'bookmark' ? 'bm' : 'link';
    body = <><div className="mt"><Icon name={icon} on={m.kind === 'bookmark'} />{m.title}</div>{m.text ? <div className="mx">{m.text}</div> : null}</>;
  }
  return <div className="mark" {...keys}>{body}<div className="mm">{metaLine(m, now)}</div></div>;
}

/** What Notes shows, and whether the letters behind some titles are still loading. */
function useMarks(gate) {
  const [state, setState] = React.useState(() => (gate ? { marks: (gate.facts && gate.facts.marks) || [], pending: false } : readMarks()));
  const waiting = state.pending;
  React.useEffect(() => {
    if (!waiting) return undefined;
    let live = true;
    const settle = () => { if (live) setState({ marks: readMarks().marks, pending: false }); };
    // the letters, and a compilation's timings (its first entry), each load on their own; one wait, then the rows as they are
    Promise.all([askVotCorpus(), askAudioSyncSections()].map((p) => p.catch(() => undefined))).then(settle, settle);
    return () => { live = false; };
  }, [waiting]);
  return state;
}

/** @param {import('../places.js').PlaceProps} props */
export function NotesScreen({ route, gate, go, replace, onReady }) {
  const kind = kindOf(route.kind);
  const { marks, pending } = useMarks(gate);
  const now = gate ? ((gate.facts && gate.facts.now) || GATE_NOW) : Date.now();
  const rows = marksOfKind(marks, kind);
  React.useEffect(() => { if (!pending) onReady(); }, [onReady, pending, kind]);
  const newEntry = () => go({ place: 'journal-entry' });
  const head = (
    <div className="page-head g tabroot">
      <h1 className="display">Notes</h1>
      <p className="lede">{LEDES[kind]}</p>
    </div>
  );
  if (!marks.length) {
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
      {rows.length ? (
        <div className="g marks">
          {rows.map((m) => <MarkRow key={m.id} mark={m} now={now} onOpen={(r) => go(r)} />)}
        </div>
      ) : (
        <div className="g">
          <div className="empty">
            <div className="t">{EMPTY[kind]}</div>
            {kind === 'journal' ? <button type="button" className="btn2" onClick={newEntry}><Icon name="pen" />New journal entry</button> : null}
          </div>
        </div>
      )}
    </>
  );
}

/** The top bar on Notes: "+ Journal entry" in words (one tap) and More (Settings). */
function NotesActions({ go }) {
  return (
    <>
      <button type="button" className="btn2 sm tbj" onClick={() => go({ place: 'journal-entry' })}><Icon name="plus" />Journal entry</button>
      <button type="button" className="ic" aria-label="More" onClick={() => go({ place: 'settings' })}><Icon name="more" /></button>
    </>
  );
}

definePlace('notes', {
  Screen: NotesScreen,
  title: () => 'Notes',
  actions: ({ go }) => <NotesActions go={go} />,
});
