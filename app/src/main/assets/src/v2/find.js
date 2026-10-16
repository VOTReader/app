/* find.js - Find in this page (mw7, v2-gaps 13; design dz15 1i; main's FindInUnit, given a field). The places a typed
   word or phrase stands in the page's reading blocks ([data-hl-key]: a letter's paragraphs, a chapter's verses), each
   marked in the text: the current one in 5c's gold wash (mark.qm), the others a faint gold underline (mark.qm2). A place
   starts a word and runs on to the end of what was typed ("more" finds "More" and "moreover", never "evermore"), its
   words in order across any spaces or line ends, as the reader's own search marks words. Footnote numbers, verse numbers
   and buttons are left out (main's FindInUnit SKIP). Every mark is find's own (mark.fm), so a search landing's marks and
   the reader's highlights are never touched; unmarkFind puts the text back as it was. */

/** What the walk leaves out: main's FindInUnit SKIP, and v2's verse numbers. */
export const FIND_SKIP = '.fn-ref, sup, button, svg, [aria-hidden="true"], script, style, .vn, .fnd';

/** More places than this are not marked (a one-letter word in a long chapter): the count still says how many. */
export const MARK_MAX = 400;

const esc = (/** @type {string} */ t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The pattern for what was typed, or null for nothing: case and apostrophes folded, any run of spaces between words.
 * @param {string} q @returns {RegExp | null}
 */
export function findPattern(q) {
  const words = String(q || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const body = words.map((w) => esc(w).replace(/['’‘]/g, "['’‘]")).join('[\\s\\u00a0]+');
  try { return new RegExp('(?<![\\p{L}\\p{N}])' + body, 'giu'); } catch (_e) { return null; }
}

/**
 * The page's searchable text: each reading block's text nodes in order, blocks parted by a line end (so no place runs
 * from one block's last word into the next one's first without a space).
 * @param {Element} root @returns {{ text: string, nodes: { node: Text, start: number }[] }}
 */
export function readText(root) {
  const doc = root.ownerDocument;
  /** @type {{ node: Text, start: number }[]} */
  const nodes = [];
  let text = '';
  let block = /** @type {Element | null} */ (null);
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */, {
    acceptNode: (n) => {
      const p = n.parentElement;
      if (!p || p.closest(FIND_SKIP) || !p.closest('[data-hl-key]')) return 2;
      return 1;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const p = /** @type {Element} */ (n.parentElement);
    // the outermost block: a verse inside a block of verses still runs on from the one before it
    let b = p.closest('[data-hl-key]');
    for (let up = b && b.parentElement ? b.parentElement.closest('[data-hl-key]') : null; up; up = up.parentElement ? up.parentElement.closest('[data-hl-key]') : null) b = up;
    if (block && b !== block) text += '\n';
    block = b;
    nodes.push({ node: /** @type {Text} */ (n), start: text.length });
    text += n.nodeValue || '';
  }
  return { text, nodes };
}

/** Where `q` stands in `text`: [start, end) pairs in order. @param {string} text @param {string} q */
export function placesIn(text, q) {
  const re = findPattern(q);
  if (!re) return [];
  /** @type {[number, number][]} */
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length) out.push([m.index, m.index + m[0].length]);
    else re.lastIndex++;
  }
  return out;
}

/** main's FindInUnit: a place's words lie within this many characters. */
const PLACE_LEN = 120;
const LETTER = /\p{L}/u;

/**
 * A search landing's places (main's FindInUnit over its `find.terms`): the search's own places, VotSearchMini.findPlaces,
 * the same runs a result card lists (the typed words, their other forms, the rarer word leading where the words never
 * meet), each hit run on to its word's end. null without main's search, so the field's words are found instead.
 * @param {string} text @param {string[]} terms @returns {[number, number][][] | null}
 */
export function termPlaces(text, terms, gl = /** @type {any} */ (globalThis)) {
  const sm = gl.VotSearchMini;
  if (!terms.length || !sm || typeof sm.findPlaces !== 'function') return null;
  const end = (/** @type {number} */ i) => { while (i < text.length && LETTER.test(text[i])) i++; return i; };
  return sm.findPlaces(text, terms, PLACE_LEN)
    .map((/** @type {{ hits: { idx: number, len: number }[] }} */ p) => p.hits.map((h) => /** @type {[number, number]} */ ([h.idx, end(h.idx + h.len)]))
      .sort((a, b) => a[0] - b[0]))
    .filter((/** @type {[number, number][]} */ runs) => runs.length);
}

/**
 * Marks each place of `q` in `root` (mark.fm.qm2) and returns them, one list of marks per place, in reading order. A
 * place that crosses an element (italics, a verse's end) is several marks; a search landing's place (`terms`, while the
 * field still holds the words it opened with) is each of its words.
 * @param {Element | null} root @param {string} q @param {string[] | null} [terms]
 * @returns {{ count: number, marks: HTMLElement[][] }}
 */
export function markFind(root, q, terms = null) {
  if (!root) return { count: 0, marks: [] };
  const { text, nodes } = readText(root);
  const places = (terms && terms.length ? termPlaces(text, terms) : null) || placesIn(text, q).map((r) => [r]);
  const shown = places.slice(0, MARK_MAX);
  const doc = root.ownerDocument;
  /** @type {HTMLElement[][]} */
  const marks = shown.map(() => []);
  // every run, the last first, so a split never moves a run still to be marked (a split keeps the text before it in its
  // node); a run that overlaps one already marked is left (two places never share a word)
  const runs = shown.flatMap((p, h) => p.map(([s, e]) => ({ h, s, e }))).sort((a, b) => b.s - a.s);
  let floor = Infinity;
  for (const { h, s, e } of runs) {
    if (e > floor) continue;
    floor = s;
    for (let k = nodes.length - 1; k >= 0; k--) {
      const { node, start } = nodes[k];
      const a = Math.max(s, start) - start;
      const b = Math.min(e, start + (node.nodeValue || '').length) - start;
      if (a >= b) continue;
      const r = doc.createRange();
      r.setStart(node, a);
      r.setEnd(node, b);
      const m = doc.createElement('mark');
      m.className = 'fm qm2';
      r.surroundContents(m);
      marks[h].unshift(m);
    }
  }
  return { count: places.length, marks };
}

/** The current place wears 5c's gold wash, the others the underline. @param {HTMLElement[][]} marks @param {number} cur */
export function showCurrent(marks, cur) {
  marks.forEach((list, i) => list.forEach((m) => { m.className = i === cur ? 'fm qm' : 'fm qm2'; }));
}

/** Takes find's marks out of `root`, its text as it was (split text nodes joined again). @param {Element | null} root */
export function unmarkFind(root) {
  if (!root) return;
  const marks = Array.from(root.querySelectorAll('mark.fm'));
  if (!marks.length) return;
  const parents = new Set();
  for (const m of marks) {
    if (m.parentNode) parents.add(m.parentNode);
    m.replaceWith(...Array.from(m.childNodes));
  }
  for (const p of parents) /** @type {Node} */ (p).normalize();
}

/** How many characters of `el`'s text come before `m` (footnote numbers left out, as search-landing.js counts). */
function textBefore(/** @type {Element} */ el, /** @type {Element} */ m) {
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* SHOW_TEXT */, {
    acceptNode: (n) => (n.parentElement && n.parentElement.closest('.fn-ref') ? 2 : 1),
  });
  let at = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (m.contains(n)) return at;
    at += (n.nodeValue || '').length;
  }
  return at;
}

/**
 * The place nearest a search landing in reading order: the first place at or after `off` characters into its block `el`
 * (the landed words: a place still running there counts), else after the block, else the last.
 * @param {HTMLElement[][]} marks @param {Element | null} el @param {number} [off]
 */
export function placeFrom(marks, el, off = 0) {
  if (!el || !marks.length) return 0;
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i][0];
    if (!m) continue;
    if (el !== m && el.contains(m)) {
      const last = marks[i][marks[i].length - 1];
      if (!off || textBefore(el, last) + (last.textContent || '').length > off) return i;
      continue;
    }
    if (el === m || (el.compareDocumentPosition(m) & 4 /* FOLLOWING */)) return i;
  }
  return marks.length - 1;
}
