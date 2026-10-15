/* JournalEditor - write or edit one journal entry in v2 (zv1; no gate picture: the kit's fields, notes.css).

   It writes through main's own JournalStore (add / update), the same entry shape main's journal keeps, so nothing is
   migrated: a title and the entry's text blocks. Blocks it cannot edit (a picture, a verse, a recording) stay exactly
   where they are and show as one quiet line. It saves as the reader types (half a second after the last key) and once
   more on leaving, so Back and Android's Back never lose words. A gate boot never writes (memory only). */
import { definePlace } from '../places.js';

const g = /** @type {any} */ (globalThis);
const SAVE_AFTER_MS = 500;

/** @param {any} block */
const isText = (block) => !!block && block.type === 'p' && typeof block.text === 'string';

function newTextBlock() {
  const H = g.JournalHelpers;
  return H && typeof H.newBlock === 'function' ? H.newBlock('p', { text: '' }) : { type: 'p', text: '' };
}

/** "October 14, 2026". @param {number} ts */
export function longDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** One line for a block this editor leaves alone. @param {any} block */
function otherLine(block) {
  const H = g.JournalHelpers;
  const s = H && typeof H.describeBlock === 'function' ? H.describeBlock(block) : '';
  return s || 'Kept as it is';
}

/**
 * The entry as the editor holds it, and save(): add on the first words, update after (never for a gate boot).
 * @param {{ id?: string } & Record<string, any>} route @param {boolean} gated
 */
export function useJournalDraft(route, gated) {
  const store = gated ? null : g.JournalStore;
  const [entry] = React.useState(() => (route.id && store && typeof store.get === 'function' ? store.get(route.id) : null));
  const [title, setTitle] = React.useState(entry ? entry.title || '' : '');
  const [blocks, setBlocks] = React.useState(() => (entry && Array.isArray(entry.blocks) && entry.blocks.some(isText)
    ? entry.blocks.slice()
    : (entry && Array.isArray(entry.blocks) ? entry.blocks.concat(newTextBlock()) : [newTextBlock()])));
  const idRef = React.useRef(entry ? entry.id : null);
  const latest = React.useRef({ title, blocks, dirty: false });
  latest.current = { ...latest.current, title, blocks };

  const save = React.useCallback(() => {
    const cur = latest.current;
    if (!cur.dirty || !store) return;
    const hasWords = cur.title.trim() || cur.blocks.some((b) => isText(b) && b.text.trim());
    if (!idRef.current) {
      if (!hasWords) return;
      const made = store.add({ title: cur.title, blocks: cur.blocks });
      idRef.current = made && made.id ? made.id : null;
    } else {
      store.update(idRef.current, { title: cur.title, blocks: cur.blocks });
    }
    latest.current.dirty = false;
  }, [store]);

  const touch = () => { latest.current.dirty = true; };
  const editTitle = (v) => { touch(); setTitle(v); };
  const editBlock = (i, v) => { touch(); setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, text: v } : b))); };

  // Save half a second after the last change, and once more on leaving.
  React.useEffect(() => {
    if (!latest.current.dirty) return undefined;
    const t = setTimeout(save, SAVE_AFTER_MS);
    return () => clearTimeout(t);
  }, [title, blocks, save]);
  React.useEffect(() => () => save(), [save]);

  return { entry, title, blocks, editTitle, editBlock, save, id: () => idRef.current };
}

/** @param {import('../places.js').PlaceProps} props */
export function JournalEditor({ route, gate, onReady }) {
  const { entry, title, blocks, editTitle, editBlock } = useJournalDraft(route, !!gate);
  React.useEffect(() => { onReady(); }, [onReady]);
  const firstText = blocks.findIndex(isText);
  return (
    <div className="g jed">
      <p className="mm jdate">{longDate(entry ? entry.created || Date.now() : Date.now())}</p>
      <input className="jt" type="text" placeholder="Title" aria-label="Title" value={title}
        onChange={(e) => editTitle(e.target.value)} />
      {blocks.map((b, i) => (isText(b)
        ? <textarea key={b.id || i} className="jb" placeholder={i === firstText ? 'Write here' : ''} aria-label="Entry text"
            autoFocus={!entry && i === firstText} value={b.text} onChange={(e) => editBlock(i, e.target.value)} />
        : <p key={b.id || i} className="mm jother">{otherLine(b)}</p>))}
    </div>
  );
}

definePlace('journal-entry', {
  Screen: JournalEditor,
  title: (r) => (r.id ? 'Journal entry' : 'New journal entry'),
});
