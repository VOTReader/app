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

import { sharedPassageKey, publicPassageKey } from '../utils/passage-link.js';
import { buildSourceEndpoint } from '../utils/nav-index.js';
import { showToast } from '../utils/toast.js';

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
  openKey(win, key, navigateToLink);
  return key;
}

/**
 * Load the corpus that can resolve a public key, then jump there silently.
 * @param {any} win @param {string} key @param {(endpoint: any, meta?: any) => void} navigateToLink
 */
function openKey(win, key, navigateToLink) {
  const kind = key.split(':')[0];
  // n6-03: a first visit's first screen is the About welcome, and the corpus
  // can take seconds: say at once what is coming, and say it if it cannot.
  const toast = typeof win.showToast === 'function' ? win.showToast
    : (typeof showToast === 'function' ? showToast : null);
  /** @param {string} text @param {number} ms */
  const say = (text, ms) => {
    if (!toast) return;
    try { toast({ id: 'vot-toast-shared', className: 'vot-toast', text, durationMs: ms }); } catch (_e) { /* a toast never blocks the jump */ }
  };
  say('Opening the shared passage…', 4000);
  const go = () => {
    const ep = buildSourceEndpoint(key, null, null, null, null);
    let ok = !!ep;
    if (ep && ep.type === 'bible') {
      const b = books();
      const book = b && b[ep.bookId];
      ok = !!book && (book.chapters || []).some((c) => c && c.num === ep.chapter);
    } else if (ep && ep.type !== 'study' && !ep.screen) {
      ok = false;
    }
    if (!ok) { say('That shared passage could not be found.', 4000); return; }
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
}

/**
 * n6-15: the installed app opens shared links itself (an App Links VIEW filter,
 * MainActivity + SharedLink.kt). At a cold start it boots index.html?p=<key>
 * (openSharedPassage); when the app is already open it hands the key to the
 * running page here, so nothing reloads (a letter playing keeps playing).
 * True only when the key is a public passage key and is being opened.
 * @param {any} win @param {(endpoint: any, meta?: any) => void} navigateToLink
 */
export function installSharedPassageHook(win, navigateToLink) {
  win.__votOpenSharedPassage = (/** @type {unknown} */ k) => {
    const key = publicPassageKey(k);
    if (!key) return false;
    openKey(win, key, navigateToLink);
    return true;
  };
}

/**
 * @param {(endpoint: any, meta?: any) => void} navigateToLink  identity-stable (use-navigate-to-link.js)
 * @returns {void}
 */
export function useSharedPassageLink(navigateToLink) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, at boot; navigateToLink never changes identity
  React.useEffect(() => { installSharedPassageHook(window, navigateToLink); openSharedPassage(window, navigateToLink); }, []);
}
