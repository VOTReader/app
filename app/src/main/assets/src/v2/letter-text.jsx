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

/**
 * A footnote number (main's .fn-ref chrome: its recorder, re-finder and copy leave it out). It opens its footnote: the
 * letter's body listens (LetterScreen), so a block drawn once never needs new handlers. A Format B reference drawn as a
 * number (Holy Days, Answers) also names its reference.
 * @param {{ num: string | number, cite?: string }} props
 */
function FootnoteMark({ num, cite }) {
  return <sup className="fn fn-ref" data-fn-num={String(num)} data-ref={cite} role="button" tabIndex={0}
    aria-label={'Footnote ' + num}>{num}</sup>;
}

/**
 * A text's {{ref:R}} tokens as gold cites that open R's sheet (the page's body listens), R bare in the DOM text as
 * main's renderTextWithScripRefs draws it, so marks address the same words. The Bible studies write their references
 * this way; the letters do not.
 * @param {string} v
 */
function withRefs(v) {
  if (v.indexOf('{{ref:') < 0) return v;
  return v.split(/(\{\{ref:[^}]+\}\})/g).map((part, i) => {
    const m = /^\{\{ref:(.+)\}\}$/.exec(part);
    if (!m) return part ? <React.Fragment key={i}>{part}</React.Fragment> : null;
    const ref = m[1].trim();
    return <a key={i} className="cite" href="#" data-ref={ref}>{ref}</a>;
  });
}

/**
 * A letter the text names (main's letter-link: its label, by { collection, letterTitle } or a letter id), a gold cite
 * the page's body opens; an outside page (main's link) opens in the browser.
 * @param {any} seg @param {number} i
 */
function linkOf(seg, i) {
  if (seg.t === 'link') return <a key={i} className="cite" href={seg.url} data-url={seg.url}>{seg.label}</a>;
  const to = seg.link || {};
  return <a key={i} className="cite" href="#" data-letter={seg.letterId || ''} data-col={to.collection || ''}
    data-title={to.letterTitle || ''}>{seg.label}</a>;
}

/** @param {any[]} segments */
export function renderSegments(segments) {
  return segments.map((seg, i) => {
    if (!seg) return null;
    if (seg.t === 'stanza-break') return <span key={i} className="stanza-break" />;
    if (seg.t === 'fn') return <FootnoteMark key={i} num={seg.v} />;
    if (seg.t === 'letter-link' || seg.t === 'link') return linkOf(seg, i);
    const v = withRefs(segmentRenderText(segments, i));
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
  // a poem kept as one segment per line (some Bible studies): each its own line, its leading break dropped, as main's
  if (block && block.type === 'poetry' && Array.isArray(block.segments)) {
    return (
      <div className="poetry" {...anchor}>
        {block.segments.map((seg, i) => (
          <div key={i} className="poem">
            {renderSegments([seg && typeof seg.v === 'string' ? { ...seg, v: seg.v.replace(/^\n/, '') } : seg])}
          </div>
        ))}
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

/**
 * Plain text with its breaks: a blank line (\n\n, the corpus's next line of a stanza) as a small gap (.pb), a single \n
 * as <br>. Neither puts a character in the DOM text (format-b-dom-text counts each \n as a seam), so marks and the
 * read-along address the same words as main's.
 * @param {string} s
 */
function withBreaks(s) {
  if (s.indexOf('\n') < 0) return s;
  return s.split(/(\n\n|\n)/).map((part, i) => {
    if (part === '\n\n') return <span key={'p' + i} className="pb" />;
    if (part === '\n') return <br key={'b' + i} />;
    return part;
  }).filter((x) => x !== '');
}

/**
 * A Format B paragraph's inline markup, drawn as main's WtlbEntryView draws it: **bold**, _italics_, {{ref:R}} as a
 * tappable "(R)" (in footnotes mode a non-trailing one as its number), {{nav:book:n}} as a tappable "[Book n]", a
 * [From "..." ~ ...] source line as written, breaks as above. So its DOM text is format-b-dom-text's, which main's marks
 * and the read-along address. `refs` is the paragraph's row of formatBRefScan (its references in order, numbered in
 * footnotes mode); none = every reference a cite.
 * @param {string} text @param {(id: string) => string} [bookTitle]
 * @param {Array<{ ref: string, trailing: boolean, num: number | null }> | null} [refs] @returns {any[]}
 */
export function renderFormatB(text, bookTitle = navBookTitle, refs = null) {
  return drawFormatB(text, bookTitle, { list: refs || [], i: 0 });
}

/** @param {string} text @param {(id: string) => string} bookTitle @param {{ list: any[], i: number }} cur */
function drawFormatB(text, bookTitle, cur) {
  return splitFormatBInline(text).map((seg, i) => {
    if (!seg) return null;
    if (seg.startsWith('**') && seg.endsWith('**') && seg.length >= 4) return <strong key={i}>{drawFormatB(seg.slice(2, -2), bookTitle, cur)}</strong>;
    if (seg.startsWith('_') && seg.endsWith('_') && seg.length >= 2) return <em key={i}>{drawFormatB(seg.slice(1, -1), bookTitle, cur)}</em>;
    const ref = /^\{\{ref:(.+)\}\}$/.exec(seg);
    if (ref) {
      const cite = ref[1].trim();
      const info = cur.list[cur.i++];
      if (info && !info.trailing && info.num != null) return <FootnoteMark key={i} num={info.num} cite={cite} />;
      return <a key={i} className="cite" href="#" data-ref={cite}>({cite})</a>;
    }
    const nav = /^\{\{nav:([^:]+):(\d+)\}\}$/.exec(seg);
    if (nav) {
      return <a key={i} className="cite nav" href="#" data-nav={nav[1] + ':' + Number(nav[2])}>[{bookTitle(nav[1]) + ' ' + Number(nav[2])}]</a>;
    }
    return <React.Fragment key={i}>{withBreaks(seg)}</React.Fragment>;
  });
}

/**
 * One Format B paragraph (Words To Live By, The Blessed, some Holy Days pages keep `paragraphs` of { align, text }, not
 * blocks), with main's anchor (`hlKey`: wtlb:<id>:<index>, utils/hl-keys.js) so marks show in both apps. `refs`: its row
 * of formatBRefScan (renderFormatB).
 * @param {{ para: { align?: string, text?: string }, hlKey?: string | null, bookTitle?: (id: string) => string,
 *   refs?: Array<{ ref: string, trailing: boolean, num: number | null }> | null }} props
 */
function FormatB({ para, hlKey = null, bookTitle, refs = null }) {
  const anchor = hlKey ? { 'data-hl-key': hlKey, 'data-hl-dom': 'true' } : {};
  const align = para && (para.align === 'center' || para.align === 'right')
    ? { textAlign: /** @type {'center' | 'right'} */ (para.align) } : undefined;
  return <p style={align} {...anchor}>{renderFormatB((para && para.text) || '', bookTitle, refs)}</p>;
}

export const FormatBBlock = React.memo(FormatB, (a, b) => a.para === b.para && a.hlKey === b.hlKey && a.refs === b.refs);

/** The kit's title step: 52 px, long titles 44 (".display.long"), very long 36 (".longer"). Design's pictures draw up to 18
    characters at 52 ("Elect and Precious", 1h/1i, on two lines) and 20 at 44 ("Building the Gallows", 1d). */
export function titleClass(title) {
  const t = String(title || '');
  if (t.length > 56) return 'display longer';
  if (t.length > 18) return 'display long';
  return 'display';
}
