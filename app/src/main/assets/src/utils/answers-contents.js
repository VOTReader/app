/* ═══════════════════════════════════════════════════════════════════════
   answers-contents — an Answers topic's table of contents
   ═══════════════════════════════════════════════════════════════════════
   A topic page is a run of PASSAGES (excerpts from the letters), each ending
   in its "~ [From “Title” ~ Collection]" source line, grouped under the
   site's bold centred section headings. A topic runs to 54 passages (median
   10), and a UX walk (2026-09-25) found a reader could not tell how long one
   was, where they were in it, or jump anywhere. This turns the paragraphs
   into what the contents navigator shows: sections, their passages, and the
   paragraph index each one starts at (the page's data-hl-key is
   `wtlb:<id>:<index>`, so an index is a place to scroll to).

   Pure data: no DOM, no React. The page's own renderer is untouched.
   ═══════════════════════════════════════════════════════════════════════ */

import { isAttribution } from './answers-shelves.js';

const HEADING_RE = /^\*\*([^*]+)\*\*$/;
const SOURCE_RE = /^~ \[From ["“”](.+?)["“”]\s*~\s*(.+?)\]$/;

/**
 * @typedef {{ index: number, title: string, collection: string }} ContentsPassage
 *   index: the paragraph the passage starts at; title / collection: its source line's parts.
 * @typedef {{ title: string, index: number, passages: ContentsPassage[] }} ContentsSection
 *   title: '' for the passages before the first heading; index: where the section starts.
 * @typedef {{ sections: ContentsSection[], passages: number }} Contents
 */

/**
 * @param {{ paragraphs?: Array<{ text?: string, align?: string }> } | null | undefined} entry
 * @returns {Contents}
 */
export function answersContents(entry) {
  const paras = (entry && Array.isArray(entry.paragraphs)) ? entry.paragraphs : [];
  /** @type {ContentsSection[]} */
  const sections = [];
  /** @type {ContentsSection | null} */
  let current = null;
  let start = -1;                 // the first paragraph of the passage being read
  let passages = 0;
  const section = () => {
    if (!current) { current = { title: '', index: 0, passages: [] }; sections.push(current); }
    return current;
  };
  paras.forEach((p, i) => {
    const text = p && typeof p.text === 'string' ? p.text.trim() : '';
    if (!text) return;
    const h = p.align === 'center' ? HEADING_RE.exec(text) : null;
    if (h) {
      current = { title: h[1].replace(/‗/g, '_').trim(), index: i, passages: [] };
      sections.push(current);
      start = -1;
      return;
    }
    if (isAttribution(text)) {
      const m = SOURCE_RE.exec(text);
      section().passages.push({
        index: start >= 0 ? start : i,
        title: m ? m[1] : '',
        collection: m ? m[2].trim() : '',
      });
      passages++;
      start = -1;
      return;
    }
    if (text === '✦') return;           // the excerpt divider belongs to no passage
    if (start < 0) start = i;
  });
  // A section that never reached a source line (prose only) keeps its place; an empty
  // untitled lead section (no paragraphs before the first heading) is dropped.
  return {
    sections: sections.filter((s) => s.title || s.passages.length),
    passages,
  };
}

/**
 * "5 sections · 54 passages", "54 passages", "1 passage" — the line under a topic's title.
 * Sections are counted only when the site names more than one.
 * @param {Contents} c
 * @returns {string}
 */
export function contentsSummary(c) {
  const named = c.sections.filter((s) => s.title).length;
  const p = c.passages === 1 ? '1 passage' : c.passages + ' passages';
  return named > 1 ? `${named} sections · ${p}` : p;
}

const HEADER_LINE_RE = /^_\d{1,2}\/\d{1,2}\/\d{2,4}_/;

/**
 * The words of the passage a source line closes: the body paragraphs between the previous
 * source line / heading / divider and `sourceIndex`, dated header lines left out, markers and
 * **bold** / _italic_ marks stripped, joined with spaces. The letter it came from lands on and
 * flashes these words when the reader taps the source (improvement sweep n5-01: the tap used to
 * open the letter at its top). '' when there is nothing to quote.
 * @param {Array<{ text?: string, align?: string }> | null | undefined} paragraphs
 * @param {number} sourceIndex the index of the "~ [From …]" paragraph
 * @returns {string}
 */
export function passageTextBefore(paragraphs, sourceIndex) {
  const paras = Array.isArray(paragraphs) ? paragraphs : [];
  const out = [];
  for (let i = sourceIndex - 1; i >= 0; i--) {
    const p = paras[i];
    const text = p && typeof p.text === 'string' ? p.text.trim() : '';
    if (!text) continue;
    if (isAttribution(text) || text === '✦' || (p.align === 'center' && HEADING_RE.test(text))) break;
    if (HEADER_LINE_RE.test(text)) continue;
    out.unshift(text);
  }
  return out.join(' ')
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/(^|[\s([“"'])_|_(?=[\s)\].,;:!?”"']|$)/g, '$1')
    .replace(/‗/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}
