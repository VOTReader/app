/* NoteEditor - the note on a letter paragraph (4b's "Add a note"), as design's 3m draws it (dz20): the place, the
   paragraph's words quoted, the note written on the page (the journal's borderless .jp field, notes.css), and under it
   the note's notebooks (Notebooks.jsx NoteNotebooks: "Add to a notebook" or "In Sabbath study, Prophecy", opening the
   sheet that ticks them).

   It writes main's own NoteStore record through marks.js saveNote, on the paragraph's mark (made at main's note default
   when the paragraph has none), so the note shows in main too and nothing is migrated. Nothing is written until there
   are words; then it saves as the reader types (half a second after the last key) and once more on leaving, so Back
   and Android's Back never lose words. A gate boot never writes. */
import { definePlace } from '../places.js';
import { saveNote } from '../marks.js';
import { placeOfKey } from '../notes-facts.js';
import { useVotCorpus } from '../corpus.js';
import { GrowField, useGrowEpoch } from './JournalEditor.jsx';
import { NoteNotebooks } from './Notebooks.jsx';

const g = /** @type {any} */ (globalThis);
const SAVE_AFTER_MS = 500;
/** Keys whose place is named from the letters' corpus (lazy). */
const LETTER_KEY = /^(letter|wtlb|blessed|holy-days):/;

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
  const latest = React.useRef({ body, dirty: false });
  latest.current.body = body;
  const rootRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const epoch = useGrowEpoch(rootRef);

  /** Writes the words now if they changed; returns the note's groupId (null while it has none). */
  const save = React.useCallback(() => {
    const cur = latest.current;
    if (gate || !cur.dirty) return target.current.groupId;
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

definePlace('note', {
  Screen: NoteEditor,
  title: () => 'Note',
  barTitle: () => 'Note',
});
