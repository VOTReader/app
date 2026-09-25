/* ===================================================================
   useSharedPassageLink — open the passage a shared link names (A8, 2026-09-22)
   ===================================================================
   Global-scope module. Bundled into dist/bundle-b.js; App() calls it once,
   right after useNavigateToLink.

   A shared link is PUBLIC_APP_URL?p=<public key> (utils/passage-link.js).
   On the first render: read ?p=, take it off the address (a reload or Back
   must not replay it), load the corpus that can resolve the key, and hand
   navigateToLink a silent jump. Letters need the VOT corpus (and the Bible
   studies, whose chapters share as letter keys) before their screen is known
   (findEntryContext); a Bible key is checked against BOOKS
   so a link to a book or chapter that does not exist opens nothing. A key
   that resolves to nothing leaves the reader where the app restored them.
   =================================================================== */

import { sharedPassageKey } from '../utils/passage-link.js';
import { buildSourceEndpoint } from '../utils/nav-index.js';

/** @returns {any} */
function books() { return (typeof BOOKS !== 'undefined') ? BOOKS : null; }

/**
 * @param {any} win   window (injected for the tests)
 * @param {(endpoint: any, meta?: any) => void} navigateToLink
 * @returns {string | null} the key it is opening, or null
 */
export function openSharedPassage(win, navigateToLink) {
  const key = sharedPassageKey(win.location && win.location.search);
  if (!key) return null;
  try {
    const u = new URL(win.location.href);
    u.searchParams.delete('p');
    win.history.replaceState(win.history.state, '', u.pathname + u.search + u.hash);
  } catch (_e) { /* an address we cannot rewrite still opens the passage */ }
  const kind = key.split(':')[0];
  const go = () => {
    const ep = buildSourceEndpoint(key, null, null, null, null);
    if (!ep) return;
    if (ep.type === 'bible') {
      const b = books();
      const book = b && b[ep.bookId];
      if (!book || !(book.chapters || []).some((c) => c && c.num === ep.chapter)) return;
    } else if (ep.type !== 'study' && !ep.screen) {
      return;
    }
    navigateToLink(ep, { sourceLetterTitle: 'Shared passage', silent: true });
  };
  const load = kind === 'bible' ? win.__loadBibleCorpus
    : kind === 'study' ? win.__loadMatthewCorpus
      : win.__loadVotCorpus;
  /** @type {any[]} */
  const loads = [typeof load === 'function' ? load() : null];
  // n6-01: a Bible or Letter Study chapter shares as letter:<chapterId>:<n>,
  // and findEntryContext knows study chapters only once the studies are in.
  if (kind === 'letter') {
    const studies = typeof win.loadBibleStudies === 'function' ? win.loadBibleStudies
      : (typeof loadBibleStudies === 'function' ? loadBibleStudies : null);
    if (studies) loads.push(Promise.resolve().then(studies).catch(() => null));
  }
  Promise.all(loads).then(go, go);
  return key;
}

/**
 * @param {(endpoint: any, meta?: any) => void} navigateToLink  identity-stable (use-navigate-to-link.js)
 * @returns {void}
 */
export function useSharedPassageLink(navigateToLink) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, at boot; navigateToLink never changes identity
  React.useEffect(() => { openSharedPassage(window, navigateToLink); }, []);
}
