/* JournalPickers - Insert's pickers from your notes (mw9b, design dz20 3o; main's JournalInsertSheet): Bookmark, Note,
   Journal entry and Notebook, each a kit sheet with its search ("Pick a bookmark", "Search bookmarks"); Notebook lists
   Uncategorized first. A journal entry opens to its parts first: the whole entry (a card that opens it) or one of its
   words, pictures or memos (main's embed, a copy that remembers where it came from). Not drawn: the link picker's
   classes (a tall sheet on the phone, a dialog with its x on the laptop). The rows come from journal-blocks.js. */
import { Icon } from '../Icon.jsx';
import { Sheet } from '../Sheet.jsx';
import { PICKERS, pickRows, entryParts, wholeEntry } from '../journal-blocks.js';
import { journalTitle } from '../notes-facts.js';
import { LevelHead } from './LinkPicker.jsx';

/** @param {{ title: string, sub: string, onClick: () => void, chev?: boolean }} props */
function Row({ title, sub, onClick, chev = false }) {
  return (
    <button type="button" className="srow" onClick={onClick}>
      <span className="tx"><span className="t">{title}</span>{sub && <span className="s">{sub}</span>}</span>
      {chev && <span className="chev"><Icon name="chev" /></span>}
    </button>
  );
}

/**
 * @param {{ kind: 'bookmark' | 'note' | 'journal' | 'notebook', exclude?: string | null, desktop?: boolean,
 *   onPick: (block: any) => void, onClose: () => void }} props  exclude: the entry being written (never its own card)
 */
export function JournalPick({ kind, exclude = null, desktop = false, onPick, onClose }) {
  const words = PICKERS[kind];
  const [q, setQ] = React.useState('');
  const [entry, setEntry] = React.useState(/** @type {any} */ (null));
  const inputRef = React.useRef(/** @type {HTMLInputElement | null} */ (null));
  React.useEffect(() => {
    if (desktop || entry) return undefined;
    const t = setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 50);
    return () => clearTimeout(t);
  }, [desktop, entry]);

  let body;
  if (entry) {
    const parts = entryParts(entry);
    body = (
      <>
        <LevelHead title={journalTitle(entry) || 'Untitled'} onBack={() => setEntry(null)} />
        <div className="lkb lkrows">
          <Row title="The whole entry" sub="A card that opens it" onClick={() => onPick(wholeEntry(entry))} />
          {parts.length ? <span className="label lkl">Or one part of it</span> : null}
          {parts.map((p) => <Row key={p.key} title={p.title} sub={p.sub} onClick={() => onPick(p.block)} />)}
        </div>
      </>
    );
  } else {
    const { total, rows } = pickRows(kind, q, exclude);
    body = (
      <>
        <div className="sh">{words.title}</div>
        <div className="field">
          <input ref={inputRef} className="q" type="text" value={q} aria-label={words.search} placeholder={words.search}
            autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search"
            onChange={(e) => setQ(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
          {q ? <button type="button" className="clear" aria-label="Clear" onClick={() => { setQ(''); if (inputRef.current) inputRef.current.focus(); }}><Icon name="close" /></button>
            : <Icon name="search" />}
        </div>
        <div className="lkb lkrows">
          {rows.length ? rows.map((r) => (
            <Row key={r.key} title={r.title} sub={r.sub} chev={!!r.entry}
              onClick={() => { if (r.entry) { setQ(''); setEntry(r.entry); } else if (r.make) onPick(r.make()); }} />
          )) : (
            <div className="empty lke"><div className="t">{total ? 'No matches.' : words.none}</div></div>
          )}
        </div>
      </>
    );
  }
  return (
    <Sheet kind={'lkp jpk' + (desktop ? '' : ' tall')} label={words.title} desktop={desktop} closeX onClose={onClose}>
      {body}
    </Sheet>
  );
}
