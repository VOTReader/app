/* ═══════════════════════════════════════════════════════════════════════
   bible-chapter-edges — a Bible chapter's book edges, pure (no module state)
   ═══════════════════════════════════════════════════════════════════════
   Split out of hooks/use-reading-chain-nav.js (bundles lane, 2026-11-26) so
   screen-routes.jsx (bundle-d) can draw a swipe neighbour's edges without
   bundling a second copy of that hook, which holds module state (the pending
   jump's cancel) and pulls in use-navigate-to-link's tab-action counter. A
   module bundled into both b and d must hold no state of its own
   (tools/check-bundle-state.js).
   ═══════════════════════════════════════════════════════════════════════ */
import { COL_BY_KEY, colLetterArr, colPreface } from '../data/scripture-resolution.js';

/**
 * A Bible chapter's own book edges, for the page and for a swipe neighbour drawn as it will be (TABS3): a first chapter
 * gets the previous book (BIBLE_BOOK_LIST order), a last chapter the next book, and Revelation's last the Volume One
 * bridge, named as the page that jump opens in its own hero's words (Volume One opens on its Preface; reading-flow
 * hunt, 2026-11-04; before the letters land only the volume is known).
 * @param {any} book @param {number} num
 * @returns {{ prevBook: any, nextBook: any, prevBoundaryTitle: null, nextBoundaryTitle: string | null }}
 */
export function bibleChapterEdges(book, num) {
  const list = typeof BIBLE_BOOK_LIST !== 'undefined' ? BIBLE_BOOK_LIST : [];
  const at = list.findIndex((/** @type {any} */ b) => b.id === book.id);
  const first = !book.chapters.find((/** @type {any} */ c) => c.num === num - 1);
  const last = !book.chapters.find((/** @type {any} */ c) => c.num === num + 1);
  const rev = last && book.id === 'revelation';
  let v1 = 'Volume One';
  if (rev) {
    const col = COL_BY_KEY.get('one');
    v1 = colPreface(col) ? 'Volume One · Preface' : colLetterArr(col).length > 0 ? 'Volume One · Letter 1' : 'Volume One';
  }
  return {
    prevBook: first && at > 0 ? list[at - 1] : null,
    nextBook: !last ? null : rev ? { title: 'Volume One', chapters: [{ num: 1 }] } : at >= 0 && at < list.length - 1 ? list[at + 1] : null,
    prevBoundaryTitle: null,
    nextBoundaryTitle: rev ? v1 : null,
  };
}
