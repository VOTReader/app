/* ═══════════════════════════════════════════════════════════════════════
   landing-mark — the landed sentence: where it is on screen, and its mark
   ═══════════════════════════════════════════════════════════════════════
   Scripture Web's "Open letter" lands on the citation's own block with its
   citing sentence (vot-citations endpointFor). The hub's seam walk (F1,
   2026-10-22) found it landing a screen early and unmarked: the block was
   centred, and in a long paragraph a sentence near its end sat under the
   bottom edge. The landing views (LetterView, WtlbEntryView) now find the
   sentence in the block's DOM text, centre a tall block on it, and paint it
   as ::highlight(vot-landing) until the landing fades. No DOM mutation, as
   with read-along's and find's marks (ReadAlongHighlight, FindInUnit).

   The sentence is in the search index's domain (whitespace squashed, no
   footnote numbers), so the walk skips `.fn-ref` text and squashes runs of
   whitespace as it maps each character back to its text node.
   ═══════════════════════════════════════════════════════════════════════ */

const HIGHLIGHT = 'vot-landing';

/** Heads tried when the whole sentence is not in the block's text, longest first (excerpt-landing's ladder). */
const HEADS = [40, 24, 12];

/**
 * The Range over `text` inside `el`, or null when it is not there (nor its
 * first 40, 24 or 12 characters).
 * @param {Element | null | undefined} el
 * @param {string | null | undefined} text  squashed, no footnote numbers
 * @returns {Range | null}
 */
export function landingRange(el, text) {
  const want = String(text || '').replace(/\s+/g, ' ').trim();
  if (!el || !want || typeof document === 'undefined') return null;
  /** @type {Array<[Text, number]>} */
  const at = [];
  let flat = '';
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = /** @type {Text | null} */ (walker.nextNode()); n; n = /** @type {Text | null} */ (walker.nextNode())) {
    if (n.parentElement && n.parentElement.closest('.fn-ref')) continue;
    const v = n.nodeValue || '';
    for (let i = 0; i < v.length; i++) {
      const space = /\s/.test(v[i]);
      if (space && (flat === '' || flat.endsWith(' '))) continue;
      flat += space ? ' ' : v[i];
      at.push([n, i]);
    }
  }
  let start = flat.indexOf(want);
  let len = want.length;
  for (let k = 0; start < 0 && k < HEADS.length; k++) {
    if (want.length <= HEADS[k]) continue;
    const head = want.slice(0, HEADS[k]).trim();
    start = flat.indexOf(head);
    len = head.length;
    // a head cut mid-word marks to the end of that word, never half of it
    if (start >= 0) while (start + len < flat.length && /[\p{L}\p{N}'’]/u.test(flat[start + len])) len++;
  }
  if (start < 0) return null;
  const end = Math.min(start + len, at.length) - 1;
  const r = document.createRange();
  r.setStart(at[start][0], at[start][1]);
  r.setEnd(at[end][0], at[end][1] + 1);
  return r;
}

/**
 * Bring a landed block into view: a block taller than most of the screen is
 * centred on the landed words, any other block on itself. The one-shot landing
 * scroll the views always made, aimed at the words.
 * @param {Element} el @param {Range | null} range @param {ScrollBehavior} [behavior]
 */
export function scrollLandingIntoView(el, range, behavior) {
  const sc = el.closest('.screen-scroll');
  const tall = !!(sc && range) && el.getBoundingClientRect().height > 0.6 * sc.clientHeight;
  const r = tall && range ? range.getBoundingClientRect() : null;
  if (!sc || !r || !r.height) { el.scrollIntoView({ behavior, block: 'center' }); return; }
  const top = sc.scrollTop + (r.top + r.height / 2) - (sc.getBoundingClientRect().top + sc.clientHeight / 2);
  sc.scrollTo({ top: Math.max(0, top), behavior });
}

/** @returns {any} the highlight registry, or null on an engine without one */
const registry = () => (typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function' ? CSS.highlights : null);

/** Paint the landed words (a later landing replaces an earlier one's). @param {Range | null} range */
export function markLanding(range) {
  const reg = registry();
  if (!reg || !range) return;
  reg.set(HIGHLIGHT, new Highlight(range));
}

/** Take the mark down: the landing has faded, or the view has gone. */
export function clearLanding() {
  const reg = registry();
  if (reg) reg.delete(HIGHLIGHT);
}
