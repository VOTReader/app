/* ═══════════════════════════════════════════════════════════════════════
   format-b-dom-text — THE rendered text of a Format B paragraph, and the map
   back to the corpus offsets that address it.
   ═══════════════════════════════════════════════════════════════════════
   Cluster D (bundle-d) + imported by tools/audio-fragments-lib.mjs.

   The Format A sibling of this file (segment-dom-text.js) exists because the
   alignment offsets and the rendered DOM must be the same domain. Format B
   could not have one, because its rendered text is not the corpus text: the
   renderer strips emphasis markers, drops every soft line break, and rewrites
   each scripture reference into either a footnote NUMBER or a parenthesised
   cite depending on a per-route flag. So read-along took the only safe option
   available and painted whole paragraphs — up to 3,785 characters, about four
   minutes of motionless gold on the longest entry.

   The blanket reason recorded for that ("the rendered char domain shifts with
   the footnotesMode setting") turns out to be the smallest part of it. Measured
   over all 1,338 Format B paragraphs:

       contain any {{ref:}}            44   3.3%   <- the stated reason
       contain **bold** / _italic_     63   4.7%
       contain a soft \n              906  67.7%   <- the actual dominant shift
       no markup at all             1,255  93.8%

   A `\n` renders as <br/>, which contributes nothing to textContent, so
   two thirds of paragraphs shift by one character per line break regardless of
   any setting. Any design that enumerates "the two footnote modes" is already
   wrong — and so is one that enumerates three, because {{nav:}} renders the
   book's TITLE, which reads "Songofsolomon" before the lazy Bible corpus lands
   and "Song of Solomon" after.

   THE FIX IS A PROJECTION, not an enumeration. The corpus text is the one
   stable domain, so alignment offsets live there; this module replays the
   renderer's own rules to say where those offsets land in the DOM right now.
   Everything the renderer branches on is an explicit input, so there is no
   hidden mode: pass what the render is using and get what the render produced.

   The contract is asserted against a REAL WtlbEntryView render, never against
   a second copy of the rules — see format-b-dom-text.test.js. */

import { splitFormatBInline } from './format-b-inline.js';

/** `[From "Title" ~ Volume N]` renders verbatim, so it is a pure copy. */
const ATTR_RE = /^\[From ["“”](.+?)["“”]\s*~\s*Volume\s+(\d+|[A-Za-z]+)\]$/;
const REF_RE = /^\{\{ref:(.+)\}\}$/;
const NAV_RE = /^\{\{nav:([^:]+):(\d+)\}\}$/;

/**
 * The book name a nav link shows, mirroring WtlbEntryView exactly: the lazy
 * Bible corpus when it has landed, otherwise the id title-cased. Both spellings
 * really occur — a cold WTLB read shows "Songofsolomon" and the same paragraph
 * reads "Song of Solomon" once the corpus arrives — which is why the DOM domain
 * cannot be enumerated as a fixed set of modes and has to be projected.
 */
function defaultBookTitle(id) {
  const g = /** @type {any} */ (globalThis);
  const fromCorpus = typeof g.BOOKS !== 'undefined' && g.BOOKS[id] && g.BOOKS[id].title;
  return fromCorpus || String(id).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Walk one paragraph the way renderLine does, emitting runs.
 *
 * A run is `{ raw, rawEnd, dom, domEnd, copy }`. `copy: true` means the raw
 * characters survive one-for-one into the DOM, so an offset inside it maps
 * exactly; `copy: false` means the renderer substituted something of its own
 * (a footnote number for a reference, a book title for a nav link) and any
 * offset inside it can only resolve to the substitution's edges.
 *
 * @param {string} text raw paragraph text
 * @param {{ refs?: Array<{ref: string, trailing: boolean, num: number|null}>,
 *           footnotesMode?: boolean, bookTitle?: (id: string) => string }} opts
 * @returns {{ text: string, runs: Array<{raw: number, rawEnd: number, dom: number, domEnd: number, copy: boolean}>, lineBounds: Set<number> }}
 */
function walk(text, opts) {
  const runs = [];
  const lineBounds = new Set();
  let dom = '';
  const state = { refIndex: 0 };

  const push = (rawStart, rawLen, out, copy) => {
    if (!rawLen && !out.length) return;
    runs.push({ raw: rawStart, rawEnd: rawStart + rawLen, dom: dom.length, domEnd: dom.length + out.length, copy });
    dom += out;
  };

  /** @param {string} src @param {number} base raw offset of src[0] */
  const emit = (src, base) => {
    const parts = splitFormatBInline(src);
    let at = base;
    for (const seg of parts) {
      if (!seg) continue;
      const start = at;
      at += seg.length;
      if (seg.startsWith('**') && seg.endsWith('**') && seg.length >= 4) {
        push(start, 2, '', false);                       // the opening marker vanishes
        emit(seg.slice(2, -2), start + 2);
        push(at - 2, 2, '', false);
        continue;
      }
      if (seg.startsWith('_') && seg.endsWith('_') && seg.length >= 2) {
        push(start, 1, '', false);
        emit(seg.slice(1, -1), start + 1);
        push(at - 1, 1, '', false);
        continue;
      }
      if (ATTR_RE.test(seg)) { push(start, seg.length, seg, true); continue; }
      const ref = seg.match(REF_RE);
      if (ref) {
        // The renderer consumes refs in document order from the pre-scan, and
        // only a NON-trailing one in footnotesMode becomes a bare number.
        const info = (opts.refs || [])[state.refIndex++];
        const asNumber = !!opts.footnotesMode && info && !info.trailing && info.num != null;
        push(start, seg.length, asNumber ? String(info.num) : '(' + ref[1].trim() + ')', false);
        continue;
      }
      const nav = seg.match(NAV_RE);
      if (nav) {
        const title = opts.bookTitle ? opts.bookTitle(nav[1]) : defaultBookTitle(nav[1]);
        push(start, seg.length, '[' + title + ' ' + Number(nav[2]) + ']', false);
        continue;
      }
      // Plain text: renderText splits on the break and emits <br/>, which
      // contributes nothing to textContent, so every soft break is a deletion.
      let cursor = start;
      const pieces = seg.split('\n');
      for (let k = 0; k < pieces.length; k++) {
        const piece = pieces[k];
        if (piece) push(cursor, piece.length, piece, true);
        cursor += piece.length;
        if (k < pieces.length - 1) {
          push(cursor, 1, '', false);
          // The two lines now meet with NOTHING between them in textContent —
          // exactly the way Format A poetry lines do. Record the seam: a span
          // boundary there joins two word characters and is perfectly legal,
          // and a word-boundary check that does not know it rejects every
          // line in the corpus.
          lineBounds.add(dom.length);
          cursor += 1;
        }
      }
    }
  };

  emit(text, 0);
  lineBounds.delete(0);
  lineBounds.delete(dom.length);
  return { text: dom, runs, lineBounds };
}

/**
 * The exact textContent WtlbEntryView renders for this paragraph.
 * @param {string} text
 * @param {object} [opts]
 * @returns {string}
 */
export function formatBDomText(text, opts) {
  return walk(String(text == null ? '' : text), opts || {}).text;
}

/**
 * A raw-offset -> DOM-offset projection for one paragraph.
 *
 * Read-along stores offsets in the corpus domain (the only one that does not
 * move) and paints in the DOM domain, so every span crosses this boundary
 * exactly once, at paint time.
 *
 * @param {string} text
 * @param {object} [opts]
 * @returns {{ text: string, lineBounds: Set<number>, toDom: (rawOffset: number, isEnd?: boolean) => number }}
 */
export function formatBOffsetMap(text, opts) {
  const { text: dom, runs, lineBounds } = walk(String(text == null ? '' : text), opts || {});
  /**
   * @param {number} off raw offset
   * @param {boolean} [isEnd] true for a span's exclusive end, which must land
   *   after the run it closes rather than before the next one — otherwise a
   *   span ending on a stripped marker would lose its final character.
   */
  const toDom = (off, isEnd) => {
    if (!runs.length) return 0;
    let out = isEnd ? 0 : dom.length;
    for (const r of runs) {
      if (isEnd) {
        if (r.raw < off) out = r.copy ? r.dom + Math.min(off - r.raw, r.domEnd - r.dom) : r.domEnd;
      } else if (off < r.rawEnd) {
        // Inside a copy run the offset shifts by the run's own delta; inside a
        // substitution it can only mean "the start of what replaced it".
        out = r.copy ? r.dom + (off - r.raw) : r.dom;
        return Math.max(0, Math.min(dom.length, out));
      }
    }
    return Math.max(0, Math.min(dom.length, out));
  };
  return { text: dom, lineBounds, toDom };
}
