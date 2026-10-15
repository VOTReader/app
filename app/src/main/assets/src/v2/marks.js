/* marks.js - a letter paragraph's marks in v2 (picture 4b-mark-paragraph), written through main's own stores so nothing
   is migrated and a mark made in either app shows in both:
   - a highlight is one AnnotationStore record over the paragraph's words, the record main's selection toolbar writes
     (key letter:<id>:<block index>, start/end in the block's textContent, text in main's display form, colour by
     main's name); a paragraph's own colour is the newest highlight that covers all its words;
   - a note is main's NoteStore record on a mark's group (an existing mark gets the note; otherwise a new mark at main's
     note default, NoteDefaultStore: a blank highlight unless the reader chose otherwise);
   - Copy and Share a link say what main's do: utils/passage-copy.js (the quoted words, the letter and volume, its page
     on thevolumesoftruth.com) and utils/passage-link.js (the app's link), sent by utils/copy-share.js.
   Store access goes through `stores` arguments (the globals by default) so tests hand in fakes. */
import { passageCopy, quotedPassage } from '../utils/passage-copy.js';
import { withPassageLink } from '../utils/passage-link.js';
import { copyText, shareText } from '../utils/copy-share.js';
import { ANNOTATION_CHROME } from '../renderer/anchor-view.js';

const g = /** @type {any} */ (globalThis);

/** v2's five colours by main's names (main's ten onto v2's five is notes-facts.js kitColour). */
export const MAIN_COLOUR = { gold: 'yellow', sage: 'green', rose: 'pink', blue: 'blue', plum: 'purple' };

/** main's anchor for a letter block (utils/hl-keys.js letterHlKey): the index counts every block, headings too. */
export function paraKey(letterId, index) { return 'letter:' + letterId + ':' + index; }

/** main's word characters (annotation-engine snapRangeToWords): a mark begins and ends on a word. */
const WORD = /[\w’'-]/;

/** Where a block's words begin and end in its text (leading and trailing punctuation and spaces left out). @param {string} text */
export function wordSpan(text) {
  let start = 0;
  let end = text.length;
  while (start < end && !WORD.test(text[start])) start++;
  while (end > start && !WORD.test(text[end - 1])) end--;
  return { start, end };
}

/** True for a text node inside main's annotation chrome (footnote digits, icons). @param {Node} n @param {Element} root */
function inChrome(n, root) {
  for (let el = n.parentElement; el && el !== root; el = el.parentElement) if (el.matches(ANNOTATION_CHROME)) return true;
  return false;
}

/**
 * The words between two textContent offsets of `root` as main records a mark's text (SelectionToolbar hlDisplayText):
 * chrome left out, a line break where the words cross from one DIV / P into another (a poem's lines).
 * @param {Element} root @param {number} start @param {number} end
 */
export function displayText(root, start, end) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let off = 0;
  /** @type {Element | null} */
  let prevBlock = null;
  const parts = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    const len = (n.textContent || '').length;
    if (off + len > start && off < end && !inChrome(n, root)) {
      let block = n.parentElement;
      while (block && block !== root && block.tagName !== 'DIV' && block.tagName !== 'P') block = block.parentElement;
      if (prevBlock && block !== prevBlock) parts.push('\n');
      prevBlock = block;
      parts.push((n.textContent || '').slice(Math.max(0, start - off), Math.min(len, end - off)));
    }
    off += len;
  }
  return parts.join('');
}

/**
 * What the sheet needs to know about one block element on the page: its key, its words' span and their text.
 * @param {Element} el a [data-hl-key] block
 */
export function paragraphOf(el) {
  const key = el.getAttribute('data-hl-key') || '';
  const span = wordSpan(el.textContent || '');
  return { key, start: span.start, end: span.end, text: displayText(el, span.start, span.end) };
}

/** @typedef {{ key: string, start: number, end: number, text: string }} Para */

const isHighlight = (a) => !!a && (a.kind || 'highlight') === 'highlight' && !!a.color && a.color !== 'blank';
const newestFirst = (a, b) => (b.created || 0) - (a.created || 0);

/** The paragraph's own highlight: the newest that covers all its words, or null. @param {any[]} anns @param {Para} p */
export function paragraphMark(anns, p) {
  const hits = (anns || []).filter((a) => isHighlight(a) && a.start <= p.start && a.end >= p.end);
  return hits.sort(newestFirst)[0] || null;
}

/** The colour last used in this session (never stored: v2 writes no new keys), gold at first. */
let lastColour = 'gold';
export function lastUsedColour() { return lastColour; }
/** Tests: a fresh session. */
export function resetLastColour() { lastColour = 'gold'; }

/**
 * Highlights the paragraph in kit colour `kit`: recolours its own highlight (the whole group, as main's recolour does,
 * so a note on it stays), or adds one over its words.
 * @param {Para} p @param {string} kit @param {{ A?: any, newId?: () => string, now?: number }} [stores]
 * @returns {string} the group id
 */
export function markParagraph(p, kit, { A = g.AnnotationStore, newId = g.hlId, now = Date.now() } = {}) {
  const colour = MAIN_COLOUR[kit] || MAIN_COLOUR.gold;
  lastColour = MAIN_COLOUR[kit] ? kit : 'gold';
  const own = paragraphMark(A.get(p.key), p);
  if (own) {
    if (own.color !== colour) A.recolorGroup(own.groupId, colour);
    return own.groupId;
  }
  const id = newId();
  A.add(p.key, { id, groupId: id, kind: 'highlight', start: p.start, end: p.end, color: colour, text: p.text, created: now });
  return id;
}

/**
 * Takes the paragraph's own highlight off. A highlight that carries a note keeps the note: its colour goes to blank
 * (main's note with no visible mark), so no words the reader wrote are lost.
 * @param {Para} p @param {{ A?: any, N?: any }} [stores]
 */
export function unmarkParagraph(p, { A = g.AnnotationStore, N = g.NoteStore } = {}) {
  const own = paragraphMark(A.get(p.key), p);
  if (!own) return;
  if (N && N.get(own.groupId)) A.recolorGroup(own.groupId, 'blank');
  else A.removeGroup(own.groupId);
}

/**
 * The note "Add a note" opens: a note already on a mark covering the paragraph's words, else that mark (the note attaches
 * to it), else none yet (the editor makes the mark when the first words are written).
 * @param {Para} p @param {{ A?: any, N?: any }} [stores]
 * @returns {{ groupId: string | null, hasNote: boolean }}
 */
export function paragraphNote(p, { A = g.AnnotationStore, N = g.NoteStore } = {}) {
  const covering = (A.get(p.key) || []).filter((a) => a && a.groupId && a.start <= p.start && a.end >= p.end).sort(newestFirst);
  const noted = covering.find((a) => N && N.get(a.groupId));
  if (noted) return { groupId: noted.groupId, hasNote: true };
  const mark = covering.find((a) => (a.kind || 'highlight') !== 'note');
  return { groupId: mark ? mark.groupId : null, hasNote: false };
}

/**
 * Saves a note's words (main's NoteStore record: colour, fullText, keys, body), making its mark first when the paragraph
 * has none (main's note default style and colour). Returns the group id, for the next save.
 * @param {Para & { groupId: string | null }} target @param {string} body
 * @param {{ A?: any, N?: any, D?: any, newId?: () => string, now?: number, excerpt?: (s: string) => string }} [stores]
 */
export function saveNote(target, body, { A = g.AnnotationStore, N = g.NoteStore, D = g.NoteDefaultStore, newId = g.hlId,
  now = Date.now(), excerpt = g.normalizeExcerptDisplay } = {}) {
  let groupId = target.groupId;
  if (!groupId) {
    const def = D && typeof D.get === 'function' ? D.get() : { style: 'highlight', color: 'blank' };
    groupId = newId();
    A.add(target.key, { id: groupId, groupId, kind: def.style || 'highlight', start: target.start, end: target.end,
      color: def.color || 'blank', text: target.text, created: now });
  }
  const segs = A.getByGroup(groupId);
  const joined = segs.map((s) => s.ann.text || '').join(' … ') || target.text;
  N.set(groupId, {
    color: segs[0] ? segs[0].ann.color : 'blank',
    fullText: typeof excerpt === 'function' ? excerpt(joined) : joined,
    keys: [...new Set(segs.map((s) => s.key))],
    body,
  });
  return groupId;
}

/** A Range over the whole block. @param {Element} el */
function rangeOf(el) {
  const r = document.createRange();
  r.selectNodeContents(el);
  return r;
}

/** What Copy puts on the clipboard: main's passage copy of the whole block (quoted words, the letter, its site page). @param {Element} el */
export function copyTextOf(el) {
  const c = passageCopy(rangeOf(el));
  return c ? c.text : (el.textContent || '').trim();
}

/** The reader's Settings > Copy & Share > Share Includes: 'app' unless they chose the website's link (main's rule). */
function shareLinkSetting() {
  try {
    const s = g.StateStore && typeof g.StateStore.get === 'function' ? g.StateStore.get() : null;
    return s && s.settings && s.settings.shareLink === 'site' ? 'site' : 'app';
  } catch (_e) { return 'app'; }
}

/** What Share a link sends: the quoted words, the letter, and the app's link (or Copy's, with the website's). @param {Element} el */
export function shareTextOf(el, which = shareLinkSetting()) {
  const c = passageCopy(rangeOf(el));
  if (!c) return (el.textContent || '').trim();
  if (which === 'site' && c.link) return c.text;
  return withPassageLink(c.reference ? quotedPassage(c.body) : c.body, c.keys[0], c.reference || null);
}

/** What the page says after Copy / Share (main's words); '' says nothing. @param {string} outcome */
export function outcomeWords(outcome) {
  if (outcome === 'copied') return 'Copied';
  if (outcome === 'copied-instead') return 'Copied instead. Paste the passage where you want to share it.';
  if (outcome === 'failed') return "Couldn't copy. Select the words and copy them instead.";
  return '';
}

/** Copy, then the words to show. @param {Element} el @returns {Promise<string>} */
export function copyParagraph(el) {
  return copyText(copyTextOf(el)).then(outcomeWords);
}

/** Share a link, then the words to show. @param {Element} el @returns {Promise<string>} */
export function shareParagraph(el) {
  return shareText(shareTextOf(el)).then(outcomeWords);
}
