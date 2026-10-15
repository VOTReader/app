/* search-landing.js - a search hit opens its letter where the words were found (v2-gaps 9; main sr10/sr11 lands its
   LetterView and WtlbEntryView on the sentence). The route's `excerpt` (search-facts.js hitRoute, cut as main's
   excerptAnchor cuts it) is found among the letter's blocks by main's own excerptLanding, in the search index's text
   (blockReadText; a Format B paragraph without its {{...}} tokens, as WtlbEntryView squashes it). In that block the words
   the result card marked are marked as the Bible page marks a verse hit (picture 5c: mark.qm); the page puts the one at
   the landing a third of the way down. Main's painter unwraps only its own mark.hl-dom, so these stay through a repaint. */
import { excerptLanding } from '../utils/excerpt-landing.js';
import { blockReadText } from '../utils/segment-dom-text.js';
import { highlightSpans } from '../search/snippet.js';
import { isFormatB } from './footnotes.js';

const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const squashB = (s) => squash(String(s || '').replace(/\{\{[^}]+\}\}/g, ' '));

/**
 * The block a hit lands on, by main's excerptLanding: `index` into the letter's blocks (or Format B paragraphs) and `off`,
 * where in that block's text the excerpt starts. -1 / -1 when no block holds it (the letter then opens at its top).
 * @param {any} letter @param {string | undefined} excerpt @param {string[]} [terms]
 * @returns {{ index: number, off: number }}
 */
export function landingOf(letter, excerpt, terms) {
  if (!letter || !excerpt) return { index: -1, off: -1 };
  const texts = isFormatB(letter)
    ? letter.paragraphs.map((p) => squashB(p && p.text))
    : (letter.blocks || []).map((b) => squash(blockReadText(b)));
  return excerptLanding(squash(excerpt), texts, terms && terms.length ? terms : undefined);
}

/**
 * Marks `terms` in `el`'s words (mark.qm; footnote numbers left alone) and returns the mark nearest `off` characters
 * into its text (the landing), else null when none of the words is there. A word already marked keeps its mark.
 * @param {Element | null} el @param {string[]} terms @param {number} off
 * @returns {HTMLElement | null}
 */
export function markWords(el, terms, off) {
  if (!el || !terms || !terms.length) return null;
  const doc = el.ownerDocument;
  /** @type {{ node: Text, start: number, was: HTMLElement | null }[]} */
  const nodes = [];
  let all = '';
  const walker = doc.createTreeWalker(el, 4 /* SHOW_TEXT */, {
    acceptNode: (n) => (n.parentElement && n.parentElement.closest('.fn-ref') ? 2 : 1),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const was = n.parentElement && /** @type {HTMLElement | null} */ (n.parentElement.closest('mark.qm'));
    nodes.push({ node: /** @type {Text} */ (n), start: all.length, was });
    all += n.nodeValue || '';
  }
  /** @type {[number, number][]} */
  const hits = [];
  let at = 0;
  for (const s of highlightSpans(all, terms)) {
    if (s.hit && s.text.trim()) hits.push([at, at + s.text.length]);
    at += s.text.length;
  }
  if (!hits.length) return null;
  // the last first, so a split never moves a place still to be marked (each split keeps the text before it in place)
  /** @type {{ start: number, mark: HTMLElement }[]} */
  const marks = [];
  for (let h = hits.length - 1; h >= 0; h--) {
    const [s, e] = hits[h];
    let first = null;
    for (let k = nodes.length - 1; k >= 0; k--) {
      const { node, start, was } = nodes[k];
      const a = Math.max(s, start) - start;
      const b = Math.min(e, start + (node.nodeValue || '').length) - start;
      if (a >= b) continue;
      if (was) { first = was; continue; }
      const r = doc.createRange();
      r.setStart(node, a);
      r.setEnd(node, b);
      const m = doc.createElement('mark');
      m.className = 'qm';
      r.surroundContents(m);
      first = m;
    }
    if (first) marks.push({ start: s, mark: first });
  }
  marks.sort((x, y) => Math.abs(x.start - off) - Math.abs(y.start - off) || x.start - y.start);
  return marks[0].mark;
}

/** Takes markWords' marks out of `el` again, its text as it was (one text node where the marks had split one). */
export function unmarkWords(el) {
  if (!el) return;
  for (const m of Array.from(el.querySelectorAll('mark.qm'))) m.replaceWith(...Array.from(m.childNodes));
  el.normalize();
}

/** The element that scrolls this page: the laptop's .main, or the phone's .content. */
function scrollerOf(el) {
  return el ? /** @type {HTMLElement | null} */ (el.closest('.main') || el.closest('.content')) : null;
}

/**
 * Scrolls the page so `el`'s line sits a third of the way down what shows between the top bar and the tab bar
 * (states.json 5c: "verse 3 a third of the way down"), on a whole-line row as the picture draws it (5c: line 6 of 16).
 * @param {HTMLElement | null} el
 */
export function placeAtThird(el) {
  const sc = scrollerOf(el);
  if (!el || !sc) return;
  const doc = el.ownerDocument;
  const s = sc.getBoundingClientRect();
  const bar = doc.querySelector('.tb');
  const tabs = doc.querySelector('.tabbar');
  const top = Math.max(s.top, bar ? bar.getBoundingClientRect().bottom : s.top);
  const bottom = Math.min(s.bottom, tabs ? tabs.getBoundingClientRect().top : s.bottom);
  const r = el.getBoundingClientRect();
  const mid = (r.top + r.bottom) / 2;
  // the lines run from the top of the paragraph, or of the verse when it is set on its own lines (the poetic books)
  const v = el.closest('.v');
  const p = v && getComputedStyle(v).display === 'block' ? v : el.closest('p');
  const L = p ? parseFloat(getComputedStyle(p).lineHeight) : NaN;
  if (!p || !Number.isFinite(L) || L <= 0) { sc.scrollTop += mid - (top + (bottom - top) / 3); return; }
  // the match's line box (the mark's own box sits off its line's centre), moved to the whole-line row a third of the way down
  const pTop = p.getBoundingClientRect().top;
  const line = pTop + Math.floor((mid - pTop) / L) * L;
  sc.scrollTop += line - (top + Math.floor((bottom - top) / 3 / L) * L);
}
