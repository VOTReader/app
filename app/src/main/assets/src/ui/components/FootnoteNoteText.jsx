/* ═══════════════════════════════════════════════════════════════════════
   FootnoteNoteText — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   A note footnote's text, followable (share-fn, Corbin 2026-10-25: "we need
   to make these followable with good UX, links/refs inside footnotes").
   utils/footnote-note.js reads the pieces; this lays them out:

     [A] [B]        nested markers: a tap brings their line into view, lit;
     A. B.          the lines they point at, each on its own line under the
                    text; the label takes the reader back to its marker;
     Acts 17:30     a Bible reference, tapped like any in a letter (onRef);
     “Death and…”   the letter the passage is quoted from (onLetter),
                    opened on the passage.

   Every word is the published text, in its order (footnote-note.test.js).
   A note with nothing to follow renders as the plain string it always did.
   The in-body footnote list sits inside a card that scrolls to the bubble on
   a tap, so every control here keeps its click to itself.
   ═══════════════════════════════════════════════════════════════════════ */

import { parseFootnoteNote, hasFollowable } from '../../utils/footnote-note.js';
import { scrollBehavior } from '../../utils/reduced-motion.js';

/** How long a jumped-to line or marker stays lit. */
const FLASH_MS = 1400;

/** Enter or Space on a role=link span acts as a tap. @param {any} e @param {() => void} go */
function onKeyActivate(e, go) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); go(); }
}

/**
 * @param {{
 *   text: string,
 *   onRef?: ((ref: string) => void) | null,
 *   onLetter?: ((title: string, excerpt: string) => void) | null,
 *   canOpenLetter?: ((title: string) => boolean) | null,
 * }} props
 */
export function FootnoteNoteText({ text, onRef = null, onLetter = null, canOpenLetter = null }) {
  const rootRef = React.useRef(/** @type {HTMLElement | null} */ (null));
  const note = React.useMemo(() => parseFootnoteNote(text), [text]);
  if (!hasFollowable(note)) return <>{text}</>;

  /** Bring `sel` into view inside this note, lit for a moment, and focus it. @param {string} sel */
  const jump = (sel) => {
    const el = rootRef.current && /** @type {HTMLElement | null} */ (rootRef.current.querySelector(sel));
    if (!el) return;
    try { el.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' }); } catch (_e) { /* old WebView */ }
    el.classList.remove('fn-note-lit');
    void el.offsetWidth;   // restart the flash on a second tap
    el.classList.add('fn-note-lit');
    setTimeout(() => el.classList.remove('fn-note-lit'), FLASH_MS);
    try { el.focus({ preventScroll: true }); } catch (_e) { /* focus is a nicety */ }
  };
  const stop = (/** @type {any} */ e) => e.stopPropagation();

  /** @param {import('../../utils/footnote-note.js').NotePiece} p @param {number} i */
  const piece = (p, i) => {
    if (p.t === 'mark') {
      return (
        <button key={i} type="button" className="fn-note-mark" data-fn-mark={p.id}
          aria-label={`Note ${p.id}, below`}
          onClick={(e) => { stop(e); jump(`[data-fn-line="${p.id}"]`); }}>{p.v}</button>
      );
    }
    if (p.t === 'label') {
      return (
        <button key={i} type="button" className="fn-note-label"
          aria-label={`Back to marker ${p.id} in the text`}
          onClick={(e) => { stop(e); jump(`[data-fn-mark="${p.id}"]`); }}>{p.v}</button>
      );
    }
    if (p.t === 'ref' && onRef) {
      const go = () => onRef(p.ref);
      return <span key={i} className="inline-scrip-ref fn-note-ref" role="link" tabIndex={0} onClick={(e) => { stop(e); go(); }} onKeyDown={(e) => onKeyActivate(e, go)}>{p.v}</span>;
    }
    if (p.t === 'letter' && onLetter && (!canOpenLetter || canOpenLetter(p.title))) {
      const go = () => onLetter(p.title, p.excerpt);
      return <span key={i} className="letter-link-ref fn-note-letter" role="link" tabIndex={0} aria-label={`Open ${p.title}`} onClick={(e) => { stop(e); go(); }} onKeyDown={(e) => onKeyActivate(e, go)}>{p.v}</span>;
    }
    return <React.Fragment key={i}>{p.v}</React.Fragment>;
  };

  return (
    <span className="fn-note" ref={rootRef}>
      <span className="fn-note-body">{note.body.map(piece)}</span>
      {note.notes.length > 0 && (
        <span className="fn-note-lines" role="list">
          {note.notes.map((l) => (
            <span key={l.id} className="fn-note-line" role="listitem" data-fn-line={l.id} tabIndex={-1}>
              {l.pieces.map(piece)}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
