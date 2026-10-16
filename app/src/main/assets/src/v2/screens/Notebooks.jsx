/* Notebooks - main's notebooks in v2 (mw9d, design dz20 3i-3l; main's NotesIndexScreen): the cards on the Notes chip
   (3i: Uncategorized first, the notebooks in main's order, a dashed "+ New notebook"), a notebook's own page (3j: its dot
   and name, its notes newest or oldest first), its ... (3k: Share as text, Rename or recolour, Delete notebook at once
   with Undo; Uncategorized shares only) and the New notebook / Rename or recolour sheet (3l: the name, at most 60
   characters, and v2's five swatches as main's colour ids). Everything reads and writes main's NotebookStore and
   NoteStore (notebook-facts.js), live: a change anywhere draws again here. A gate boot shows its seeds and writes
   nothing. */
import { Icon } from '../Icon.jsx';
import { Sheet, LayerToast } from '../Sheet.jsx';
import { definePlace } from '../places.js';
import { GATE_NOW } from '../gate.js';
import { MoreButton } from '../more-menu.jsx';
import { shareText } from '../../utils/copy-share.js';
import { MarkRow, useMarks } from './MarkList.jsx';
import {
  UNCATEGORIZED, NAME_MAX, swatchOf, swatchesFor, noteCount, canName, readNotebooks, readMemberships, notebookCards,
  notesIn, emptyWords, shareTextOf, deleteNotebook,
} from '../notebook-facts.js';

const g = /** @type {any} */ (globalThis);
const TOAST_MS = 2600;

/** Draws again whenever main's notebooks or notes change (CachedStore's subscribe + getVersion). */
function useNotebookStores(gate) {
  const B = gate ? null : g.NotebookStore;
  const N = gate ? null : g.NoteStore;
  const subB = React.useCallback((cb) => (B && B.subscribe ? B.subscribe(cb) : () => {}), [B]);
  const subN = React.useCallback((cb) => (N && N.subscribe ? N.subscribe(cb) : () => {}), [N]);
  React.useSyncExternalStore(subB, () => (B && B.getVersion ? B.getVersion() : 0));
  React.useSyncExternalStore(subN, () => (N && N.getVersion ? N.getVersion() : 0));
}

/**
 * The notebooks, and each note's notebooks: main's stores, or a gate boot's seeds (facts.notebooks, the note marks' nb).
 * @param {any} gate @param {import('../notes-facts.js').Mark[]} marks
 */
function useNotebooks(gate, marks) {
  useNotebookStores(gate);
  if (gate) {
    const f = gate.facts || {};
    return { notebooks: f.notebooks || [], memberships: marks.filter((m) => m.kind === 'note').map((m) => m.nb || []) };
  }
  return { notebooks: readNotebooks(), memberships: readMemberships() };
}

/** A notebook's dot: v2's swatch colour, main's own colour by its hex, or Uncategorized's hollow ring. */
function Dot({ color, un = false }) {
  if (un) return <span className="nbdot un" />;
  const s = swatchOf(color);
  return s.hex ? <span className="nbdot" style={/** @type {any} */ ({ '--nbc': s.hex })} /> : <span className={'nbdot ' + s.id} />;
}

/* Delete notebook's Undo toast, handed to the Notes page it returns to (only the top page is mounted). */
let parting = /** @type {null | { text: string, act: string, onAct: () => void, ms: number }} */ (null);
/** Notes takes the toast once, as it mounts. */
export function takeParting() {
  const p = parting;
  parting = null;
  return p;
}

/** A notebook page's order, for its ... to share in the same order (the page and its top bar are apart). */
const orders = new Map();

/**
 * New notebook (3l) or, given `notebook`, Rename or recolour: the name (focused, main's 60 at most) and the colour, one
 * of v2's five or the notebook's own main colour. Create and Save wait for a letter. `seed` is a gate boot's form.
 * @param {{ desktop?: boolean, gate?: any, notebook?: { id: string, name: string, color: string | null } | null,
 *   seed?: { name?: string, color?: string | null } | null, onDone: (nb: any) => void, onClose: () => void }} props
 */
export function NotebookSheet({ desktop = false, gate = null, notebook = null, seed = null, onDone, onClose }) {
  const edit = !!notebook;
  const [name, setName] = React.useState(seed && seed.name != null ? seed.name : notebook ? notebook.name : '');
  const [color, setColor] = React.useState(/** @type {string | null} */ (seed && seed.color !== undefined ? seed.color
    : notebook ? notebook.color : null));
  const inputRef = React.useRef(/** @type {HTMLInputElement | null} */ (null));
  React.useEffect(() => {
    if (gate) return undefined;
    const t = setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 50);
    return () => clearTimeout(t);
  }, [gate]);
  const ok = canName(name);
  const save = () => {
    if (gate || !ok) return;
    const B = g.NotebookStore;
    if (!B) return;
    const clean = name.trim().slice(0, NAME_MAX);
    let nb;
    if (edit && notebook) {
      if (clean !== notebook.name) B.rename(notebook.id, clean);
      if ((color || null) !== (notebook.color || null)) B.setColor(notebook.id, color);
      nb = B.get(notebook.id);
    } else {
      const had = new Set(readNotebooks().map((n) => n.id));
      nb = B.add(clean);   // main's: a name it already has returns that notebook
      if (nb && color && !had.has(nb.id)) B.setColor(nb.id, color);
    }
    onDone(nb);
  };
  const on = swatchOf(color).id;
  const title = edit ? 'Rename or recolour' : 'New notebook';
  return (
    <Sheet kind="nbs" label={title} desktop={desktop} closeX onClose={onClose}>
      <div className="sh">{title}</div>
      <div className={'field' + (gate ? ' focus' : '')}>
        <input ref={inputRef} className="q" type="text" value={name} maxLength={NAME_MAX} aria-label="Notebook name"
          placeholder="Notebook name" autoComplete="off" enterKeyHint="done"
          onChange={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
      </div>
      <span className="label nbl2">Colour</span>
      <div className="swatches" role="radiogroup" aria-label="Notebook colour">
        {swatchesFor(notebook ? notebook.color : null).map((s) => (
          <button key={s.id} type="button" className={'swatch ' + (s.hex ? 'own' : s.id) + (s.id === on ? ' on' : '')} role="radio"
            aria-checked={s.id === on} aria-label={s.label} style={s.hex ? { background: s.hex } : undefined}
            onClick={() => setColor(s.main)} />
        ))}
      </div>
      <button type="button" className="pill block" disabled={!ok} onClick={save}>
        <span>{edit ? 'Save' : 'Create notebook'}</span>{edit ? null : <Icon name="check" />}
      </button>
    </Sheet>
  );
}

/**
 * The Notes chip's notebooks (3i): "Notebooks", the cards (with no notebooks, only New notebook), then the notes' label.
 * @param {{ gate: any, marks: import('../notes-facts.js').Mark[], desktop?: boolean, go: (r: any) => void, listed: boolean }} props
 */
export function NotebookCards({ gate, marks, desktop = false, go, listed }) {
  const { notebooks, memberships } = useNotebooks(gate, marks);
  const gateNew = gate && gate.open && gate.open.sheet === 'notebook-new' ? gate.open.form || {} : null;
  const [making, setMaking] = React.useState(/** @type {any} */ (gateNew));
  const cards = notebookCards(notebooks, memberships);
  return (
    <div className="g">
      <span className="label nbl">Notebooks</span>
      <div className="nbg">
        {cards.map((c) => (
          <button key={c.id} type="button" className="nbc" onClick={() => { if (!gate) go({ place: 'notebook', id: c.id }); }}>
            <span className="nbn">{c.name}</span>
            <span className="nbk"><Dot color={c.color} un={c.id === UNCATEGORIZED} />{noteCount(c.count)}</span>
          </button>
        ))}
        <button type="button" className="nbc nbnew" onClick={() => { if (!gate) setMaking({}); }}><Icon name="plus" />New notebook</button>
      </div>
      {listed && <span className="label nbl">All notes · newest first</span>}
      {making && (
        <NotebookSheet desktop={desktop} gate={gate} seed={making} onDone={() => setMaking(null)} onClose={() => setMaking(null)} />
      )}
    </div>
  );
}

const NO_MARKS = /** @type {import('../notes-facts.js').Mark[]} */ ([]);

/**
 * A note's notebooks on its own page (3m): the row under its words ("Add to a notebook", or "In Sabbath study,
 * Prophecy" in main's order) and the sheet it opens: the notebooks with a checkbox each, a tap saving at once through
 * main's NoteStore.toggleNotebook (a note can sit in more than one; in none it is Uncategorized, which is no choice
 * here), "+ New notebook" (3l's sheet, then back here with it ticked) and Done. Main's toggle needs the note, so the row
 * waits for words and opening the sheet saves them first (`ensure`). A gate boot shows its seeds and writes nothing.
 * @param {{ gate: any, groupId: string | null, hasWords: boolean, ensure: () => string | null, desktop?: boolean }} props
 *   groupId the note's, null until it is saved; ensure saves the note now and returns its groupId (null with no words)
 */
export function NoteNotebooks({ gate, groupId, hasWords, ensure, desktop = false }) {
  const marks = gate ? (gate.facts && gate.facts.marks) || NO_MARKS : NO_MARKS;
  const { notebooks, memberships } = useNotebooks(gate, marks);
  const [open, setOpen] = React.useState(!!(gate && gate.open && gate.open.sheet === 'notebook-pick'));
  const [making, setMaking] = React.useState(false);
  const idsOf = (gid) => {
    if (!gid) return [];
    if (gate) {
      const m = marks.find((x) => x.kind === 'note' && x.gid === gid);
      return (m && m.nb) || [];
    }
    const n = g.NoteStore && g.NoteStore.get(gid);
    return n && Array.isArray(n.notebookIds) ? n.notebookIds : [];
  };
  const ids = idsOf(groupId);
  if (!groupId && !hasWords) return null;
  const names = notebooks.filter((nb) => ids.includes(nb.id)).map((nb) => nb.name);
  const count = (id) => memberships.filter((m) => m.includes(id)).length;
  const toggle = (id) => {
    if (gate || !g.NoteStore) return;
    const gid = ensure();
    if (gid) g.NoteStore.toggleNotebook(gid, id);
  };
  const show = () => {
    if (gate || ensure()) setOpen(true);
  };
  const made = (nb) => {
    setMaking(false);
    const gid = nb && ensure();
    if (gid && !idsOf(gid).includes(nb.id)) g.NoteStore.toggleNotebook(gid, nb.id);
  };
  return (
    <>
      <button type="button" className="nbin" onClick={show}>
        <Icon name="notebook" /><span>{names.length ? 'In ' + names.join(', ') : 'Add to a notebook'}</span>
        <Icon name="chev" className="go" />
      </button>
      {open && !making && (
        <Sheet kind="nbp" label="Add to a notebook" scrim="light" desktop={desktop} closeX onClose={() => setOpen(false)}>
          <div className="sh">Add to a notebook</div>
          <p className="nbpn">A note can sit in more than one.</p>
          <div className="opts">
            {notebooks.map((nb) => {
              const on = ids.includes(nb.id);
              return (
                <button key={nb.id} type="button" className="srow opt nbr" role="checkbox" aria-checked={on} onClick={() => toggle(nb.id)}>
                  <Dot color={nb.color} />
                  <span className="tx"><span className="t">{nb.name}</span><span className="s">{noteCount(count(nb.id))}</span></span>
                  <span className={on ? 'cbx on' : 'cbx'}>{on ? <Icon name="check" /> : null}</span>
                </button>
              );
            })}
            <button type="button" className="srow opt nbr nbadd" onClick={() => { if (!gate) setMaking(true); }}>
              <span className="lead"><Icon name="plus" /></span><span className="tx"><span className="t">New notebook</span></span>
            </button>
          </div>
          <button type="button" className="pill block done" onClick={() => setOpen(false)}><span>Done</span><Icon name="check" /></button>
        </Sheet>
      )}
      {making && <NotebookSheet desktop={desktop} onDone={made} onClose={() => setMaking(false)} />}
    </>
  );
}

/** A notebook by id: main's (or the gate's), or Uncategorized. @param {string} id @param {any[]} notebooks */
function findNotebook(id, notebooks) {
  return id === UNCATEGORIZED ? { id, name: 'Uncategorized', color: null } : notebooks.find((n) => n.id === id) || null;
}

/** A notebook's page (3j). @param {import('../places.js').PlaceProps} props */
export function NotebookScreen({ route, gate, go, onReady }) {
  const { marks, pending } = useMarks(gate);
  const { notebooks } = useNotebooks(gate, marks);
  const [order, setOrder] = React.useState(/** @type {'newest' | 'oldest'} */ (orders.get(route.id) || 'newest'));
  React.useEffect(() => { orders.set(route.id, order); }, [route.id, order]);
  React.useEffect(() => { if (!pending) onReady(); }, [onReady, pending]);
  const nb = findNotebook(route.id, notebooks);
  if (!nb) {
    return <div className="g"><div className="empty"><div className="t">This notebook was deleted.</div></div></div>;
  }
  const now = gate ? ((gate.facts && gate.facts.now) || GATE_NOW) : Date.now();
  const notes = notesIn(marks.filter((m) => m.kind === 'note'), nb.id, order);
  const newest = order === 'newest';
  return (
    <>
      <div className="page-head g">
        <span className="overline eyebrow nbo"><Dot color={nb.color} un={nb.id === UNCATEGORIZED} />Notebook</span>
        <h1 className="display">{nb.name}</h1>
      </div>
      <div className="g nbbar">
        <span className="nbct">{noteCount(notes.length)}</span>
        <button type="button" className="nbsort" aria-label={newest ? 'Order: tap for oldest first' : 'Order: tap for newest first'}
          onClick={() => setOrder(newest ? 'oldest' : 'newest')}><Icon name="sort" />{newest ? 'Newest first' : 'Oldest first'}</button>
      </div>
      {notes.length ? (
        <div className="g marks nbm">
          {notes.map((m) => <MarkRow key={m.id} mark={m} now={now} onOpen={(r) => go(r)} />)}
        </div>
      ) : (
        <div className="g"><div className="empty"><div className="t">{emptyWords(nb.id)}</div></div></div>
      )}
    </>
  );
}

/** "Its 4 notes as one message" / "Its note ..." @param {number} n @param {string} one @param {string} many */
const its = (n, one, many) => (n === 1 ? 'Its note ' + one : 'Its ' + noteCount(n) + ' ' + many);

/**
 * The notebook page's ... (3k): Share as text (main's text, the page's order), Rename or recolour (3l's sheet), Delete
 * notebook (at once; back to Notes, whose toast holds the Undo). Uncategorized's holds Share as text only.
 * @param {{ route: any, gate?: any, desktop: boolean, pop?: () => void }} props
 */
function NotebookMore({ route, gate = null, desktop, pop }) {
  useNotebookStores(gate);
  const [editing, setEditing] = React.useState(false);
  const [toast, setToast] = React.useState(/** @type {string | null} */ (null));
  React.useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  const f = gate ? gate.facts || {} : null;
  const nb = findNotebook(route.id, f ? f.notebooks || [] : readNotebooks());
  if (!nb) return null;
  const uncat = nb.id === UNCATEGORIZED;
  // the notes in it, in the page's order: { at, nb, gid } from main's NoteStore (a gate's from its marks)
  const N = g.NoteStore;
  const all = f ? (f.marks || []).filter((m) => m.kind === 'note')
    : Object.values((N && N.all && N.all()) || {}).filter(Boolean)
      .map((n) => ({ at: n.updated || n.created || 0, nb: n.notebookIds || [], gid: n.groupId }));
  const inIt = notesIn(all, nb.id, orders.get(nb.id) || 'newest');
  const n = inIt.length;
  const share = () => {
    const text = shareTextOf(nb.name, inIt.map((m) => m.gid));
    if (!text) { setToast('Not ready yet. Try again in a moment.'); return; }
    shareText(text).then((outcome) => {
      if (outcome === 'copied-instead') setToast('Copied instead. Paste the notes where you want to share them.');
      else if (outcome === 'failed') setToast('Couldn\'t share or copy. Try again.');
    });
  };
  const remove = () => {
    const undo = deleteNotebook(nb.id);
    if (!undo) return;
    parting = { text: 'Deleted ' + nb.name + '. Its notes are in Uncategorized.', act: 'Undo', onAct: undo, ms: 6000 };
    if (pop) pop();
  };
  return (
    <>
      <MoreButton title={nb.name} desktop={desktop} gate={gate} items={[
        { id: 'share', icon: 'share', t: 'Share as text', s: n ? its(n, 'as one message', 'as one message') : undefined, run: share },
        uncat ? null : { id: 'edit', icon: 'pen', t: 'Rename or recolour', run: () => setEditing(true) },
        uncat ? null : { id: 'delete', icon: 'trash', t: 'Delete notebook',
          s: n ? its(n, 'moves to Uncategorized', 'move to Uncategorized') : undefined, run: remove },
      ]} />
      {editing && <NotebookSheet desktop={desktop} notebook={nb} onDone={() => setEditing(false)} onClose={() => setEditing(false)} />}
      <LayerToast text={toast} />
    </>
  );
}

/** A notebook's name, for Back's label on a page opened from it. @param {any} r */
function notebookTitle(r) {
  if (r.id === UNCATEGORIZED) return 'Uncategorized';
  const nb = readNotebooks().find((x) => x.id === r.id);
  return nb ? nb.name : 'Notebook';
}

definePlace('notebook', {
  Screen: NotebookScreen,
  title: notebookTitle,
  barTitle: () => 'Notes',
  actions: ({ route, gate, desktop, pop }) => <NotebookMore route={route} gate={gate} desktop={desktop} pop={pop} />,
});
