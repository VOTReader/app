/* ═══════════════════════════════════════════════════════════════════════
   useTranslationLoader — the active edition's lazy load, and the sweep of the ones left behind
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   Lazy-loads the reader's translation. NKJV is always available (baked into
   BOOKS.chapters[].sections[].verses[].text); all others are ~4.5MB JS
   files loaded on demand. Extracted from App() on 2026-09-11 (w-evict-hook):
   boot-performance-4-evict grew the effect past the 800-line canary.

   OWNS:
     - the [translation] effect below, and nothing else.

   DOES NOT OWN:
     - loadTranslation / releaseTranslationsExcept — data/translations.js,
       published as bundle-d globals by ui/_entry-d.js and read here by bare
       name. NOT imported: an import would bundle a second copy of
       translations.js into bundle-b with its own _xlateCache and
       _translationLoaded, and the two copies would disagree about what is
       loaded. Same convention as GARDEN_DEFAULT_TIER in use-settings.js.
     - the tick state — App()'s useState; the setter is a PARAM.

   PARAMS:
     translation         settings.translation ('nkjv' when absent)
     setTranslationTick  App()'s setter; bumped after an alt edition lands so
                         translateVerse() starts returning the loaded text.
   ═══════════════════════════════════════════════════════════════════════ */

export const TRANSLATION_MISSING_TOAST_ID = 'vot-toast-translation-missing';

/** True when the edition's text never arrived (its bible-<code>.js global is absent). @param {string} code */
function translationMissing(code) {
  return typeof window !== 'undefined' && !(/** @type {any} */ (window))['BIBLE_' + code.toUpperCase()];
}

/** The edition's short label from TRANSLATION_OPTIONS (index.html), else its code in capitals. @param {string} code */
function translationLabel(code) {
  const opts = typeof TRANSLATION_OPTIONS !== 'undefined' ? TRANSLATION_OPTIONS : [];
  const opt = opts.find((o) => o.id === code);
  return (opt && opt.label) || code.toUpperCase();
}

/** @param {string} code */
function showMissingNotice(code) {
  if (typeof showToast !== 'function') return;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const label = translationLabel(code);
  showToast({
    id: TRANSLATION_MISSING_TOAST_ID, className: 'vot-toast', durationMs: 8000, ariaLive: 'assertive',
    text: offline
      ? label + ' isn’t on this phone yet, so the Bible shows NKJV for now. It downloads the next time you’re online.'
      : label + ' didn’t load, so the Bible shows NKJV for now. It tries again the next time the app opens.',
  });
}

function hideMissingNotice() {
  if (typeof hideToast === 'function') hideToast(TRANSLATION_MISSING_TOAST_ID);
}

/**
 * @param {string | undefined} translation
 * @param {(f: (v: number) => number) => void} setTranslationTick
 */
export function useTranslationLoader(translation, setTranslationTick) {
  // W25: the selection NOW, for a load that lands after the reader moved on.
  const selectedRef = React.useRef(translation || 'nkjv');
  selectedRef.current = translation || 'nkjv';
  React.useEffect(() => {
    const code = translation || 'nkjv';
    /* Free the editions this reader has left behind: each is a ~32 MB global and
       nothing else ever releases one. AFTER the new edition loads, never before,
       so a reader switching between two of them is not left staring at NKJV while
       the second download runs.

       Switching all the way back to NKJV frees every alt edition, which is why
       this effect no longer returns early on it — that is the one switch with the
       most to free, and it used to be the one that freed nothing. */
    // The helpers are bundle-d globals: a bundle-b render that runs without them
    // waits for the next switch rather than throwing (W25 refuter).
    if (typeof releaseTranslationsExcept !== 'function' || typeof loadTranslation !== 'function') return undefined;
    if (code === 'nkjv') { releaseTranslationsExcept('nkjv'); return undefined; }
    /* W25: sweep against the CURRENT selection, not the edition this load
       fetched. Picking ASV then WEB, with WEB landing first, ASV's late callback
       swept "everything but ASV" and freed BIBLE_WEB: the reader saw NKJV under
       WEB's label. Swept against WEB, the late ASV frees itself instead; only
       the live load re-renders. */
    let live = true;
    let retry = null;
    const load = () => loadTranslation(code).then(() => {
      releaseTranslationsExcept(selectedRef.current);
      if (!live) return;
      setTranslationTick((v) => v + 1);
      if (!translationMissing(code)) { hideMissingNotice(); return; }
      /* mw16 (seam walk O1): an edition picked offline before it was ever downloaded failed to
         load and the Bible silently showed NKJV under the reader's choice. Say so plainly, and
         load it the moment the connection is back. */
      showMissingNotice(code);
      if (!retry && typeof window !== 'undefined') {
        retry = () => { window.removeEventListener('online', retry); retry = null; if (live) load(); };
        window.addEventListener('online', retry);
      }
    });
    load();
    return () => { live = false; if (retry) window.removeEventListener('online', retry); };
  // The setter is in the deps for exhaustive-deps' sake; App()'s is a useState setter, so
  // it never changes and the effect runs on the translation alone, as it did inline.
  }, [translation, setTranslationTick]);
}
