/* LetterScreen - one letter in v2 (picture 1a-letter: overline, title, Listen, the header lines, a hairline, the text,
   then the next letter). Volumes load lazily (window.__loadVotCorpus, index.html); the screen reports ready once the
   letter's text is on the page. */
import { Icon } from '../Icon.jsx';
import { LetterBlock, titleClass } from '../letter-text.jsx';

const g = /** @type {any} */ (globalThis);

/** @param {string} key */
export function collectionOf(key) {
  const map = g.COL_BY_KEY;
  return map && typeof map.get === 'function' ? map.get(key) || null : null;
}

/** @returns {any[] | null} the collection's letters when its volume is loaded */
function lettersOf(col) {
  return col && Array.isArray(g[col.globalName]) ? g[col.globalName] : null;
}

/** The collection's letters, loading the lazy corpus first when needed; [] when it failed to load. */
export function useLetters(col) {
  const [letters, setLetters] = React.useState(() => lettersOf(col));
  const missing = !letters;
  React.useEffect(() => {
    if (!missing || !col) return undefined;
    let live = true;
    const load = g.__loadVotCorpus;
    Promise.resolve(typeof load === 'function' ? load() : null)
      .then(() => { if (live) setLetters(lettersOf(col) || []); }, () => { if (live) setLetters([]); });
    return () => { live = false; };
  }, [col, missing]);
  return letters;
}

/** @param {any[]} letters @param {number} n */
export function letterAt(letters, n) {
  return letters.find((l) => l && l.num === n) || null;
}

/**
 * @param {{ collection: string, n: number, onReady?: () => void, onOpenLetter?: (n: number) => void }} props
 */
export function LetterScreen({ collection, n, onReady, onOpenLetter }) {
  const col = collectionOf(collection);
  const letters = useLetters(col);
  const letter = letters ? letterAt(letters, n) : null;
  React.useEffect(() => { if (letters && onReady) onReady(); }, [letters, onReady]);
  if (!letters) return null;
  if (!col || !letter) {
    return <div className="empty"><div className="t">This letter could not be opened.</div></div>;
  }
  const next = letterAt(letters, n + 1);
  const meta = [letter.date, letter.from, letter.spoken, letter.forLine].filter(Boolean);
  return (
    <>
      <div className="page-head g reader-head">
        <span className="overline eyebrow">{col.label} · Letter {n}</span>
        <h1 className={titleClass(letter.title)}>{letter.title}</h1>
        <button type="button" className="pill play"><Icon name="playBig" />Listen</button>
        {meta.length > 0 && <div className="meta">{meta.map((m, i) => <React.Fragment key={i}>{i > 0 && <br />}{m}</React.Fragment>)}</div>}
      </div>
      <div className="hair" />
      <div className="body g first">
        {(letter.blocks || []).map((b, i) => <LetterBlock key={i} block={b} />)}
        {next && (
          <button type="button" className="nextcard" onClick={() => onOpenLetter && onOpenLetter(n + 1)}>
            <span className="tx"><span className="k">Next · Letter {n + 1}</span><span className="t">{next.title}</span></span>
            <span className="chev"><Icon name="chev" /></span>
          </button>
        )}
      </div>
    </>
  );
}
