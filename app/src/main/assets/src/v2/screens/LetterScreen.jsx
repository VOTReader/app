/* LetterScreen - one letter in v2 (picture 1a-letter: overline, title, Listen, the header lines, a hairline, the text,
   then the next letter). Volumes load lazily (window.__loadVotCorpus, index.html); the screen reports ready once the
   letter's text is on the page. */
import { Icon } from '../Icon.jsx';
import { LetterBlock, titleClass } from '../letter-text.jsx';
import { definePlace } from '../places.js';

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

/** The collection's preface (Volume One's "A Word of Warning"), or null. */
export function prefaceOf(col) {
  const p = col && col.prefaceGlobal ? g[col.prefaceGlobal] : null;
  return p && p.id ? p : null;
}

/**
 * One letter, or with `preface` the collection's preface (its next card is Letter 1).
 * @param {{ collection: string, n?: number, preface?: boolean, onReady?: () => void, onOpenLetter?: (n: number) => void }} props
 */
export function LetterScreen({ collection, n = 0, preface = false, onReady, onOpenLetter }) {
  const col = collectionOf(collection);
  const letters = useLetters(col);
  const letter = letters ? (preface ? prefaceOf(col) : letterAt(letters, n)) : null;
  React.useEffect(() => { if (letters && onReady) onReady(); }, [letters, onReady]);
  if (!letters) return null;
  if (!col || !letter) {
    return <div className="empty"><div className="t">This letter could not be opened.</div></div>;
  }
  const nextN = preface ? 1 : n + 1;
  const next = letterAt(letters, nextN);
  const meta = [letter.date, letter.from, letter.spoken, letter.forLine].filter(Boolean);
  return (
    <>
      <div className="page-head g reader-head">
        <span className="overline eyebrow">{col.label} · {preface ? 'Preface' : 'Letter ' + n}</span>
        <h1 className={titleClass(letter.title)}>{letter.title}</h1>
        <button type="button" className="pill play"><Icon name="playBig" />Listen</button>
        {meta.length > 0 && <div className="meta">{meta.map((m, i) => <React.Fragment key={i}>{i > 0 && <br />}{m}</React.Fragment>)}</div>}
      </div>
      <div className="hair" />
      <div className="body g first">
        {(letter.blocks || []).map((b, i) => <LetterBlock key={i} block={b} />)}
        {next && (
          <button type="button" className="nextcard" onClick={() => onOpenLetter && onOpenLetter(nextN)}>
            <span className="tx"><span className="k">Next · Letter {nextN}</span><span className="t">{next.title}</span></span>
            <span className="chev"><Icon name="chev" /></span>
          </button>
        )}
      </div>
    </>
  );
}

const LETTER_ACTIONS = (
  <>
    <button type="button" className="ic" aria-label="Bookmark"><Icon name="bookmark" /></button>
    <button type="button" className="ic" aria-label="Text and theme"><Icon name="aa" /></button>
    <button type="button" className="ic" aria-label="More"><Icon name="more" /></button>
  </>
);

/** The letter place: the next-letter card replaces this letter, so Back still names the collection. */
function LetterPlace({ route, replace, onReady }) {
  const openLetter = (n) => replace({ place: 'letter', collection: route.collection, n });
  return <LetterScreen key={route.collection + '/' + (route.preface ? 'P' : route.n)} collection={route.collection} n={route.n}
    preface={!!route.preface} onReady={onReady} onOpenLetter={openLetter} />;
}

definePlace('letter', {
  Screen: LetterPlace,
  // Back on the page above a letter says its title (or the collection's name until the volume has loaded)
  title: (r) => {
    const col = collectionOf(r.collection);
    const list = col && Array.isArray(g[col.globalName]) ? g[col.globalName] : null;
    const letter = list ? (r.preface ? prefaceOf(col) : letterAt(list, r.n)) : null;
    return letter ? letter.title : (col ? col.label : '');
  },
  actions: () => LETTER_ACTIONS,
  contentClass: 'content reader',
});
