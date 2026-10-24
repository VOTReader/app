/* resolveActiveContent — the book, chapter and letter App() is showing, out of app.jsx (n227: the file sits at
   its 800-line gate, tools/check-app-size.js). A plain function, not a hook: it reads the lazy corpora live on
   every render, which is what App() did inline. App() still calls useLazyBundles() first, so a corpus landing
   re-renders it and this resolves again.

   F3: only the ACTIVE letter's volume is resolved (screen -> its collection -> its array), never a scan of all
   collections. NOT memoized on letterId: colLetterArr reads the lazy VOT corpus live, so a cold-opened letter
   would freeze at null (the documented staleness trap). */
import { COL_BY_KEY, COL_BY_LETTER_SC, colLetterArr, colPreface } from '../data/scripture-resolution.js';

/**
 * @param {{ screen: string, bookId: string | null, chapterNum: number | null, letterId: string | null }} nav
 * @returns {{ book: any, chapter: any, findLetter: (volKey: string) => any, activeLetter: any, activeVolKey: string | null }}
 */
export function resolveActiveContent({ screen, bookId, chapterNum, letterId }) {
  const _MATTHEW = (typeof MATTHEW !== 'undefined') ? MATTHEW : null;
  const ALL_BOOKS = {
    ...(_MATTHEW ? { matthew: _MATTHEW } : {}),
    ...(typeof BOOKS !== 'undefined' ? BOOKS : {})
  };
  window.__ALL_BOOKS = ALL_BOOKS; // expose for parseScriptureRef()
  const book = bookId ? ALL_BOOKS[bookId] : null;
  const chapter = book && chapterNum != null ? book.chapters.find((/** @type {any} */ c) => c.num === chapterNum) : null;
  /** @param {string} volKey */
  const findLetter = (volKey) => {
    if (!letterId) return null;
    const col = COL_BY_KEY.get(volKey);
    const arr = colLetterArr(col), pref = colPreface(col);
    return arr.find((/** @type {any} */ l) => l.id === letterId) || (pref && pref.id === letterId ? pref : null);
  };
  const activeCol = letterId ? COL_BY_LETTER_SC.get(screen) : null;
  const activeVolKey = activeCol ? activeCol.volKey : null;
  const activeLetter = activeVolKey ? findLetter(activeVolKey) : null;
  return { book, chapter, findLetter, activeLetter, activeVolKey };
}
