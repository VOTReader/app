/* NoteEditor - the note on a letter paragraph (4b's "Add a note"), as design's 3m draws it (dz20): the place, the
   paragraph's words quoted, the note written on the page (the journal's borderless .jp field, notes.css), and under it
   the note's notebooks (Notebooks.jsx NoteNotebooks: "Add to a notebook" or "In Sabbath study, Prophecy", opening the
   sheet that ticks them). Its ... (3q, dz26) holds what the page lacks: Share (main's text: the passage, the note, its
   reference and link) and Delete note (at once: Back to the page it came from, whose toast says "Note deleted." with
   Undo).

   It writes main's own NoteStore record through marks.js saveNote, on the paragraph's mark (made at main's note default
   when the paragraph has none), so the note shows in main too and nothing is migrated. Nothing is written until there
   are words; then it saves as the reader types (half a second after the last key) and once more on leaving, so Back
   and Android's Back never lose words. A gate boot never writes. */
import { definePlace, defineOverlay } from '../places.js';
import { saveNote, noteShareText, deleteNote } from '../marks.js';
import { placeOfKey } from '../notes-facts.js';
import { useVotCorpus } from '../corpus.js';
import { LayerToast } from '../Sheet.jsx';
import { MoreButton } from '../more-menu.jsx';
import { shareText } from '../../utils/copy-share.js';
import { GrowField, useGrowEpoch } from './JournalEditor.jsx';
import { NoteNotebooks } from './Notebooks.jsx';
import { UNDO_MS } from './LetterScreen.jsx';

const g = /** @type {any} */ (globalThis);
const SAVE_AFTER_MS = 500;
const TOAST_MS = 2600;
/** Keys whose place is named from the letters' corpus (lazy). */
const LETTER_KEY = /^(letter|wtlb|blessed|holy-days):/;

/**
 * The note page on screen, for its ... (the page and its top bar are apart; only the top page is mounted): `save`
 * writes its words now and returns its groupId; `close` does that and stops every later write (Delete note).
 * @type {null | { save: () => string | null, close: () => string | null }}
 */
let editor = null;

/** "Note deleted." and its Undo, said on the page Delete note went back to (the shell's overlay below draws it). */
let parting = /** @type {null | { text: string, act: string, onAct: () => void }} */ (null);
let partingVer = 0;
const partingSubs = new Set();
const partingToast = {
  get: () => parting,
  /** @param {typeof parting} t */
  set(t) { parting = t; partingVer += 1; partingSubs.forEach((cb) => cb()); },
  subscribe(cb) { partingSubs.add(cb); return () => { partingSubs.delete(cb); }; },
  version: () => partingVer,
};

/**
 * The note's words: main's record, or a gate boot's seed (its note mark by groupId).
 * @param {any} gate @param {string | null | undefined} gid
 */
function wordsOf(gate, gid) {
  if (!gid) return '';
  if (gate) {
    const m = ((gate.facts && gate.facts.marks) || []).find((x) => x.kind === 'note' && x.gid === gid);
    return m && typeof m.note === 'string' ? m.note : '';
  }
  const note = g.NoteStore ? g.NoteStore.get(gid) : null;
  return note && typeof note.body === 'string' ? note.body : '';
}

/**
 * route: { place: 'note', key, start, end, text, groupId } (LetterScreen's Add a note: the paragraph and its mark, if any)
 * @param {{ route: Record<string, any>, gate: import('../gate.js').GateState | null, desktop?: boolean, onReady: () => void }} props
 */
export function NoteEditor({ route, gate, desktop = false, onReady }) {
  const [body, setBody] = React.useState(() => wordsOf(gate, route.groupId));
  const [gid, setGid] = React.useState(/** @type {string | null} */ (route.groupId || null));
  const target = React.useRef({ key: route.key, start: route.start, end: route.end, text: route.text || '', groupId: route.groupId || null });
  const latest = React.useRef({ body, dirty: false, gone: false });
  latest.current.body = body;
  const rootRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const epoch = useGrowEpoch(rootRef);

  /** Writes the words now if they changed; returns the note's groupId (null while it has none). */
  const save = React.useCallback(() => {
    const cur = latest.current;
    if (gate || cur.gone || !cur.dirty) return target.current.groupId;
    if (!target.current.groupId && !cur.body.trim()) return null;
    target.current.groupId = saveNote(target.current, cur.body);
    cur.dirty = false;
    setGid(target.current.groupId);
    return target.current.groupId;
  }, [gate]);

  React.useEffect(() => {
    if (!latest.current.dirty) return undefined;
    const t = setTimeout(save, SAVE_AFTER_MS);
    return () => clearTimeout(t);
  }, [body, save]);
  React.useEffect(() => () => { save(); }, [save]);
  React.useEffect(() => {
    const me = { save, close: () => { const id = save(); latest.current.gone = true; return id; } };
    editor = me;
    return () => { if (editor === me) editor = null; };
  }, [save]);

  // The place over the words ("Volume One · Letter 5 · Humility and The Word of God"), once the letters are here.
  const needsLetters = LETTER_KEY.test(String(route.key || ''));
  const corpus = useVotCorpus(needsLetters);
  const place = placeOfKey(route.key, g);
  const where = place.pending || !place.where ? '' : [place.where, place.title === place.where ? '' : place.title].filter(Boolean).join(' · ');
  React.useEffect(() => {
    if (!(needsLetters && corpus === 'loading')) onReady();
  }, [onReady, needsLetters, corpus]);

  return (
    <div className="g jed" ref={rootRef}>
      {where ? <p className="mm jdate">{where}</p> : null}
      <blockquote className="nq">{route.text}</blockquote>
      <GrowField className="jp" placeholder="Write your note" aria-label="Note" autoFocus={!gate} epoch={epoch} value={body}
        onChange={(e) => { latest.current.dirty = true; setBody(e.target.value); }} />
      <NoteNotebooks gate={gate} groupId={gid} hasWords={!!body.trim()} ensure={save} desktop={desktop} />
    </div>
  );
}

/**
 * The note page's ... (3q): Share (main's text through the share sheet, else copied, with main's words) and Delete note
 * (the note and its highlight at once, then Back; the page there says "Note deleted." with Undo). Titled with the
 * passage's name. A gate boot draws it and does nothing.
 * @param {{ route: any, gate?: any, desktop: boolean, pop?: () => void }} props
 */
function NoteMore({ route, gate = null, desktop, pop }) {
  useVotCorpus(false);
  const [toast, setToast] = React.useState(/** @type {string | null} */ (null));
  React.useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  const place = placeOfKey(route.key, g);
  const groupId = () => (editor ? editor.save() : route.groupId || null);
  const share = () => {
    if (gate) return;
    shareText(noteShareText(groupId(), route)).then((outcome) => {
      if (outcome === 'copied-instead') setToast('Copied instead. Paste the note where you want to share it.');
      else if (outcome === 'failed') setToast('Couldn\'t share or copy. Select the note\'s text to copy it by hand.');
    });
  };
  const remove = () => {
    if (gate) return;
    const id = editor ? editor.close() : route.groupId || null;
    const undo = deleteNote(id);
    if (undo) partingToast.set({ text: 'Note deleted.', act: 'Undo', onAct: () => { undo(); partingToast.set(null); } });
    if (pop) pop();
  };
  return (
    <>
      <MoreButton title={(!place.pending && place.title) || 'Note'} desktop={desktop} gate={gate} items={[
        { id: 'share', icon: 'share', t: 'Share', s: 'The passage, your note and a link', run: share },
        { id: 'delete', icon: 'trash', t: 'Delete note', run: remove },
      ]} />
      <LayerToast text={toast} />
    </>
  );
}

/** The shell's overlay: Delete note's toast on the page it went back to, gone by itself unless replaced first. */
function NoteDeletedOverlay({ gate }) {
  const ver = React.useSyncExternalStore(partingToast.subscribe, partingToast.version);
  const toast = gate ? null : partingToast.get();
  React.useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => { if (partingToast.get() === toast) partingToast.set(null); }, UNDO_MS);
    return () => clearTimeout(t);
  }, [toast, ver]);
  return <LayerToast text={toast ? toast.text : null} act={toast ? toast.act : undefined} onAct={toast ? toast.onAct : undefined} />;
}

definePlace('note', {
  Screen: NoteEditor,
  title: () => 'Note',
  barTitle: () => 'Note',
  actions: ({ route, gate, desktop, pop }) => <NoteMore route={route} gate={gate} desktop={desktop} pop={pop} />,
});
defineOverlay('note-deleted', NoteDeletedOverlay);
