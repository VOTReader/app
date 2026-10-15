/* letter-text - a letter's blocks as v2 reading text (kit .reader .body). Spacing between segments is the app's one rule
   (utils/segment-dom-text.js segmentRenderText: the read-along offsets are measured on the same text), so v2 renders the
   same DOM text the read-along timings were cut against.

   Marks (4b): each block main keys carries main's own anchor (data-hl-key letter:<id>:<index in letter.blocks>, and
   data-hl-dom: main's applyDOMHighlights wraps the marks in it), so a highlight made in either app shows in both. For
   that the text must read the same way main's does: a footnote digit is .fn-ref (the chrome main's recorder, re-finder
   and copy leave out) and a poem's lines are block elements (a line break between them, as main's <div> lines). A block
   never re-renders once drawn (memo): main's painter splits its text nodes. */
import { segmentRenderText } from '../utils/segment-dom-text.js';
import { splitFormatBInline } from '../utils/format-b-inline.js';

/** @param {any[]} segments */
export function renderSegments(segments) {
  return segments.map((seg, i) => {
    if (!seg) return null;
    if (seg.t === 'stanza-break') return <span key={i} className="stanza-break" />;
    if (seg.t === 'fn') return <sup key={i} className="fn fn-ref">{seg.v}</sup>;
    const v = segmentRenderText(segments, i);
    if (seg.t === 'bold-italic') return <i key={i} className="lead-in">{v}</i>;
    if (seg.t === 'italic') return <i key={i}>{v}</i>;
    if (seg.t === 'caps') return <span key={i} className="caps">{v}</span>;
    return <React.Fragment key={i}>{v}</React.Fragment>;
  });
}

/** The block types main anchors marks to (LetterView: everything but a heading). */
const MARKABLE = new Set(['para', 'intro', 'poetry', 'closing', 'closing-fn']);

/** True when main anchors marks to this block. @param {any} block */
export function isMarkable(block) {
  return !!block && MARKABLE.has(block.type);
}

/**
 * One corpus block: para / intro / closing / closing-fn as a paragraph (a closing is plain text, "Says The Lord."); poetry
 * as a block of lines; a heading as a quiet paragraph. `hlKey` is main's anchor for it (markable blocks only).
 * @param {{ block: any, hlKey?: string | null }} props
 */
function Block({ block, hlKey = null }) {
  const anchor = hlKey && isMarkable(block) ? { 'data-hl-key': hlKey, 'data-hl-dom': 'true' } : {};
  if (block && block.type === 'poetry' && Array.isArray(block.lines)) {
    return (
      <div className="poetry" {...anchor}>
        {block.lines.map((line, i) => (Array.isArray(line) && line.length === 1 && line[0].t === 'stanza-break')
          ? <div key={i} className="stanza-break" />
          : <div key={i} className="poem">{renderSegments(Array.isArray(line) ? line : [])}</div>)}
      </div>
    );
  }
  const type = block && block.type;
  const body = block && Array.isArray(block.segments) ? renderSegments(block.segments) : (block && block.text) || null;
  return <p className={type && type !== 'para' ? type : undefined} {...anchor}>{body}</p>;
}

export const LetterBlock = React.memo(Block, (a, b) => a.block === b.block && a.hlKey === b.hlKey);

/** A book's name for a {{nav:}} cite: the loaded Bible's, else its id in words (format-b-dom-text's default). @param {string} id */
function navBookTitle(id) {
  const g = /** @type {any} */ (globalThis);
  return (g.BOOKS && g.BOOKS[id] && g.BOOKS[id].title) || String(id).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Plain text with its soft breaks as <br> (no character in the DOM text, as main's renderText). @param {string} s */
function withBreaks(s) {
  if (s.indexOf('\n') < 0) return s;
  return s.split('\n').flatMap((part, i) => (i > 0 ? [<br key={'b' + i} />, part] : [part])).filter((x) => x !== '');
}

/**
 * A Format B paragraph's inline markup, drawn as main's WtlbEntryView draws it (outside footnotes mode): **bold**,
 * _italics_, {{ref:R}} as "(R)", {{nav:book:n}} as "[Book n]", a [From "..." ~ ...] source line as written, soft breaks
 * as <br>. So its DOM text is format-b-dom-text's, which main's marks and the read-along address.
 * @param {string} text @param {(id: string) => string} [bookTitle] @returns {any[]}
 */
export function renderFormatB(text, bookTitle = navBookTitle) {
  return splitFormatBInline(text).map((seg, i) => {
    if (!seg) return null;
    if (seg.startsWith('**') && seg.endsWith('**') && seg.length >= 4) return <strong key={i}>{renderFormatB(seg.slice(2, -2), bookTitle)}</strong>;
    if (seg.startsWith('_') && seg.endsWith('_') && seg.length >= 2) return <em key={i}>{renderFormatB(seg.slice(1, -1), bookTitle)}</em>;
    const ref = /^\{\{ref:(.+)\}\}$/.exec(seg);
    if (ref) return <span key={i} className="cite">({ref[1].trim()})</span>;
    const nav = /^\{\{nav:([^:]+):(\d+)\}\}$/.exec(seg);
    if (nav) return <span key={i} className="cite">[{bookTitle(nav[1]) + ' ' + Number(nav[2])}]</span>;
    return <React.Fragment key={i}>{withBreaks(seg)}</React.Fragment>;
  });
}

/**
 * One Format B paragraph (Words To Live By, The Blessed, some Holy Days pages keep `paragraphs` of { align, text }, not
 * blocks), with main's anchor (`hlKey`: wtlb:<id>:<index>, utils/hl-keys.js) so marks show in both apps.
 * @param {{ para: { align?: string, text?: string }, hlKey?: string | null, bookTitle?: (id: string) => string }} props
 */
function FormatB({ para, hlKey = null, bookTitle }) {
  const anchor = hlKey ? { 'data-hl-key': hlKey, 'data-hl-dom': 'true' } : {};
  const align = para && (para.align === 'center' || para.align === 'right')
    ? { textAlign: /** @type {'center' | 'right'} */ (para.align) } : undefined;
  return <p style={align} {...anchor}>{renderFormatB((para && para.text) || '', bookTitle)}</p>;
}

export const FormatBBlock = React.memo(FormatB, (a, b) => a.para === b.para && a.hlKey === b.hlKey);

/** The kit's title step: 52 px, long titles 44 (".display.long"), very long 36 (".longer"). */
export function titleClass(title) {
  const t = String(title || '');
  if (t.length > 56) return 'display longer';
  if (t.length > 13) return 'display long';
  return 'display';
}
