/* NoteEditor - the note on a letter paragraph (4b's "Add a note"; no gate picture: the journal editor's kit fields,
   notes.css .jed). The paragraph's words stand quoted above the field.

   It writes main's own NoteStore record through marks.js saveNote, on the paragraph's mark (made at main's note default
   when the paragraph has none), so the note shows in main too and nothing is migrated. Nothing is written until there
   are words; then it saves as the reader types (half a second after the last key) and once more on leaving, so Back
   and Android's Back never lose words. A gate boot never writes. */
import { definePlace } from '../places.js';
import { saveNote } from '../marks.js';

const g = /** @type {any} */ (globalThis);
const SAVE_AFTER_MS = 500;

/**
 * route: { place: 'note', key, start, end, text, groupId } (LetterScreen's Add a note: the paragraph and its mark, if any)
 * @param {{ route: Record<string, any>, gate: import('../gate.js').GateState | null, onReady: () => void }} props
 */
export function NoteEditor({ route, gate, onReady }) {
  const N = gate ? null : g.NoteStore;
  const [body, setBody] = React.useState(() => {
    const note = N && route.groupId ? N.get(route.groupId) : null;
    return note && typeof note.body === 'string' ? note.body : '';
  });
  const target = React.useRef({ key: route.key, start: route.start, end: route.end, text: route.text || '', groupId: route.groupId || null });
  const latest = React.useRef({ body, dirty: false });
  latest.current.body = body;

  const save = React.useCallback(() => {
    const cur = latest.current;
    if (!cur.dirty || gate) return;
    if (!target.current.groupId && !cur.body.trim()) return;
    target.current.groupId = saveNote(target.current, cur.body);
    cur.dirty = false;
  }, [gate]);

  React.useEffect(() => {
    if (!latest.current.dirty) return undefined;
    const t = setTimeout(save, SAVE_AFTER_MS);
    return () => clearTimeout(t);
  }, [body, save]);
  React.useEffect(() => () => save(), [save]);
  React.useEffect(() => { onReady(); }, [onReady]);

  return (
    <div className="g jed">
      <blockquote className="nq">{route.text}</blockquote>
      <textarea className="jb" placeholder="Write your note" aria-label="Note" autoFocus value={body}
        onChange={(e) => { latest.current.dirty = true; setBody(e.target.value); }} />
    </div>
  );
}

definePlace('note', {
  Screen: NoteEditor,
  title: () => 'Note',
});
