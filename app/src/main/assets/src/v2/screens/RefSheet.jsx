/* RefSheet - one sheet for a Scripture reference and a footnote (mw6, v2-gaps 1-4; pictures 1e-ref-sheet, 1g-footnote-sheet,
   desk 1e), and the Footnotes list at the foot of a letter (1f-footnotes). Main has two sheets (WtlbEntryView's inline
   reference sheet, FootnoteSheet) and FootnoteListSection; v2 draws them in the kit as one.

   A reference: "Scripture", the reference, its verse at reading size, the edition, then one gold "Go to <ref>" (a compound
   cite: each passage under its own heading with an outline Go to). A footnote: "Footnote n of N" with < > (dimmed at the
   ends), then a note (its words, the collection its letter is in, "Read <letter>") or a Scripture footnote (as a
   reference). On the laptop the sheet is the centred dialog with its close x. Every action goes through the screen
   (onGo / onRead / onStep), which closes the sheet first. A verse only main's lazy Bible holds asks for it and fills in
   when it lands (v2-gaps 38; main bc24368b9). */
import { Icon } from '../Icon.jsx';
import { Sheet } from '../Sheet.jsx';
import { passages, translationOf, noteWords, versePieces } from '../footnotes.js';
import { splitIntoVerses } from '../../utils/scripture-parse.js';
import { useBibleCorpus } from '../corpus.js';

/** A verse's words, numbered when it is several verses (the kit's .vn). @param {{ text: string, cite: string }} props */
function VerseText({ text, cite }) {
  const pieces = versePieces(text, cite, splitIntoVerses);
  return pieces.map((p, i) => (
    <React.Fragment key={i}>
      {i > 0 ? ' ' : null}
      {p.n != null ? <sup className="vn">{p.n}</sup> : null}
      {p.text}
    </React.Fragment>
  ));
}

/** A passage with no words that main's Bible could give (a verse in neither dictionary, read before the lazy Bible
 *  landed): the sheet and the list ask for the Bible and redraw when it lands. @param {Array<{ text: any, parsed: any }>} list */
function needsBible(list) {
  return list.some((p) => !p.text && !!p.parsed);
}

/** The words main shows when a reference has none in the app. */
export const NO_VERSE = 'Verse text not available in app data';

/**
 * A reference's passages: one (heading, verse, edition, the gold Go to), or a compound cite's each under its own heading
 * with an outline Go to.
 * @param {{ cite: string, letter: any, onGo: (parsed: any) => void }} props
 */
function Passages({ cite, letter, onGo }) {
  const list = passages(cite, letter);
  useBibleCorpus(needsBible(list));
  const edition = translationOf(cite);
  if (list.length === 1) {
    const p = list[0];
    return (
      <>
        <div className="ref-h">{p.label}</div>
        <p className="ref-v">{p.text ? <VerseText text={p.text} cite={p.label} /> : NO_VERSE}</p>
        <div className="ref-tr">{edition}</div>
        {p.parsed && (
          <button type="button" className="pill block" onClick={() => onGo(p.parsed)}>
            <span>Go to {p.label}</span><Icon name="arrowR" />
          </button>
        )}
      </>
    );
  }
  return (
    <>
      {list.map((p, i) => (
        <div className="ref-part" key={i}>
          <div className="ref-h">{p.label}</div>
          <p className="ref-v">{p.text ? <VerseText text={p.text} cite={p.label} /> : NO_VERSE}</p>
          {p.parsed && (
            <button type="button" className="btn2 block" onClick={() => onGo(p.parsed)}>
              <span>Go to {p.label}</span><Icon name="arrowR" />
            </button>
          )}
        </div>
      ))}
      <div className="ref-tr">{edition}</div>
    </>
  );
}

/**
 * A note footnote: its words, the collection its letter is in, and "Read <letter>" (else its web page).
 * @param {{ fn: import('../footnotes.js').Footnote, onRead: (link: any, url?: string) => void }} props
 */
function Note({ fn, onRead }) {
  const words = noteWords(fn);
  const link = fn.link && fn.link.letterTitle ? fn.link : null;
  return (
    <>
      {words ? <p className="ref-note">{words}</p> : null}
      {link && link.collection ? <div className="ref-src">{link.collection}</div> : null}
      {link ? (
        <button type="button" className="pill block" onClick={() => onRead(link, fn.url)}>
          <span>Read {link.letterTitle}</span><Icon name="arrowR" />
        </button>
      ) : fn.url ? (
        <a className="pill block" href={fn.url} target="_blank" rel="noopener noreferrer">
          <span>Open external link</span><Icon name="arrowR" />
        </a>
      ) : null}
      {!words && !link && !fn.url ? <p className="ref-note">This footnote has no content attached.</p> : null}
    </>
  );
}

/**
 * The sheet. `open` is { kind: 'ref', ref } or { kind: 'fn', num }; `items` the letter's footnotes in order.
 * @param {{ open: { kind: 'ref', ref: string } | { kind: 'fn', num: string }, letter: any,
 *   items: import('../footnotes.js').FootnoteItem[], desktop?: boolean, onClose: () => void,
 *   onGo: (parsed: any) => void, onRead: (link: any, url?: string) => void, onStep: (num: string) => void }} props
 */
export function RefSheet({ open, letter, items, desktop = false, onClose, onGo, onRead, onStep }) {
  if (open.kind === 'ref') {
    return (
      <Sheet kind="ref" label={'Scripture ' + open.ref} desktop={desktop} closeX onClose={onClose}>
        <span className="overline">Scripture</span>
        <Passages cite={open.ref} letter={letter} onGo={onGo} />
      </Sheet>
    );
  }
  const at = items.findIndex((it) => it.num === open.num);
  if (at < 0) return null;
  const { fn } = items[at];
  const prev = at > 0 ? items[at - 1].num : null;
  const next = at < items.length - 1 ? items[at + 1].num : null;
  return (
    <Sheet kind="ref" label={'Footnote ' + open.num} desktop={desktop} closeX onClose={onClose}>
      <div className="ref-top">
        <span className="overline">Footnote {open.num}{items.length > 1 ? ' of ' + items.length : ''}</span>
        {items.length > 1 && (
          <span className="fn-nav">
            <button type="button" className="ic" disabled={prev == null} aria-label="Previous footnote"
              onClick={() => prev != null && onStep(prev)}><Icon name="chev" flip /></button>
            <button type="button" className="ic" disabled={next == null} aria-label="Next footnote"
              onClick={() => next != null && onStep(next)}><Icon name="chev" /></button>
          </span>
        )}
      </div>
      {fn.type === 'scripture' && fn.ref ? (
        <>
          <Passages cite={fn.ref} letter={letter} onGo={onGo} />
          {fn.seeAlso && fn.seeAlso.letterTitle ? (
            <button type="button" className="textbtn sm" onClick={() => onRead(fn.seeAlso)}>
              Also see {fn.seeAlso.label || fn.seeAlso.letterTitle}<Icon name="chev" />
            </button>
          ) : null}
        </>
      ) : <Note fn={fn} onRead={onRead} />}
    </Sheet>
  );
}

/**
 * The Footnotes list at the foot of a letter, before the next-letter card (UI sizes: it does not follow the reader's
 * text size). A note: its words and "Read <letter>"; a Scripture footnote: the reference, its verse and "Go to".
 * @param {{ items: import('../footnotes.js').FootnoteItem[], letter: any, onGo: (parsed: any) => void,
 *   onRead: (link: any, url?: string) => void }} props
 */
export function FootnoteList({ items, letter, onGo, onRead }) {
  if (!items.length) return null;
  return (
    <div className="fnl">
      <span className="label">Footnotes</span>
      {items.map(({ num, fn }) => (
        <div className="fni" key={num} data-fn-item={num}>
          <span className="n">{num}</span>
          <div className="tx">{fn.type === 'scripture' && fn.ref ? <ListScripture fn={fn} letter={letter} onGo={onGo} /> : <ListNote fn={fn} onRead={onRead} />}</div>
        </div>
      ))}
    </div>
  );
}

/** @param {{ fn: import('../footnotes.js').Footnote, letter: any, onGo: (parsed: any) => void }} props */
function ListScripture({ fn, letter, onGo }) {
  const list = passages(/** @type {string} */ (fn.ref), letter);
  useBibleCorpus(needsBible(list));
  return (
    <>
      <div className="t">{fn.ref}</div>
      {list.map((p, i) => (
        <React.Fragment key={i}>
          {p.text ? <div className="v">{list.length > 1 ? p.label + ': ' : ''}<VerseText text={p.text} cite={p.label} /></div> : null}
          {p.parsed ? (
            <button type="button" className="textbtn sm" onClick={() => onGo(p.parsed)}>Go to {p.label}<Icon name="chev" /></button>
          ) : null}
        </React.Fragment>
      ))}
    </>
  );
}

/** @param {{ fn: import('../footnotes.js').Footnote, onRead: (link: any, url?: string) => void }} props */
function ListNote({ fn, onRead }) {
  const link = fn.link && fn.link.letterTitle ? fn.link : null;
  const words = noteWords(fn) || (link ? link.letterTitle : '');
  return (
    <>
      {words ? <div className="t">{words}</div> : null}
      {link ? (
        <button type="button" className="textbtn sm" onClick={() => onRead(link, fn.url)}>Read {link.letterTitle}<Icon name="chev" /></button>
      ) : fn.url ? (
        <a className="textbtn sm" href={fn.url} target="_blank" rel="noopener noreferrer">Open external link<Icon name="chev" /></a>
      ) : null}
    </>
  );
}
